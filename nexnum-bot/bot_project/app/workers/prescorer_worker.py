# app/workers/prescorer_worker.py
"""
Phase 4 — Historical SMS Service Pre-Scorer Worker

Periodically (every 60s) scans all device SIM nodes, analyzes their 150 historical SMS messages,
categorizes service usage counts using `match_sms_to_service()`, and populates
`nexsms:service_counts:{phone}` in Redis.

This powers 0ms O(1) Redis lookup for Fresh Numbers scoring during `getNumber` purchases.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Dict, Any, List, Optional

from app.crud.firebase_crud import get_all_sim_nodes, get_incoming_messages
from app.services.sms_parser import match_sms_to_service, SERVICE_PATTERNS
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


async def analyze_and_cache_all_service_counts(redis_client):
    """
    Scans all SIM nodes, fetches up to 150 historical SMS per device,
    computes per-service SMS counts, and saves to Redis `nexsms:service_counts:{phone}`.
    """
    sim_nodes = get_all_sim_nodes()
    if not sim_nodes:
        return

    processed_phones = set()

    for node in sim_nodes:
        phone = node.phone_number
        if not phone or phone in processed_phones:
            continue
        processed_phones.add(phone)

        # Fetch up to 100 historical messages for this device
        messages = get_incoming_messages(node.device_id, limit=100)
        if not messages:
            continue

        # Count service matches
        counts: Dict[str, int] = {}
        supported_services = list(SERVICE_PATTERNS.keys()) + ["ot"]

        for msg in messages:
            if not isinstance(msg, dict):
                continue
            body = str(msg.get("message") or msg.get("body") or "")
            sender = str(msg.get("sender") or msg.get("from") or "")

            for svc in supported_services:
                if match_sms_to_service(body, sender, svc):
                    counts[svc] = counts.get(svc, 0) + 1

        if counts:
            key = f"{REDIS_PREFIX}:service_counts:{phone}"
            try:
                # Save hash in Redis with 24h TTL
                mapping = {k: str(v) for k, v in counts.items()}
                await redis_client.hset(key, mapping=mapping)
                await redis_client.expire(key, 86400)
            except Exception as e:
                logger.warning(f"[PreScorerWorker] Redis hset failed for {phone}: {e}")

    logger.info(f"[PreScorerWorker] Analyzed historical SMS and updated service counts for {len(processed_phones)} phone numbers.")
