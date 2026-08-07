# app/workers/prescorer_worker.py
"""
Phase 4 — Historical SMS Service Pre-Scorer Worker

Periodically (every 60s) scans all device SIM nodes, ensures every device has
message history cached in Redis (fetching from Firebase if missing), analyzes
service usage counts, and populates `nexsms:service_counts:{phone}` in Redis.

Key Guarantee:
  Every device MUST have at least 1 message in Redis before it is scored.
  If no cached messages exist, Firebase is queried immediately and the result
  is saved before scoring proceeds. This prevents data-poor devices from
  receiving artificial "fresh bonus" scores.

This powers 0ms O(1) Redis lookup for Fresh Numbers scoring during `getNumber` purchases.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Dict, Any, List, Optional

# pyrefly: ignore [missing-import]
from app.crud.firebase_crud import get_all_sim_nodes, get_incoming_messages
# pyrefly: ignore [missing-import]
from app.services.pattern_registry import ServicePatternRegistry, load_default_patterns
# pyrefly: ignore [missing-import]
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

REDIS_PREFIX = "nexsms"
_running: bool = False
_prescorer_task: Optional[asyncio.Task] = None


async def start_prescorer_worker():
    """Start background periodic pre-scorer worker."""
    global _running, _prescorer_task
    if _running:
        return
    _running = True
    logger.info("[PreScorerWorker] Starting historical SMS service pre-scorer worker...")
    _prescorer_task = asyncio.create_task(_prescorer_loop())


async def stop_prescorer_worker():
    """Stop background pre-scorer worker."""
    global _running, _prescorer_task
    _running = False
    if _prescorer_task and not _prescorer_task.done():
        _prescorer_task.cancel()
        try:
            await _prescorer_task
        except (asyncio.CancelledError, Exception):
            pass
    _prescorer_task = None
    logger.info("[PreScorerWorker] Pre-scorer worker stopped.")


async def _prescorer_loop():
    """Periodic loop running pre-scoring every 60 seconds."""
    try:
        # pyrefly: ignore [missing-import]
        from utils.redis_manager import redis_manager
    except ImportError:
        from bot_project.utils.redis_manager import redis_manager

    while _running:
        try:
            redis_client = await redis_manager.get_client()
            if redis_client:
                await analyze_and_cache_all_service_counts(redis_client)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"[PreScorerWorker] Error during pre-score run: {e}")

        # Sleep 60 seconds between sync runs
        await asyncio.sleep(60.0)


async def _ensure_device_has_messages(
    redis_client,
    loop: asyncio.AbstractEventLoop,
    node,
    device_id: str,
    phone: str,
    firebase_node_id: str,
) -> List[Dict[str, Any]]:
    """
    Guarantee that a device has cached messages in Redis.

    1. Check Redis for `nexsms:device_messages:{device_id}`.
    2. If found and non-empty → return parsed list directly (0ms).
    3. If missing or empty → fetch 150 messages from Firebase via thread executor,
       format and save to Redis (600s TTL), then return the list.
    """
    # pyrefly: ignore [missing-import]
    from app.crud.firebase_crud import parse_any_datetime_to_epoch_ms
    # pyrefly: ignore [missing-import]
    from app.services.sms_parser import extract_otp_code

    cache_key = f"{REDIS_PREFIX}:device_messages:{device_id}"

    # 1. Check Redis cache first
    try:
        cached = await redis_client.get(cache_key)
        if cached:
            parsed = json.loads(cached)
            if isinstance(parsed, list) and len(parsed) > 0:
                return parsed
    except Exception:
        pass

    # 2. No cache — fetch fresh from Firebase
    logger.info(f"[PreScorerWorker] No cached messages for device '{device_id}' — fetching from Firebase...")
    try:
        raw_messages = await loop.run_in_executor(None, get_incoming_messages, device_id, 150)
    except Exception as e:
        logger.warning(f"[PreScorerWorker] Failed to fetch Firebase messages for '{device_id}': {e}")
        return []

    if not raw_messages:
        logger.debug(f"[PreScorerWorker] Device '{device_id}' has no messages in Firebase.")
        return []

    # 3. Format messages for Redis cache
    formatted_msgs: List[Dict[str, Any]] = []
    for msg in raw_messages:
        if not isinstance(msg, dict):
            continue
        body_text = str(msg.get("message") or msg.get("body") or msg.get("text") or "")
        sender = str(msg.get("sender") or msg.get("from") or msg.get("service") or "Unknown")
        ts_val = parse_any_datetime_to_epoch_ms(msg)
        date_time_str = str(msg.get("dateTime") or msg.get("datetime") or msg.get("date_time") or "")
        otp = extract_otp_code(body_text)

        formatted_msgs.append({
            "id": str(msg.get("id", "")),
            "sender": sender,
            "message": body_text,
            "timestamp": ts_val,
            "dateTime": date_time_str,
            "otp": otp,
            "service": msg.get("service") or sender
        })

    if not formatted_msgs:
        return []

    # Sort newest-first before saving
    formatted_msgs.sort(key=lambda m: m["timestamp"], reverse=True)
    msg_json = json.dumps(formatted_msgs[:150])

    # 4. Save to all relevant Redis keys (device_id, firebase_node_id, phone)
    for identifier in filter(None, [device_id, firebase_node_id, phone]):
        try:
            await redis_client.set(
                f"{REDIS_PREFIX}:device_messages:{identifier}",
                msg_json,
                ex=600  # 10-minute TTL
            )
        except Exception:
            pass

    logger.info(f"[PreScorerWorker] Cached {len(formatted_msgs)} messages for device '{device_id}' → Redis.")
    return formatted_msgs


async def analyze_and_cache_all_service_counts(redis_client):
    """
    Scans all SIM nodes, guarantees every device has message history,
    computes per-service SMS counts, and saves to Redis `nexsms:service_counts:{phone}`.
    """
    # pyrefly: ignore [missing-import]
    from app.crud.firebase_crud import parse_any_datetime_to_epoch_ms

    loop = asyncio.get_running_loop()
    sim_nodes = await loop.run_in_executor(None, get_all_sim_nodes)
    if not sim_nodes:
        return

    processed_phones = set()
    devices_with_messages = 0
    devices_fetched_fresh = 0
    devices_no_messages = 0

    for node in sim_nodes:
        phone = node.phone_number
        device_id = node.device_id
        firebase_node_id = node.firebase_node_id or ""

        # Skip duplicate phone numbers (multiple SIM slots on same device)
        if phone and phone not in ("Pending", "Unknown", "") and phone in processed_phones:
            continue

        # ── GUARANTEE: Ensure this device has messages before scoring ──
        messages = await _ensure_device_has_messages(
            redis_client=redis_client,
            loop=loop,
            node=node,
            device_id=device_id,
            phone=phone or "",
            firebase_node_id=firebase_node_id,
        )

        if messages:
            if f"{REDIS_PREFIX}:device_messages:{device_id}" not in []:
                devices_with_messages += 1
        else:
            devices_no_messages += 1
            # Mark in Redis that this device genuinely has no messages (not just un-cached)
            try:
                await redis_client.set(
                    f"{REDIS_PREFIX}:device_no_messages:{device_id}",
                    "1",
                    ex=300  # Re-check in 5 minutes
                )
            except Exception:
                pass
            # No messages → skip service-count scoring (no data to analyze)
            if phone and phone not in ("Pending", "Unknown", ""):
                processed_phones.add(phone)
            continue

        if phone and phone not in ("Pending", "Unknown", ""):
            processed_phones.add(phone)

        # ── SERVICE COUNT ANALYSIS ──
        counts: Dict[str, int] = {}

        for msg in messages:
            if not isinstance(msg, dict):
                continue
            body = str(msg.get("message") or msg.get("body") or msg.get("text") or "")
            sender = str(msg.get("sender") or msg.get("from") or msg.get("service") or "Unknown")

            matched, _code, details = await ServicePatternRegistry.match_sms_dynamic(
                redis_client, body, sender, service_code="auto"
            )
            if matched:
                svc = details.get("matchedServiceCode") or "ot"
                counts[svc] = counts.get(svc, 0) + 1

        if counts and phone and phone not in ("Pending", "Unknown", ""):
            key = f"{REDIS_PREFIX}:service_counts:{phone}"
            try:
                mapping = {k: str(v) for k, v in counts.items()}
                await redis_client.hset(key, mapping=mapping)
                await redis_client.expire(key, 86400)  # 24h TTL
            except Exception as e:
                logger.warning(f"[PreScorerWorker] Redis hset failed for {phone}: {e}")

    logger.info(
        f"[PreScorerWorker] Cycle complete — "
        f"{len(processed_phones)} unique phones scored, "
        f"{devices_with_messages} devices had cached messages, "
        f"{devices_no_messages} devices had no messages in Firebase."
    )
