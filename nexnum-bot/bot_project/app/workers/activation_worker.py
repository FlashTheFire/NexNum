# app/workers/activation_worker.py
"""
Phase 3 — Activation Matcher using Redis Streams Workers

Processes incoming SMS messages queued in `stream:inbound:sms` by consuming
via Redis Stream consumer group `activation-matchers`.

Matching Logic:
  1. Finds active Redis activations (`nexsms:activation:*`) matching `device_id` / phone number.
  2. Ensures SMS timestamp >= activation creation timestamp.
  3. First SMS: Matches against service pattern via `match_sms_to_service()`.
  4. Subsequent SMS (Re-send cycle): Accepts any incoming SMS.
  5. On Match: Updates activation in Redis (`STATUS_OK`, latest `code_text`, `full_text`, `sender`).
  6. Optional Webhook Push: If configured, fires background HTTP POST to nexnum-app webhook endpoint.
  7. Acknowledges message (`XACK`).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Dict, Any, List, Optional
import httpx

from app.core.config import get_settings
from app.services.sms_parser import extract_otp_code, match_sms_to_service

logger = logging.getLogger(__name__)
settings = get_settings()

REDIS_PREFIX = "nexsms"
STREAM_NAME = settings.REDIS_STREAM_INBOUND
GROUP_NAME = "activation-matchers"

_worker_tasks: List[asyncio.Task] = []
_running: bool = False


# ─── Main Worker Loop ─────────────────────────────────────────────────────────

async def start_activation_workers(count: Optional[int] = None):
    """Start `count` background asyncio worker tasks for processing inbound stream."""
    global _running, _worker_tasks
    if _running:
        return
    _running = True

    worker_count = count or getattr(settings, "INBOUND_WORKER_COUNT", 3)
    logger.info(f"[ActivationWorker] Launching {worker_count} Redis Stream consumer workers for group '{GROUP_NAME}'...")

    for idx in range(worker_count):
        worker_id = f"worker_{idx+1}"
        task = asyncio.create_task(_worker_loop(worker_id))
        _worker_tasks.append(task)


async def stop_activation_workers():
    """Stop all running worker tasks gracefully."""
    global _running, _worker_tasks
    _running = False
    for task in _worker_tasks:
        if not task.done():
            task.cancel()
    if _worker_tasks:
        await asyncio.gather(*_worker_tasks, return_exceptions=True)
    _worker_tasks.clear()
    logger.info("[ActivationWorker] All stream consumer workers stopped.")


async def _worker_loop(worker_id: str):
    """Loop consuming messages from stream:inbound:sms using XREADGROUP."""
    try:
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager

    while _running:
        try:
            redis_client = await redis_manager.get_client()
            if redis_client is None:
                await asyncio.sleep(2.0)
                continue

            # Read up to 10 messages with 1s block timeout
            entries = await redis_client.xreadgroup(
                groupname=GROUP_NAME,
                consumername=worker_id,
                streams={STREAM_NAME: ">"},
                count=10,
                block=1000
            )

            if not entries:
                continue

            for stream_key, messages in entries:
                for msg_id, fields in messages:
                    if not _running:
                        break
                    await _process_stream_message(redis_client, msg_id, fields)

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.warning(f"[ActivationWorker:{worker_id}] Error in worker loop: {exc}. Retrying in 2s...")
            await asyncio.sleep(2.0)


# ─── Stream Message Matching Logic ───────────────────────────────────────────

async def _process_stream_message(redis_client, msg_id: str, fields: Dict[str, str]):
    """Match a single stream message against active Redis activations."""
    device_id = fields.get("deviceId", "")
    sender = fields.get("sender", "")
    body = fields.get("body", "")
    raw_ts = fields.get("timestamp", "0")
    
    try:
        msg_ts = float(raw_ts)
    except ValueError:
        msg_ts = time.time() * 1000

    if not body:
        # Empty body — acknowledge and skip
        await _ack_message(redis_client, msg_id)
        return

    # Fetch all active activations from Redis
    activations = await _get_active_redis_activations(redis_client)
    if not activations:
        await _ack_message(redis_client, msg_id)
        return

    matched = False
    for act_id, act in activations.items():
        # Match by client_id / device_id or phone number
        act_client_id = act.get("client_id")
        act_number = act.get("number", "").replace("+", "")
        clean_device = device_id.replace("+", "")

        is_device_match = (act_client_id and act_client_id == device_id) or (clean_device and clean_device == act_number)
        if not is_device_match:
            continue

        # Ignore if activation already canceled or expired
        if act.get("status") in ("STATUS_CANCEL", "STATUS_EXPIRED", "STATUS_TIMEOUT"):
            continue

        # Check creation timestamp guard
        created_ms = act.get("created", 0) * 1000
        if msg_ts < created_ms - 5000:  # 5s grace margin
            continue

        has_sms = act.get("has_sms", False)
        req_service = act.get("service", "ot")

        # First SMS match vs Re-send match
        is_match = False
        extracted_code = None

        if not has_sms:
            # First SMS: must match requested service pattern dynamically
            from app.services.pattern_registry import ServicePatternRegistry
            is_match, extracted_code = await ServicePatternRegistry.match_sms_dynamic(redis_client, body, sender, req_service)
        else:
            # Re-send cycle: accept any incoming SMS
            is_match = True
            extracted_code = fields.get("otpCode") or extract_otp_code(body) or body

        if is_match:
            otp_code = extracted_code or body

            # Update activation in Redis
            act["has_sms"] = True
            act["status"] = "STATUS_OK"
            act["code_text"] = otp_code
            act["full_text"] = body
            act["sms_sender"] = sender
            act["sms_time"] = msg_ts
            act["received_messages"] = [{
                "sender": sender,
                "message": body,
                "code": otp_code,
                "timestamp": msg_ts
            }]

            await _save_redis_activation(redis_client, act_id, act)
            logger.info(f"[ActivationWorker MATCH] Activation {act_id} matched SMS from device {device_id} (Service: {req_service}): '{otp_code}'")

            # Increment service SMS count in Redis for Fresh Numbers scoring
            if act_number:
                try:
                    await redis_client.hincrby(f"{REDIS_PREFIX}:service_counts:+{act_number}", req_service, 1)
                except Exception as e:
                    logger.warning(f"Failed to increment service count for {act_number}: {e}")

            # Phase 6: Async Non-Blocking Supabase Archiving
            from app.services.supabase_archive import SupabaseArchiver
            asyncio.create_task(SupabaseArchiver.archive_message(
                device_id=device_id,
                sender=sender,
                body=body,
                otp_code=otp_code,
                service=req_service,
                activation_id=act_id
            ))
            duration = max(0.0, time.time() - act.get("created", time.time()))
            asyncio.create_task(SupabaseArchiver.archive_activation_log(
                activation_id=act_id,
                device_id=device_id,
                phone_number=act.get("number", ""),
                service=req_service,
                status="STATUS_OK",
                code_text=otp_code,
                duration_sec=duration
            ))

            # Optional Instant Webhook Push to nexnum-app
            asyncio.create_task(_push_otp_webhook(act_id, act, otp_code, body, sender))

            matched = True
            break

    # Always ACK stream message after processing
    await _ack_message(redis_client, msg_id)


# ─── Redis Helpers ────────────────────────────────────────────────────────────

async def _get_active_redis_activations(redis_client) -> Dict[str, dict]:
    """Retrieve all active activations from Redis using the active_ids SET index."""
    try:
        active_ids = await redis_client.smembers(f"{REDIS_PREFIX}:active_ids")
        if not active_ids:
            return {}

        keys = [f"{REDIS_PREFIX}:activation:{aid}" for aid in active_ids]
        pipe = redis_client.pipeline()
        for key in keys:
            pipe.get(key)
        results = await pipe.execute()

        res = {}
        for aid, v in zip(active_ids, results):
            if v:
                try:
                    res[str(aid)] = json.loads(v)
                except Exception:
                    pass
            else:
                await redis_client.srem(f"{REDIS_PREFIX}:active_ids", aid)
        return res
    except Exception as e:
        logger.warning(f"Error fetching Redis activations in worker: {e}")
        return {}


async def _save_redis_activation(redis_client, act_id: str, act_data: dict):
    """Save updated activation back to Redis with 20-min TTL."""
    try:
        key = f"{REDIS_PREFIX}:activation:{act_id}"
        await redis_client.set(key, json.dumps(act_data), ex=1200)
    except Exception as e:
        logger.warning(f"Error saving activation {act_id} to Redis: {e}")


async def _ack_message(redis_client, msg_id: str):
    """Acknowledge processing of stream message."""
    try:
        await redis_client.xack(STREAM_NAME, GROUP_NAME, msg_id)
    except Exception as e:
        logger.warning(f"Failed to XACK message {msg_id}: {e}")


# ─── Optional Instant Webhook Push to nexnum-app ─────────────────────────────

async def _push_otp_webhook(act_id: str, act: dict, code: str, body: str, sender: str):
    """
    Pushes OTP payload directly to nexnum-app via webhook if webhook URL is configured.
    Reduces latency from ~5s polling average to <100ms instant push!
    """
    webhook_url = getattr(settings, "NEXNUM_APP_WEBHOOK_URL", None)
    if not webhook_url:
        return

    payload = {
        "event": "sms.received",
        "activationId": act_id,
        "phoneNumber": act.get("number"),
        "serviceCode": act.get("service"),
        "code": code,
        "fullSms": body,
        "sender": sender,
        "receivedAt": int(time.time() * 1000)
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(webhook_url, json=payload)
            if resp.status_code == 200:
                logger.info(f"[WebhookPush] Pushed OTP for activation {act_id} to nexnum-app successfully.")
    except Exception as exc:
        logger.warning(f"[WebhookPush] Failed to push OTP webhook for {act_id}: {exc}")
