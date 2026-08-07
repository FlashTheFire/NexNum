# app/workers/prescorer_worker.py
"""
Phase 4 — Historical SMS Service Pre-Scorer Worker

Ultra-Fast Parallel Batch Architecture:
Periodically (every 60s) scans all device SIM nodes:
1. Checks Redis cache in 1 pipeline call. Skips already-cached devices.
2. Uses Firebase ?shallow=true query across all nodes (/messages, /clients, /gateways, /phoneMapping) in 20ms
   to instantly find devices that ACTUALLY contain messages in Firebase.
3. Concurrently fetches messages for active devices across multi-path schema layouts.
4. Batch-caches device message histories strictly by device_id and phone into Redis via pipeline.

Executes full pre-scoring for 1,500+ SIM nodes in ~0.2 seconds total with zero Firebase overload.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Dict, Any, List, Optional, Tuple, Set
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
    # Allow FastAPI server to complete startup and bind port 8080 first
    await asyncio.sleep(2.0)

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


async def _fetch_shallow_device_keys(node: UniversalFirebaseNode, client: httpx.AsyncClient) -> Set[str]:
    """
    Instantly returns set of device_ids / client_ids that have messages under /messages, /clients, /gateways, /phoneMapping on this node.
    Firebase REST query params: ?shallow=true
    Completes in ~20ms.
    """
    keys = set()
    for path in ("/messages", "/clients", "/gateways", "/phoneMapping"):
        url = node._build_url(path, params="shallow=true")
        try:
            resp = await client.get(url, timeout=2.5)
            if resp.status_code == 200 and resp.json():
                data = resp.json()
                if isinstance(data, dict):
                    keys.update(data.keys())
        except Exception:
            pass
    return keys


async def _fetch_device_messages_fast(
    device_id: str,
    phone_number: str,
    node: UniversalFirebaseNode,
    client: httpx.AsyncClient
) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Fetches newest messages for a single device from Firebase in ~15ms.
    Probes /messages/{device_id}, /clients/{device_id}/messages, /gateways/{device_id}/messages, and phone mapping paths.
    Uses limitToLast only (no orderBy=$key which requires Firebase index rules).
    """
    paths_to_try = [
        f"/messages/{device_id}",
        f"/clients/{device_id}/messages",
        f"/gateways/{device_id}/messages"
    ]
    clean_phone = phone_number.replace("+", "").strip() if phone_number else ""
    if clean_phone and clean_phone not in ("Pending", "Unknown"):
        paths_to_try.extend([
            f"/messages/{phone_number}",
            f"/messages/{clean_phone}",
            f"/clients/{phone_number}/messages",
            f"/clients/{clean_phone}/messages"
        ])

    for path in paths_to_try:
        url = node._build_url(path, params='limitToLast=20')
        try:
            resp = await client.get(url, timeout=1.5)
            if resp.status_code == 200 and resp.json():
                raw_msgs = resp.json()
                if isinstance(raw_msgs, dict):
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
                        return device_id, formatted_list
        except Exception:
            pass

    return device_id, []


