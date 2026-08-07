# app/api/v1/endpoints/admin.py
"""
Admin Command Center Gateway API Endpoints
Provides real-time metrics, device SIM inventory control, live activations monitoring,
and dynamic pattern matching sandbox.
"""

from __future__ import annotations

import time
import math
import json
import logging
import asyncio
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Request, HTTPException, Query, Body, Depends
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field

# pyrefly: ignore [missing-import]
from app.core.config import get_settings
# pyrefly: ignore [missing-import]
from app.crud import firebase_crud as crud
# pyrefly: ignore [missing-import]
from app.crud.firebase_crud import (
    get_all_sim_nodes,
    get_all_sim_nodes_async,
    get_incoming_messages,
    GLOBAL_PHONE_CACHE,
    parse_any_datetime_to_epoch_ms,
)
# pyrefly: ignore [missing-import]
from app.services.pattern_registry import ServicePatternRegistry, load_default_patterns
# pyrefly: ignore [missing-import]
from app.services.sms_parser import extract_otp_code
# pyrefly: ignore [missing-import]
from app.middleware.auth import verify_api_key

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["Admin Panel"])
REDIS_PREFIX = "nexsms"


# ─── Pydantic Models ─────────────────────────────────────────────────────────

class PatternUpdatePayload(BaseModel):
    name: str = Field(..., description="Human readable service name")
    price: Optional[float] = Field(default=15.0, description="Service base price in INR/USD")
    stock: Optional[int] = Field(default=100, description="Service real stock / available SIMs")
    stock_multiplier: Optional[float] = Field(default=2.0, description="Psychological stock scaling multiplier (e.g. 2.0x)")
    base_stock_boost: Optional[int] = Field(default=0, description="Additive base boost when real stock > 0")
    max_stock_cap: Optional[int] = Field(default=50000, description="Upper display stock cap")
    senders: List[str] = Field(default=[], description="List of sender string hints")
    sender_patterns: List[str] = Field(default=[], description="List of sender regex patterns")
    body_patterns: List[str] = Field(default=[], description="List of body regex patterns")
    otp_regex: Optional[str] = Field(default=None, description="Custom OTP extraction regex pattern")


class TestMatchPayload(BaseModel):
    serviceCode: str = Field(..., description="Service code (e.g. tg, wa, go)")
    sender: str = Field(default="", description="Sender ID or phone number")
    body: str = Field(..., description="Sample SMS body text")


# ─── 1. System Metrics & Stats ───────────────────────────────────────────────

@router.get("/stats", response_model=None, dependencies=[Depends(verify_api_key)])
async def get_system_stats():
    """Returns overview metrics: active activations, allocatable SIMs, Redis status."""
    try:
        # pyrefly: ignore [missing-import]
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager

    redis_client = await redis_manager.get_client()
    sim_nodes = await get_all_sim_nodes_async()

    online_count = sum(1 for n in sim_nodes if n.is_online)
    gateways_count = sum(1 for n in sim_nodes if n.schema_type == "silentgate")
    legacy_count = sum(1 for n in sim_nodes if n.schema_type == "legacy")

    active_activations = 0
    stream_length = 0

    if redis_client:
        try:
            active_activations = await redis_client.scard(f"{REDIS_PREFIX}:active_ids")  # type: ignore[misc]
            
            stream_info = await redis_client.xinfo_stream(settings.REDIS_STREAM_INBOUND)
            stream_length = stream_info.get("length", 0)
        except Exception:
            pass

    return {
        "status": "healthy",
        "timestamp": int(time.time()),
        "sim_nodes": {
            "total_allocatable": len(sim_nodes),
            "online": online_count,
            "offline": len(sim_nodes) - online_count,
            "gateways_schema": gateways_count,
            "legacy_schema": legacy_count
        },
        "activations": {
            "active_in_redis": active_activations
        },
        "stream": {
            "name": settings.REDIS_STREAM_INBOUND,
            "backlog_length": stream_length,
            "workers_configured": settings.INBOUND_WORKER_COUNT
        }
    }


# ─── 2. Device & SIM Management ───────────────────────────────────────────────

