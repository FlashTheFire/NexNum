# app/api/v1/endpoints/admin.py
"""
Admin Command Center Gateway API Endpoints
Provides real-time metrics, device SIM inventory control, live activations monitoring,
and dynamic pattern matching sandbox.
"""

from __future__ import annotations

import time
import json
import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Request, HTTPException, Query, Body, Depends
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.crud.firebase_crud import get_all_sim_nodes
from app.services.pattern_registry import ServicePatternRegistry, load_default_patterns
from app.services.sms_parser import extract_otp_code, match_sms_to_service
from app.middleware.auth import verify_api_key

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
async def get_devices_list():
    """Returns all normalized DeviceSimNodes with status, carrier, battery, and last seen."""
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

    # Sort: Resolved numbers first -> Online devices next -> Higher battery first
    sim_nodes.sort(key=lambda n: (
        1 if n.phone_number and n.phone_number not in ("Pending", "Unknown") else 0,
        1 if n.is_online else 0,
        n.battery or 0
    ), reverse=True)

    result = []
    for n in sim_nodes:
        result.append({
            "deviceId": n.device_id,
            "simSlot": n.sim_slot,
            "phoneNumber": n.phone_number,
            "carrier": n.carrier,
            "schemaType": n.schema_type,
            "isOnline": n.is_online,
            "battery": n.battery,
            "lastSeenMs": n.last_seen_ms,
            "firebaseNodeId": n.firebase_node_id,
            "isBanned": n.device_id in banned_set
        })

    return {"count": len(result), "devices": result}


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
async def get_active_activations():
    """Returns all active activations stored in Redis."""
    try:
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager
    redis_client = await redis_manager.get_client()

    if not redis_client:
        return {"activations": []}

    try:
        active_ids = await redis_client.smembers(f"{REDIS_PREFIX}:active_ids")
        if not active_ids:
            return {"activations": []}

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

        activations.sort(key=lambda a: a.get("created", 0), reverse=True)
        return {"count": len(activations), "activations": activations}

    except Exception as e:
        logger.error(f"Error fetching activations in admin API: {e}")
        return {"activations": []}


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
    """Sandbox endpoint: Test SMS body & sender ID against dynamic patterns."""
    try:
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager
    redis_client = await redis_manager.get_client()

    matched, code = await ServicePatternRegistry.match_sms_dynamic(
        redis_client, payload.body, payload.sender, payload.serviceCode
    )

    return {
        "serviceCode": payload.serviceCode,
        "sender": payload.sender,
        "body": payload.body,
        "isMatched": matched,
        "extractedCode": code
    }
