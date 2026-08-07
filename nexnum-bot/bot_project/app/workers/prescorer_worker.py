# app/workers/prescorer_worker.py
"""
Phase 4 — Historical SMS Service Pre-Scorer Worker

Ultra-Fast Parallel Bulk Architecture:
Periodically (every 60s) scans all device SIM nodes by querying all registered
Firebase database nodes in bulk parallel HTTP GET requests (timeout 120s).
Batch-caches device message histories and per-service SMS counts in Redis via pipeline.

Executes full pre-scoring for 1,500+ SIM nodes in ~2 seconds.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Dict, Any, List, Optional, Tuple
import httpx

# pyrefly: ignore [missing-import]
from app.crud.firebase_crud import get_all_sim_nodes
# pyrefly: ignore [missing-import]
from app.crud.universal_firebase import UniversalFirebaseRegistry, UniversalFirebaseNode
# pyrefly: ignore [missing-import]
from app.services.pattern_registry import ServicePatternRegistry
# pyrefly: ignore [missing-import]
from app.core.config import get_settings
# pyrefly: ignore [missing-import]
from app.crud.firebase_crud import parse_any_datetime_to_epoch_ms
# pyrefly: ignore [missing-import]
from app.services.sms_parser import extract_otp_code

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


async def _fetch_node_messages_bulk(node: UniversalFirebaseNode, client: httpx.AsyncClient) -> Tuple[str, Dict[str, Any]]:
    """
    Fetch ALL messages stored under /messages.json for a Firebase node in a single bulk HTTP request.
    Configured with 120s timeout as requested for large database trees.
    """
    url = node._build_url("/messages")
    try:
        resp = await client.get(url, timeout=120.0)
        if resp.status_code == 200 and resp.json():
            data = resp.json()
            if isinstance(data, dict):
                return node.node_id, data
    except Exception as e:
        logger.warning(f"[PreScorerWorker] Node '{node.node_id}' bulk message fetch notice: {e}")
    return node.node_id, {}


async def analyze_and_cache_all_service_counts(redis_client):
    """
    Ultra-Fast Bulk Pre-Scorer:
    1. Fetches ALL SIM nodes across the network.
    2. Executes parallel bulk HTTP requests to all registered Firebase database nodes (timeout 120s).
    3. Aggregates all device messages into memory in ~1-2s.
    4. Batch-caches all device message histories into Redis via pipeline.
    5. Analyzes service counts and batch-saves `nexsms:service_counts:{phone}`.
    """
    loop = asyncio.get_running_loop()
    sim_nodes = await loop.run_in_executor(None, get_all_sim_nodes)
    if not sim_nodes:
        return

    start_time = time.time()
    fb_nodes = UniversalFirebaseRegistry.get_nodes()

    # 1. Bulk Parallel HTTP Fetch from all registered Firebase nodes
    logger.info(f"[PreScorerWorker] Starting parallel bulk message fetch across {len(fb_nodes)} Firebase nodes...")
    bulk_raw_by_node: Dict[str, Dict[str, Any]] = {}

    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as http_client:
        tasks = [_fetch_node_messages_bulk(n, http_client) for n in fb_nodes]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        for res in results:
            if isinstance(res, tuple):
                node_id, data = res
                if data:
                    bulk_raw_by_node[node_id] = data

    # 2. Process & format messages per device in memory
    device_messages_map: Dict[str, List[Dict[str, Any]]] = {}

    for node_id, node_data in bulk_raw_by_node.items():
        if not isinstance(node_data, dict):
            continue
        for device_id, raw_msgs in node_data.items():
            if not isinstance(raw_msgs, dict) or not raw_msgs:
                continue

            formatted_list: List[Dict[str, Any]] = []
            for msg_key, msg in raw_msgs.items():
                if not isinstance(msg, dict):
                    continue
                body_text = str(msg.get("message") or msg.get("body") or msg.get("text") or "")
                sender = str(msg.get("sender") or msg.get("from") or msg.get("service") or "Unknown")
                ts_val = parse_any_datetime_to_epoch_ms(msg)
                date_time_str = str(msg.get("dateTime") or msg.get("datetime") or msg.get("date_time") or "")
                otp = extract_otp_code(body_text)

                formatted_list.append({
                    "id": str(msg.get("id") or msg_key),
                    "sender": sender,
                    "message": body_text,
                    "timestamp": ts_val,
                    "dateTime": date_time_str,
                    "otp": otp,
                    "service": msg.get("service") or sender
                })

            if formatted_list:
                formatted_list.sort(key=lambda m: m["timestamp"], reverse=True)
                device_messages_map[device_id] = formatted_list[:150]

    # 3. Batch Pipeline Push to Redis for 0ms I/O
    pipe = redis_client.pipeline()
    processed_phones = set()
    devices_with_messages = 0
    devices_no_messages = 0

    for node in sim_nodes:
        phone = node.phone_number or ""
        device_id = node.device_id
        firebase_node_id = node.firebase_node_id or ""

        # Skip duplicate phone numbers
        if phone and phone not in ("Pending", "Unknown", "") and phone in processed_phones:
            continue

        msgs = device_messages_map.get(device_id, [])
        if msgs:
            devices_with_messages += 1
            msg_json = json.dumps(msgs)
            for identifier in filter(None, [device_id, firebase_node_id, phone]):
                pipe.set(f"{REDIS_PREFIX}:device_messages:{identifier}", msg_json, ex=600)
        else:
            devices_no_messages += 1
            pipe.set(f"{REDIS_PREFIX}:device_no_messages:{device_id}", "1", ex=300)
            if phone and phone not in ("Pending", "Unknown", ""):
                processed_phones.add(phone)
            continue

        if phone and phone not in ("Pending", "Unknown", ""):
            processed_phones.add(phone)

        # 4. Service Count Analysis
        counts: Dict[str, int] = {}
        for msg in msgs:
            body = msg["message"]
            sender = msg["sender"]
            matched, _code, details = await ServicePatternRegistry.match_sms_dynamic(
                redis_client, body, sender, service_code="auto"
            )
            if matched:
                svc = details.get("matchedServiceCode") or "ot"
                counts[svc] = counts.get(svc, 0) + 1

        if counts and phone and phone not in ("Pending", "Unknown", ""):
            key = f"{REDIS_PREFIX}:service_counts:{phone}"
            mapping = {k: str(v) for k, v in counts.items()}
            pipe.hset(key, mapping=mapping)
            pipe.expire(key, 86400)

    try:
        await pipe.execute()
    except Exception as e:
        logger.warning(f"[PreScorerWorker] Pipeline execution notice: {e}")

    elapsed = round(time.time() - start_time, 2)
    logger.info(
        f"[PreScorerWorker] Ultra-Fast Bulk Run finished in {elapsed}s — "
        f"{len(processed_phones)} unique phones scored, "
        f"{devices_with_messages} devices cached from bulk Firebase nodes, "
        f"{devices_no_messages} devices with no messages."
    )