@router.get("/devices", response_model=None, dependencies=[Depends(verify_api_key)])
async def get_devices_list(
    page: int = Query(default=1, ge=1, description="Page number (1-based)"),
    limit: int = Query(default=25, ge=1, le=500, description="Items per page"),
    sort_by: str = Query(default="status", description="Field to sort by: status, battery, phoneNumber, deviceId, carrier, schemaType, isBanned"),
    sort_order: str = Query(default="desc", description="Sort direction: asc or desc"),
    search: str = Query(default="", description="Search query string for device ID, phone number, or carrier")
):
    """Returns normalized DeviceSimNodes with server-side sorting, search filtering, and pagination."""
    try:
        # pyrefly: ignore [missing-import]
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager
    redis_client = await redis_manager.get_client()

    cache_key = f"{REDIS_PREFIX}:cache:admin_devices:{page}:{limit}:{sort_by}:{sort_order}:{search.strip().lower()}"
    if redis_client:
        try:
            cached_res = await redis_client.get(cache_key)
            if cached_res:
                return json.loads(cached_res)
        except Exception:
            pass

    sim_nodes = await get_all_sim_nodes_async()

    banned_set = set()
    if redis_client:
        try:
            banned_keys = await redis_client.keys(f"{REDIS_PREFIX}:banned:*")
            banned_set = {k.split(":")[-1] for k in banned_keys}
        except Exception:
            pass

    # ── Bulk-check which devices have cached messages in Redis ──────────────
    has_messages_set: set = set()
    if redis_client:
        try:
            pipe = redis_client.pipeline()
            for n in sim_nodes:
                clean_phone = n.phone_number.replace("+", "").strip() if n.phone_number else ""
                pipe.exists(f"{REDIS_PREFIX}:device_messages:{n.device_id}")
                pipe.exists(f"{REDIS_PREFIX}:device_messages:{n.phone_number}")
                pipe.exists(f"{REDIS_PREFIX}:device_messages:{clean_phone}")
                pipe.exists(f"{REDIS_PREFIX}:device_no_messages:{n.device_id}")
            msg_results = await pipe.execute()

            idx = 0
            for n in sim_nodes:
                ex_dev = bool(msg_results[idx])
                ex_phone = bool(msg_results[idx + 1])
                ex_cphone = bool(msg_results[idx + 2])
                ex_nomsg = bool(msg_results[idx + 3])
                idx += 4

                if ex_dev or ex_phone or ex_cphone:
                    has_messages_set.add(n.device_id)
                elif not ex_nomsg and n.phone_number and n.phone_number not in ("Pending", "Unknown", ""):
                    has_messages_set.add(n.device_id)
        except Exception:
            pass

    # Build response records
    all_devices = []
    for n in sim_nodes:
        is_banned = n.device_id in banned_set
        has_real_phone = bool(
            n.phone_number and n.phone_number not in ("Pending", "Unknown", "")
        )
        has_msgs = n.device_id in has_messages_set
        all_devices.append({
            "deviceId": n.device_id,
            "simSlot": n.sim_slot,
            "phoneNumber": n.phone_number,
            "carrier": n.carrier,
            "schemaType": n.schema_type,
            "isOnline": n.is_online,
            "battery": n.battery if n.battery is not None else 100,
            "lastSeenMs": n.last_seen_ms,
            "firebaseNodeId": n.firebase_node_id,
            "isBanned": is_banned,
            "hasMessages": has_msgs,
            # Internal-only: used for tier sort, not returned to client
            "_hasRealPhone": has_real_phone,
        })

    # Search Filtering
    if search:
        s_lower = search.strip().lower()
        all_devices = [
            d for d in all_devices
            if s_lower in str(d["deviceId"]).lower()
            or s_lower in str(d["phoneNumber"]).lower()
            or s_lower in str(d["carrier"]).lower()
            or s_lower in str(d["schemaType"]).lower()
        ]

    # ── Professional Tier-Based Sort ────────────────────────────────────────
    # Tier 5 (TOP): Online + Real phone + Has messages  → fully operational
    # Tier 4:       Online + Real phone + No messages   → active but un-analyzed
    # Tier 3:       Offline + Real phone + Has messages → verified, dormant
    # Tier 2:       Any + Pending/Unknown phone         → number not yet resolved
    # Tier 1 (BOTTOM): Offline + No phone + No messages → empty/new device
    def _device_tier(d: dict) -> int:
        online = d["isOnline"]
        real_phone = d["_hasRealPhone"]
        has_msg = d["hasMessages"]
        if online and real_phone and has_msg:
            return 5
        if online and real_phone and not has_msg:
            return 4
        if not online and real_phone and has_msg:
            return 3
        if real_phone and not has_msg:
            return 2
        return 1

    reverse = sort_order.lower() == "desc"

    if sort_by == "status":
        # Primary: tier desc → Secondary: lastSeenMs desc (most recent first within tier)
        all_devices.sort(
            key=lambda d: (_device_tier(d), d["lastSeenMs"], d["battery"]),
            reverse=True
        )
    elif sort_by == "battery":
        all_devices.sort(key=lambda d: d["battery"], reverse=reverse)
    elif sort_by in ("lastSeenMs", "lastMessage", "lastMessageTime"):
        all_devices.sort(key=lambda d: d.get("lastSeenMs", 0), reverse=reverse)
    elif sort_by == "phoneNumber":
        all_devices.sort(key=lambda d: (
            1 if d["_hasRealPhone"] else 0,
            d["phoneNumber"]
        ), reverse=reverse)
    elif sort_by == "deviceId":
        all_devices.sort(key=lambda d: d["deviceId"], reverse=reverse)
    elif sort_by == "carrier":
        all_devices.sort(key=lambda d: d["carrier"], reverse=reverse)
    elif sort_by == "schemaType":
        all_devices.sort(key=lambda d: d["schemaType"], reverse=reverse)
    elif sort_by == "isBanned" or sort_by == "actions":
        all_devices.sort(key=lambda d: 1 if d["isBanned"] else 0, reverse=reverse)
    else:
        # Default: tier-based
        all_devices.sort(
            key=lambda d: (_device_tier(d), d["lastSeenMs"]),
            reverse=True
        )

    # Strip internal-only fields before returning
    for d in all_devices:
        d.pop("_hasRealPhone", None)

    total = len(all_devices)
    total_pages = max(1, math.ceil(total / limit)) if limit > 0 else 1
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_devices = all_devices[start_idx:end_idx]

    res_dict = {
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": total_pages,
        "count": len(paginated_devices),
        "devices": paginated_devices
    }
    if redis_client:
        try:
            await redis_client.set(cache_key, json.dumps(res_dict), ex=4)
        except Exception:
            pass

    return res_dict


