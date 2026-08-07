# app/inbound/router.py
"""
Phase 1 — Unified Webhook Inbound Endpoint

POST /webhook/inbound
  - Auth: Shared secret (X-API-Key == WEBHOOK_SHARED_SECRET) — ~0ms overhead
  - Dedup: Redis SETNX on "dedup:{deviceId}:{timestamp}" with configurable TTL
  - Queue: XADD to Redis Stream "stream:inbound:sms"
  - Response: 200 OK immediately (fast-ack, target <50ms)

Payload format (SilentGate):
{
  "deviceId": "A",
  "timestamp": 1720000000000,
  "sender": "+91...",
  "body": "Your OTP is 1234",
  "isOtp": true,
  "otpCode": "1234",
  "simSlot": 0
}
"""
from __future__ import annotations

import time
import json
import logging
from typing import Optional

from fastapi import APIRouter, Request, Response, HTTPException
from pydantic import BaseModel, Field

# pyrefly: ignore [missing-import]
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["Inbound SMS"])

# Redis prefix for namespacing
REDIS_PREFIX = "nexsms"


# ─── Pydantic model for inbound payload ───────────────────────────────────────

class InboundSmsPayload(BaseModel):
    """Payload from SilentGate Android app."""
    deviceId: str = Field(..., description="Unique device identifier")
    timestamp: int = Field(..., description="Unix epoch ms when SMS was received on device")
    sender: str = Field(default="", description="SMS sender ID or phone number")
    body: str = Field(..., description="Full SMS body text")
    isOtp: bool = Field(default=False, description="Whether the app detected this as OTP")
    otpCode: Optional[str] = Field(default=None, description="Extracted OTP code (if isOtp=True)")
    simSlot: int = Field(default=0, description="SIM slot index (0 or 1)")


# ─── Auth helper ──────────────────────────────────────────────────────────────

def _verify_shared_secret(request: Request) -> bool:
    """
    Option C auth: Check X-API-Key header against WEBHOOK_SHARED_SECRET env var.
    If WEBHOOK_SHARED_SECRET is empty/unset, auth is disabled (open mode).
    """
    secret = settings.WEBHOOK_SHARED_SECRET
    if not secret:
        # No secret configured — open mode (fastest)
        return True
    
    api_key = request.headers.get("X-API-Key", "")
    return api_key == secret


# ─── Dedup helper ─────────────────────────────────────────────────────────────

async def _is_duplicate(redis_client, device_id: str, timestamp: int) -> bool:
    """
    Redis SETNX-based deduplication.
    Key: dedup:{deviceId}:{timestamp}
    If key already exists → duplicate → return True
    If key is new → set with TTL → return False
    """
    if redis_client is None:
        return False  # No Redis = no dedup = accept everything
    
    key = f"{REDIS_PREFIX}:dedup:{device_id}:{timestamp}"
    ttl = settings.INBOUND_DEDUP_TTL
    
    try:
        # SET NX returns True if key was SET (i.e., new), False if already existed
        was_set = await redis_client.set(key, "1", nx=True, ex=ttl)
        return not was_set  # If wasn't set → already existed → duplicate
    except Exception as e:
        logger.warning(f"Redis dedup check failed: {e}. Accepting message (fail-open).")
        return False


# ─── Stream push helper ──────────────────────────────────────────────────────

async def _push_to_stream(redis_client, payload: InboundSmsPayload) -> Optional[str]:
    """
    Push inbound SMS to Redis Stream for async processing by activation workers.
    Returns the stream message ID, or None on failure.
    """
    if redis_client is None:
        logger.warning("Redis unavailable — cannot push to inbound stream. SMS dropped!")
        return None
    
    stream_name = settings.REDIS_STREAM_INBOUND
    
    # Build stream entry — all values must be strings for Redis
    entry = {
        "deviceId": payload.deviceId,
        "timestamp": str(payload.timestamp),
        "sender": payload.sender,
        "body": payload.body,
        "isOtp": "1" if payload.isOtp else "0",
        "otpCode": payload.otpCode or "",
        "simSlot": str(payload.simSlot),
        "ingest_ts": str(int(time.time() * 1000)),  # Server receive timestamp
    }
    
    try:
        msg_id = await redis_client.xadd(stream_name, entry, maxlen=10000, approximate=True)
        return msg_id
    except Exception as e:
        logger.error(f"Failed to XADD to stream '{stream_name}': {e}")
        return None