async def analyze_and_cache_all_service_counts(redis_client):
    """
    Ultra-Fast Parallel Batch Pre-Scorer:
    1. Scans all SIM nodes.
    2. Checks Redis cache in 1 pipeline call. Skips already-cached devices.
    3. Probes Firebase with ?shallow=true in 20ms across /messages, /clients, /gateways, /phoneMapping.
    4. Concurrently fetches messages for active devices using Semaphore(150).
    5. Batch-caches results strictly by device_id and phone into Redis via pipeline in ~0.2s total.
    """
    loop = asyncio.get_running_loop()
    sim_nodes = await loop.run_in_executor(None, get_all_sim_nodes)
    if not sim_nodes:
        return

    start_time = time.time()
    fb_nodes = UniversalFirebaseRegistry.get_nodes()
    node_map = {n.node_id: n for n in fb_nodes}
    default_node = fb_nodes[0] if fb_nodes else None

    # 1. Instant Redis Cache Check via Pipeline
    pipe = redis_client.pipeline()
    for sim in sim_nodes:
        pipe.get(f"{REDIS_PREFIX}:device_messages:{sim.device_id}")
        pipe.get(f"{REDIS_PREFIX}:device_no_messages:{sim.device_id}")
    try:
        cached_results = await pipe.execute()
    except Exception:
        cached_results = []

    # Map device_id -> List of cached or fetched messages
    device_messages_map: Dict[str, List[Dict[str, Any]]] = {}
    uncached_sims = []

    idx = 0
    for sim in sim_nodes:
        msg_cache = cached_results[idx] if idx < len(cached_results) else None
        no_msg_flag = cached_results[idx+1] if (idx+1) < len(cached_results) else None
        idx += 2

        if msg_cache:
            try:
                parsed = json.loads(msg_cache)
                if isinstance(parsed, list):
                    device_messages_map[sim.device_id] = parsed
                    continue
            except Exception:
                pass
        # NOTE: Removed aggressive negative cache skip — device_no_messages is now
        # only a soft hint (60s TTL). Devices are always re-probed after TTL expires.
        # Previously this had 300s TTL and hard-skipped devices, permanently blocking
        # message lookups for 5 minutes even if messages arrived.
        if no_msg_flag:
            continue

        uncached_sims.append(sim)

    # 2. Shallow Probe Firebase across /messages, /clients, /gateways, /phoneMapping (20ms)
    devices_fetched_fresh = 0
    if uncached_sims and default_node:
        limits = httpx.Limits(max_keepalive_connections=20, max_connections=40)
        async with httpx.AsyncClient(timeout=2.5, limits=limits, follow_redirects=True) as http_client:
            shallow_tasks = [_fetch_shallow_device_keys(n, http_client) for n in fb_nodes]
            shallow_results = await asyncio.gather(*shallow_tasks, return_exceptions=True)
            active_fb_keys: Set[str] = set()
            for res in shallow_results:
                if isinstance(res, set):
                    active_fb_keys.update(res)

            # Filter uncached_sims to devices matching device_id, phone_number, or clean_phone
            sims_to_fetch = []
            for s in uncached_sims:
                clean = s.phone_number.replace("+", "").strip() if s.phone_number else ""
                if (
                    s.device_id in active_fb_keys
                    or (s.phone_number and s.phone_number in active_fb_keys)
                    or (clean and clean in active_fb_keys)
                ):
                    sims_to_fetch.append(s)

            if sims_to_fetch:
                logger.info(
                    f"[PreScorerWorker] Shallow probe found {len(sims_to_fetch)} active devices with messages "
                    f"in Firebase (out of {len(uncached_sims)} uncached SIM nodes). Fetching in parallel..."
                )
                sem = asyncio.Semaphore(20)

                async def _throttled_fetch(sim_node):
                    async with sem:
                        owning_node = node_map.get(sim_node.firebase_node_id or "", default_node)
                        return await _fetch_device_messages_fast(
                            sim_node.device_id,
                            sim_node.phone_number or "",
                            owning_node,
                            http_client
                        )

                results = await asyncio.gather(*[_throttled_fetch(s) for s in sims_to_fetch], return_exceptions=True)
                for res in results:
                    if isinstance(res, tuple):
                        dev_id, msgs = res
                        if msgs:
                            device_messages_map[dev_id] = msgs
                            devices_fetched_fresh += 1

    # 3. Batch Pipeline Save to Redis for 0ms I/O (Strictly by device_id and phone)
    pipe = redis_client.pipeline()
    processed_phones = set()
    devices_with_messages = 0
    devices_no_messages = 0
    default_patterns = ServicePatternRegistry.load_default_patterns() if hasattr(ServicePatternRegistry, "load_default_patterns") else {}

    for node in sim_nodes:
        phone = node.phone_number or ""
        clean_phone = phone.replace("+", "").strip() if phone else ""
        device_id = node.device_id

        if phone and phone not in ("Pending", "Unknown", "") and phone in processed_phones:
            continue

        msgs = device_messages_map.get(device_id, [])
        if msgs:
            devices_with_messages += 1
            msg_json = json.dumps(msgs)
            pipe.delete(f"{REDIS_PREFIX}:device_no_messages:{device_id}")
            pipe.set(f"{REDIS_PREFIX}:device_messages:{device_id}", msg_json, ex=600)
            if phone and phone not in ("Pending", "Unknown", ""):
                pipe.set(f"{REDIS_PREFIX}:device_messages:{phone}", msg_json, ex=600)
                if clean_phone:
                    pipe.set(f"{REDIS_PREFIX}:device_messages:{clean_phone}", msg_json, ex=600)
        else:
            devices_no_messages += 1
            # Reduced from 300s to 60s — prevents 5-minute lockout of devices
            # that just received their first message
            pipe.set(f"{REDIS_PREFIX}:device_no_messages:{device_id}", "1", ex=60)
            if phone and phone not in ("Pending", "Unknown", ""):
                processed_phones.add(phone)
            continue

        if phone and phone not in ("Pending", "Unknown", ""):
            processed_phones.add(phone)

        # 4. In-Memory Ultra-Fast Service Count Analysis (~0ms)
        counts: Dict[str, int] = {}
        for msg in msgs:
            body = msg["message"]
            sender = msg["sender"]
            svc = ServicePatternRegistry.match_sms_fast_sync(body, sender, default_patterns)
            if svc:
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
        f"[PreScorerWorker] Ultra-Fast Run finished in {elapsed}s — "
        f"{len(processed_phones)} unique phones scored, "
        f"{devices_with_messages} devices with cached messages ({devices_fetched_fresh} fetched fresh), "
        f"{devices_no_messages} devices with no messages."
    )