@router.get("/devices/{device_id}/messages", response_model=None, dependencies=[Depends(verify_api_key)])
async def get_device_messages(
    device_id: str,
    page: int = Query(default=1, ge=1, description="Page number for pagination"),
    limit: int = Query(default=25, ge=1, le=500, description="Max messages per page"),
    search: Optional[str] = Query(default=None, description="Search query filter across body and sender")
):
    """
    Fetch last incoming SMS messages for a specific device / SIM from Firebase RTDB.
    Uses Redis 0ms caching layer with fallback to parallel multi-identifier key lookup.
    Supports server-side search filtering and pagination.
    """
    try:
        # pyrefly: ignore [missing-import]
        from utils.redis_manager import redis_manager
        redis_client = await redis_manager.get_client()
    except Exception:
        try:
            from bot_project.utils.redis_manager import redis_manager
            redis_client = await redis_manager.get_client()
        except Exception:
            redis_client = None

    cache_key = f"nexsms:device_messages:{device_id}"

    # 0. Clear negative cache — user explicitly requested messages
    if redis_client:
        try:
            await redis_client.delete(f"{REDIS_PREFIX}:device_no_messages:{device_id}")
        except Exception:
            pass

    cached_all: Optional[List[dict]] = None
    # 1. Check Redis Cache for 0ms Instant Response
    if redis_client:
        try:
            cached_data = await redis_client.get(cache_key)
            if cached_data:
                parsed = json.loads(cached_data)
                if isinstance(parsed, list) and len(parsed) > 0:
                    cached_all = parsed
        except Exception:
            pass

    if cached_all is None:
        # 2. Fast Multi-Path Query (also tries phone number variants from GLOBAL_PHONE_CACHE)
        try:
            raw_msgs = get_incoming_messages(device_id, limit=150)
        except Exception as e:
            logger.error(f"Failed to fetch incoming messages for {device_id}: {e}")
            raw_msgs = []

        # 2b. If empty, try alternate keys from phone cache
        if not raw_msgs:
            try:
                if device_id in GLOBAL_PHONE_CACHE:
                    alt_phone = GLOBAL_PHONE_CACHE[device_id].get("mobNo", "")
                    if alt_phone:
                        raw_msgs = get_incoming_messages(alt_phone, limit=150)
            except Exception:
                pass

        formatted_messages = []
        for msg in raw_msgs:
            if not isinstance(msg, dict):
                continue
            
            body_text = str(msg.get("message") or msg.get("body") or msg.get("text") or "")
            sender = str(msg.get("sender") or msg.get("from") or msg.get("service") or "Unknown")
            otp = extract_otp_code(body_text)

            # Parse timestamp safely to epoch milliseconds
            try:
                ts_val = parse_any_datetime_to_epoch_ms(msg)
            except Exception:
                ts_val = 0
            date_time_str = str(msg.get("dateTime") or msg.get("datetime") or msg.get("date_time") or "")

            formatted_messages.append({
                "id": str(msg.get("id", "")),
                "sender": sender,
                "message": body_text,
                "timestamp": ts_val,
                "dateTime": date_time_str,
                "otp": otp,
                "service": msg.get("service") or sender
            })

        # Sort descending (newest message first)
        formatted_messages.sort(key=lambda m: m["timestamp"], reverse=True)
        cached_all = formatted_messages

        # 3. Save to Redis Cache (600s TTL)
        if redis_client and cached_all:
            try:
                msg_json = json.dumps(cached_all)
                pipe = redis_client.pipeline()
                pipe.delete(f"{REDIS_PREFIX}:device_no_messages:{device_id}")
                pipe.set(cache_key, msg_json, ex=600)
                pipe.set(f"{REDIS_PREFIX}:device_messages:{device_id}", msg_json, ex=600)
                await pipe.execute()
            except Exception:
                pass

    all_messages = cached_all or []

    # Optional search filtering
    if search:
        s_lower = search.strip().lower()
        all_messages = [
            m for m in all_messages
            if s_lower in str(m.get("message", "")).lower() or s_lower in str(m.get("sender", "")).lower() or s_lower in str(m.get("otp", "")).lower()
        ]

    total = len(all_messages)
    total_pages = max(1, math.ceil(total / limit)) if limit > 0 else 1
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_msgs = all_messages[start_idx:end_idx]

    return {
        "deviceId": device_id,
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": total_pages,
        "count": len(paginated_msgs),
        "messages": paginated_msgs,
        "source": "cache" if cached_all is not None else "live"
    }