# ─── Ensure consumer group exists ─────────────────────────────────────────────

async def ensure_consumer_group(redis_client) -> bool:
    """
    Create the Redis Stream consumer group if it doesn't exist.
    Called once during app startup (lifespan).
    """
    if redis_client is None:
        return False
    
    stream_name = settings.REDIS_STREAM_INBOUND
    group_name = "activation-matchers"
    
    try:
        # XGROUP CREATE with MKSTREAM creates the stream if it doesn't exist
        await redis_client.xgroup_create(
            name=stream_name,
            groupname=group_name,
            id="0",
            mkstream=True
        )
        logger.info(f"Created consumer group '{group_name}' on stream '{stream_name}'")
        return True
    except Exception as e:
        error_msg = str(e)
        if "BUSYGROUP" in error_msg:
            # Consumer group already exists — this is fine
            logger.debug(f"Consumer group '{group_name}' already exists on '{stream_name}'")
            return True
        logger.error(f"Failed to create consumer group: {e}")
        return False


# ─── Main endpoint ────────────────────────────────────────────────────────────

@router.post("/webhook/inbound", status_code=200)
async def inbound_sms_webhook(request: Request, payload: InboundSmsPayload):
    """
    Unified Inbound SMS Webhook — Fast-Ack Pattern
    
    Flow:
    1. Auth: shared secret check (~0ms)
    2. Dedup: Redis SETNX (~1ms)
    3. Queue: Redis XADD (~1ms)
    4. Return 200 OK (~0ms)
    
    Total target: <50ms end-to-end
    """
    start_ts = time.monotonic()
    
    # 1. Auth
    if not _verify_shared_secret(request):
        raise HTTPException(status_code=401, detail="Invalid API key")
    
    # 2. Get Redis client
    try:
        # pyrefly: ignore [missing-import]
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager
    
    redis_client = await redis_manager.get_client()
    
    # 3. Dedup check
    if await _is_duplicate(redis_client, payload.deviceId, payload.timestamp):
        elapsed_ms = (time.monotonic() - start_ts) * 1000
        logger.debug(f"Duplicate SMS dropped: device={payload.deviceId} ts={payload.timestamp} ({elapsed_ms:.1f}ms)")
        return {"status": "duplicate", "elapsed_ms": round(elapsed_ms, 1)}
    
    # 4. Push to Redis Stream
    msg_id = await _push_to_stream(redis_client, payload)
    
    elapsed_ms = (time.monotonic() - start_ts) * 1000
    
    if msg_id:
        logger.info(
            f"[INBOUND] SMS queued: device={payload.deviceId} "
            f"sender={payload.sender} isOtp={payload.isOtp} "
            f"stream_id={msg_id} ({elapsed_ms:.1f}ms)"
        )
        return {"status": "accepted", "stream_id": msg_id, "elapsed_ms": round(elapsed_ms, 1)}
    else:
        # Redis unavailable but we still ack to avoid device retries
        logger.error(f"[INBOUND] SMS NOT queued (Redis down): device={payload.deviceId}")
        return Response(
            content=json.dumps({"status": "accepted_degraded", "elapsed_ms": round(elapsed_ms, 1)}),
            status_code=202,  # Accepted but degraded
            media_type="application/json"
        )


# ─── Health check for inbound subsystem ───────────────────────────────────────

@router.get("/webhook/inbound/health")
async def inbound_health():
    """Check inbound subsystem health: Redis connectivity + stream info."""
    try:
        # pyrefly: ignore [missing-import]
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager
    
    redis_client = await redis_manager.get_client()
    
    if redis_client is None:
        return {"status": "degraded", "redis": "unavailable"}
    
    stream_name = settings.REDIS_STREAM_INBOUND
    try:
        info = await redis_client.xinfo_stream(stream_name)
        stream_length = info.get("length", 0)
        groups_info = await redis_client.xinfo_groups(stream_name)
        
        return {
            "status": "healthy",
            "redis": "connected",
            "stream": {
                "name": stream_name,
                "length": stream_length,
                "consumer_groups": len(groups_info),
                "groups": [
                    {
                        "name": g.get("name", "?"),
                        "consumers": g.get("consumers", 0),
                        "pending": g.get("pending", 0),
                    }
                    for g in groups_info
                ]
            }
        }
    except Exception as e:
        # Stream may not exist yet
        return {
            "status": "initializing",
            "redis": "connected",
            "stream": {"name": stream_name, "error": str(e)}
        }
