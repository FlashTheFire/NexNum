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
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Request, HTTPException, Query, Body, Depends
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field

# pyrefly: ignore [missing-import]
# pyrefly: ignore [missing-import]
from app.core.config import get_settings
# pyrefly: ignore [missing-import]
from app.crud.firebase_crud import get_all_sim_nodes
# pyrefly: ignore [missing-import]
from app.services.pattern_registry import ServicePatternRegistry, load_default_patterns
# pyrefly: ignore [missing-import]
from app.services.sms_parser import extract_otp_code
# pyrefly: ignore [missing-import]
from app.middleware.auth import verify_api_key

# pyrefly: ignore [missing-import]
from app.crud.firebase_crud import get_all_sim_nodes_async

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["Admin Panel"])
REDIS_PREFIX = "nexsms"


# ─── Pydantic Models ─────────────────────────────────────────────────────────

class PatternUpdatePayload(BaseModel):
    name: str = Field(..., description="Human readable service name")
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
            active_activations = await redis_client.scard(f"{REDIS_PREFIX}:active_ids")
            
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
    sim_nodes = await get_all_sim_nodes_async()
    
    try:
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager
    redis_client = await redis_manager.get_client()

    banned_set = set()
    if redis_client:
        try:
            banned_keys = await redis_client.keys(f"{REDIS_PREFIX}:banned:*")
            banned_set = {k.split(":")[-1] for k in banned_keys}
        except Exception:
            pass

    # Build response records
    all_devices = []
    for n in sim_nodes:
        is_banned = n.device_id in banned_set
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
            "isBanned": is_banned
        })

    # Search Filtering
    if search:
        s_lower = search.strip().lower()
        all_devices = [
            d for d in all_devices
            if s_lower in d["deviceId"].lower()
            or s_lower in d["phoneNumber"].lower()
            or s_lower in d["carrier"].lower()
            or s_lower in d["schemaType"].lower()
        ]

    # Column Sorting Logic
    reverse = sort_order.lower() == "desc"
    
    if sort_by == "status":
        all_devices.sort(key=lambda d: (
            1 if d["phoneNumber"] and d["phoneNumber"] not in ("Pending", "Unknown") else 0,
            1 if d["isOnline"] else 0,
            d["battery"]
        ), reverse=reverse)
    elif sort_by == "battery":
        all_devices.sort(key=lambda d: d["battery"], reverse=reverse)
    elif sort_by == "phoneNumber":
        all_devices.sort(key=lambda d: (
            1 if d["phoneNumber"] and d["phoneNumber"] not in ("Pending", "Unknown") else 0,
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
        all_devices.sort(key=lambda d: (1 if d["isOnline"] else 0, d["battery"]), reverse=True)

    total = len(all_devices)
    total_pages = max(1, math.ceil(total / limit)) if limit > 0 else 1
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit
    paginated_devices = all_devices[start_idx:end_idx]

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": total_pages,
        "count": len(paginated_devices),
        "devices": paginated_devices
    }


@router.post("/devices/{device_id}/ban", response_model=None, dependencies=[Depends(verify_api_key)])
async def ban_device(device_id: str):
    """Ban a device from number allocation."""
    try:
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
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager
    redis_client = await redis_manager.get_client()

    if not redis_client:
        return {"total": 0, "page": page, "limit": limit, "totalPages": 1, "count": 0, "activations": []}

    try:
        active_ids = await redis_client.smembers(f"{REDIS_PREFIX}:active_ids")
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
                await redis_client.srem(f"{REDIS_PREFIX}:active_ids", aid)

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
    """Returns all default and live pattern definitions for services."""
    defaults = load_default_patterns()
    return {"count": len(defaults), "patterns": defaults}


@router.post("/patterns/{service_code}", response_model=None, dependencies=[Depends(verify_api_key)])
async def update_pattern(service_code: str, payload: PatternUpdatePayload):
    """Updates pattern definition for a service live in Supabase and invalidates Redis cache."""
    try:
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager
    redis_client = await redis_manager.get_client()

    pattern_data = payload.dict()
    success = await ServicePatternRegistry.update_pattern(redis_client, service_code, pattern_data)
    if success:
        return {"status": "success", "serviceCode": service_code, "pattern": pattern_data}
    else:
        raise HTTPException(status_code=500, detail="Failed to update pattern in database.")


@router.post("/test-match", response_model=None, dependencies=[Depends(verify_api_key)])
async def test_pattern_match(payload: TestMatchPayload):
    """Real-World Live Pattern Sandbox: Tests SMS body & sender against live regex registry."""
    start_time = time.time()
    try:
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