@router.post("/devices/{device_id}/ban", response_model=None, dependencies=[Depends(verify_api_key)])
async def ban_device(device_id: str):
    """Ban a device from number allocation."""
    try:
        # pyrefly: ignore [missing-import]
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager
    redis_client = await redis_manager.get_client()

    if redis_client:
        await redis_client.set(f"{REDIS_PREFIX}:banned:{device_id}", "1")
    return {"status": "banned", "deviceId": device_id}


@router.post("/devices/{device_id}/unban", response_model=None, dependencies=[Depends(verify_api_key)])
async def unban_device(device_id: str):
    """Unban a device."""
    try:
        # pyrefly: ignore [missing-import]
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager
    redis_client = await redis_manager.get_client()

    if redis_client:
        await redis_client.delete(f"{REDIS_PREFIX}:banned:{device_id}")
    return {"status": "unbanned", "deviceId": device_id}


# ─── 3. Activations Monitor ───────────────────────────────────────────────────

@router.get("/activations", response_model=None, dependencies=[Depends(verify_api_key)])
async def get_active_activations(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=500),
    sort_by: str = Query(default="created"),
    sort_order: str = Query(default="desc"),
    search: str = Query(default="")
):
    """Returns all active activations stored in Redis with sorting and pagination."""
    try:
        # pyrefly: ignore [missing-import]
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager
    redis_client = await redis_manager.get_client()

    if not redis_client:
        return {"total": 0, "page": page, "limit": limit, "totalPages": 1, "count": 0, "activations": []}

    try:
        active_ids = await redis_client.smembers(f"{REDIS_PREFIX}:active_ids")  # type: ignore[misc]
        if not active_ids:
            return {"total": 0, "page": page, "limit": limit, "totalPages": 1, "count": 0, "activations": []}

        keys = [f"{REDIS_PREFIX}:activation:{aid}" for aid in active_ids]
        pipe = redis_client.pipeline()
        for k in keys:
            pipe.get(k)
        results = await pipe.execute()

        activations = []
        now = time.time()
        for aid, v in zip(active_ids, results):
            if v:
                try:
                    data = json.loads(v)
                    created = data.get("created", now)
                    data["elapsedSeconds"] = round(now - created, 1)
                    activations.append(data)
                except Exception:
                    pass
            else:
                await redis_client.srem(f"{REDIS_PREFIX}:active_ids", aid)  # type: ignore[misc]

        # Search filter
        if search:
            s_lower = search.strip().lower()
            activations = [
                a for a in activations
                if s_lower in str(a.get("id", "")).lower()
                or s_lower in str(a.get("number", "")).lower()
                or s_lower in str(a.get("service", "")).lower()
                or s_lower in str(a.get("status", "")).lower()
            ]

        # Sort
        reverse = sort_order.lower() == "desc"
        if sort_by == "elapsedSeconds":
            activations.sort(key=lambda a: a.get("elapsedSeconds", 0), reverse=reverse)
        elif sort_by == "status":
            activations.sort(key=lambda a: str(a.get("status", "")), reverse=reverse)
        elif sort_by == "service":
            activations.sort(key=lambda a: str(a.get("service", "")), reverse=reverse)
        elif sort_by == "number":
            activations.sort(key=lambda a: str(a.get("number", "")), reverse=reverse)
        else:
            activations.sort(key=lambda a: a.get("created", 0), reverse=reverse)

        total = len(activations)
        total_pages = max(1, math.ceil(total / limit)) if limit > 0 else 1
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated = activations[start_idx:end_idx]

        return {
            "total": total,
            "page": page,
            "limit": limit,
            "totalPages": total_pages,
            "count": len(paginated),
            "activations": paginated
        }

    except Exception as e:
        logger.error(f"Error fetching activations in admin API: {e}")
        return {"total": 0, "page": page, "limit": limit, "totalPages": 1, "count": 0, "activations": []}


# ─── 4. Dynamic Patterns Sandbox & Management ────────────────────────────────

@router.get("/patterns", response_model=None, dependencies=[Depends(verify_api_key)])
async def get_all_patterns():
    """Returns all default and live pattern definitions with real and psychological display stock."""
    # pyrefly: ignore [missing-import]
    from app.services.stock_scaler import StockScaler
    defaults = load_default_patterns()
    enriched = {}
    for code, info in defaults.items():
        fleet = StockScaler.compute_fleet_service_stock(
            service_code=code,
            real_online_sims=10,
            pattern_data=info
        )
        enriched[code] = {
            **info,
            "real_stock": fleet["real_stock"],
            "display_stock": fleet["display_stock"],
            "stock_multiplier": fleet["multiplier"],
            "is_out_of_stock": fleet["is_out_of_stock"]
        }
    return {"count": len(enriched), "patterns": enriched}


@router.post("/patterns/{service_code}", response_model=None, dependencies=[Depends(verify_api_key)])
async def update_pattern(service_code: str, payload: PatternUpdatePayload):
    """Updates pattern definition for a service live in Supabase and invalidates Redis cache."""
    try:
        # pyrefly: ignore [missing-import]
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager
    redis_client = await redis_manager.get_client()

    pattern_data = payload.model_dump()
    success = await ServicePatternRegistry.update_pattern(redis_client, service_code, pattern_data)
    if success:
        return {"status": "success", "serviceCode": service_code, "pattern": pattern_data}
    else:
        raise HTTPException(status_code=500, detail="Failed to update pattern in database.")


@router.delete("/patterns/{service_code}", response_model=None, dependencies=[Depends(verify_api_key)])
async def delete_pattern_endpoint(service_code: str):
    """Deletes pattern definition for a service live from disk, Redis cache, and Supabase."""
    try:
        # pyrefly: ignore [missing-import]
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager
    redis_client = await redis_manager.get_client()

    success = await ServicePatternRegistry.delete_pattern(redis_client, service_code)
    if success:
        return {"status": "success", "serviceCode": service_code}
    else:
        raise HTTPException(status_code=400, detail="Cannot delete default fallback service 'ot'.")


@router.post("/test-match", response_model=None, dependencies=[Depends(verify_api_key)])
async def test_pattern_match(payload: TestMatchPayload):
    """Real-World Live Pattern Sandbox: Tests SMS body & sender against live regex registry."""
    start_time = time.time()
    try:
        # pyrefly: ignore [missing-import]
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager
    redis_client = await redis_manager.get_client()

    matched, code, details = await ServicePatternRegistry.match_sms_dynamic(
        redis_client, payload.body, payload.sender, payload.serviceCode
    )
    exec_time_ms = round((time.time() - start_time) * 1000, 2)

    return {
        "serviceCode": payload.serviceCode,
        "matchedServiceCode": details.get("matchedServiceCode", payload.serviceCode),
        "serviceName": details.get("serviceName", payload.serviceCode.upper()),
        "sender": payload.sender,
        "body": payload.body,
        "isMatched": matched,
        "extractedCode": code,
        "matchedSenderPattern": details.get("matchedSenderPattern"),
        "matchedBodyPattern": details.get("matchedBodyPattern"),
        "otpRegex": details.get("otpRegex"),
        "executionTimeMs": exec_time_ms,
        "timestamp": int(time.time())
    }


# ─── 5. Real-Time Scorer Leaderboard & Allocation Queue ───────────────────────

@router.get("/scorer/leaderboard", response_model=None, dependencies=[Depends(verify_api_key)])
async def get_scorer_leaderboard(
    service: str = Query("tg", description="Service code to score against (e.g. tg, wa, go, any, all)"),
    user_id: str = Query("", description="Optional user ID for cooldown checking"),
    limit: int = Query(50, ge=1, le=200, description="Max ranked candidates to return")
):
    """
    Returns real-time point score leaderboard across all SIM nodes for a requested service.
    Rank #1 is the exact next number that will be occupied/allocated!
    """
    import asyncio
    try:
        # pyrefly: ignore [missing-import]
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager

    # pyrefly: ignore [missing-import]
    from app.gateway.scorer import DeviceScorer

    redis_client = await redis_manager.get_client()
    sim_nodes = await get_all_sim_nodes_async()

    now = time.time()
    req_svc = (service or "tg").lower()

    try:
        # pyrefly: ignore [missing-import]
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager

    redis_client = await redis_manager.get_client()

    cache_key = f"{REDIS_PREFIX}:cache:scorer_leaderboard:{req_svc}:{user_id}:{limit}"
    if redis_client:
        try:
            cached_res = await redis_client.get(cache_key)
            if cached_res:
                return json.loads(cached_res)
        except Exception:
            pass

    # pyrefly: ignore [missing-import]
    from app.gateway.scorer import DeviceScorer

    # Sort nodes to prioritize online and recently seen SIMs first
    sim_nodes_sorted = sorted(sim_nodes, key=lambda n: (getattr(n, 'is_online', False), getattr(n, 'last_seen_ms', 0)), reverse=True)
    candidates_to_score = sim_nodes_sorted[:250] if len(sim_nodes_sorted) > 250 else sim_nodes_sorted

    scored_candidates = await asyncio.gather(*[
        DeviceScorer.score_sim_node(
            redis_client=redis_client,
            node=node,
            service=req_svc,
            user_id=user_id,
            now=now,
            effective_cooldown_sec=1200.0
        )
        for node in candidates_to_score
    ])

    scored_items = []
    for node, candidate in zip(candidates_to_score, scored_candidates):

        last_seen_sec = node.last_seen_ms / 1000 if node.last_seen_ms > 1e11 else node.last_seen_ms
        mins_since_seen = max(0.0, (now - last_seen_sec) / 60.0)
        hours_since_seen = mins_since_seen / 60.0
        has_messages = candidate.has_messages

        hrs_sms = candidate.last_sms_hours
        last_sms_ms = int((now - (hrs_sms * 3600.0)) * 1000) if hrs_sms < 900 else 0

        # ── Freshness Breakdown (Data-Poor vs Genuinely Fresh) ─────────────
        if not has_messages:
            freshness_label = "NO_DATA"
            freshness_pts = -50
        elif candidate.service_sms_count == 0:
            freshness_label = "FRESH"
            freshness_pts = 100
        else:
            freshness_label = "USED"
            freshness_pts = -(candidate.service_sms_count * 25)

        # ── 12-Hour SMS Recency Breakdown ──────────────────────────────────
        if hrs_sms <= 1.0:
            recency_pts = 60
            recency_label = "< 1h"
        elif hrs_sms <= 3.0:
            recency_pts = 40
            recency_label = "< 3h"
        elif hrs_sms <= 6.0:
            recency_pts = 20
            recency_label = "< 6h"
        elif hrs_sms <= 12.0:
            recency_pts = 10
            recency_label = "< 12h"
        else:
            recency_pts = -9999
            recency_label = "> 12h (EXCLUDED)"

        online_pts = 30 if node.is_online else 0
        batt_pts = 10 if node.battery >= 70 else (-20 if node.battery < 15 else 0)

        is_cooldown = candidate.score == -9999
        if is_cooldown:
            status_label = "COOLDOWN"
        elif node.is_online:
            status_label = "ONLINE"
        else:
            status_label = "OFFLINE"

        scored_items.append({
            "deviceId": node.device_id,
            "simSlot": node.sim_slot,
            "phoneNumber": node.phone_number,
            "carrier": node.carrier,
            "isOnline": node.is_online,
            "battery": node.battery,
            "lastSeenMs": node.last_seen_ms,
            "lastSmsMs": last_sms_ms,
            "lastSmsHours": round(hrs_sms, 2),
            "schemaType": node.schema_type,
            "firebaseNodeId": node.firebase_node_id,
            "hasMessages": has_messages,
            "score": candidate.score,
            "serviceSmsCount": candidate.service_sms_count,
            "minsSinceSeen": round(mins_since_seen, 1),
            "hoursSinceSeen": round(hours_since_seen, 2),
            "isCooldown": is_cooldown,
            "statusLabel": status_label,
            "breakdown": {
                "freshnessLabel": freshness_label,
                "freshnessBonus": freshness_pts,
                "recencyLabel": recency_label,
                "recencyScore": recency_pts,
                "onlineBonus": online_pts,
                "batteryBonus": batt_pts,
                "totalComponents": freshness_pts + recency_pts + online_pts + batt_pts
            }
        })

    # Sort descending by score (highest score = Rank #1)
    scored_items.sort(key=lambda x: (x["score"], x["isOnline"], x["battery"]), reverse=True)

    # Assign 1-based ranks
    for idx, item in enumerate(scored_items):
        item["rank"] = idx + 1
        if idx == 0 and not item["isCooldown"]:
            item["allocationTier"] = "TOP_PICK"
        elif not item["isCooldown"]:
            item["allocationTier"] = "READY"
        else:
            item["allocationTier"] = "COOLDOWN"

    top_results = scored_items[:limit]

    res_dict = {
        "service": req_svc,
        "serviceName": req_svc.upper(),
        "totalNodes": len(sim_nodes),
        "totalRanked": len(scored_items),
        "topPick": top_results[0] if top_results and not top_results[0]["isCooldown"] else None,
        "leaderboard": top_results,
        "timestamp": int(now)
    }

    if redis_client:
        try:
            await redis_client.set(cache_key, json.dumps(res_dict), ex=3)
        except Exception:
            pass

    return res_dict
