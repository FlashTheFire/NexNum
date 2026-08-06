# app/services/firebase_stream.py
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Dict, Any, List, Optional
import httpx

from app.core.config import get_settings
from app.gateway.router import get_all_activations, save_activation

logger = logging.getLogger(__name__)
settings = get_settings()

FIREBASE_NODES = settings.get_firebase_nodes()

class FirebaseStreamManager:
    def __init__(self):
        self._tasks: List[asyncio.Task] = []
        self._running: bool = False

    async def start_listeners(self):
        """Launch background streaming tasks for all configured Firebase nodes."""
        if self._running:
            return
        self._running = True
        
        nodes = FIREBASE_NODES
        if not nodes:
            logger.warning("No Firebase database nodes configured for streaming.")
            return

        logger.info(f"Starting Firebase SSE Real-Time Stream Listeners for {len(nodes)} database nodes...")
        for node in nodes:
            task = asyncio.create_task(self._listen_node_stream(node))
            self._tasks.append(task)

    async def stop_listeners(self):
        """Stop all running stream listener tasks gracefully."""
        self._running = False
        for task in self._tasks:
            if not task.done():
                task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        logger.info("Firebase SSE Real-Time Stream Listeners stopped.")

    async def _listen_node_stream(self, node: Dict[str, str]):
        node_id = node.get("id", "unknown")
        node_url = node.get("url", "").rstrip("/")
        auth_token = node.get("auth", "")
        
        stream_url = f"{node_url}/messages.json"
        if auth_token:
            stream_url += f"?auth={auth_token}"

        backoff = 2.0
        headers = {"Accept": "text/event-stream"}

        while self._running:
            stream_start_ms = (time.time() - 30) * 1000  # 30s margin for initial connection

            try:
                logger.info(f"Connecting SSE Stream to Firebase [{node_id}] -> {node_url}/messages.json")
                async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=None, write=10.0, pool=None)) as client:
                    async with client.stream("GET", stream_url, headers=headers) as response:
                        if response.status_code != 200:
                            logger.error(f"Firebase [{node_id}] stream HTTP {response.status_code}. Retrying in {backoff}s...")
                            await asyncio.sleep(backoff)
                            backoff = min(backoff * 2, 30.0)
                            continue

                        # Reset backoff on successful connection
                        backoff = 2.0
                        logger.info(f"Connected to Firebase [{node_id}] SSE Stream successfully.")

                        current_event = None
                        async for line in response.aiter_lines():
                            if not self._running:
                                break
                            
                            line = line.strip()
                            if not line:
                                continue

                            if line.startswith("event:"):
                                current_event = line[6:].strip()
                            elif line.startswith("data:"):
                                data_str = line[5:].strip()
                                if current_event in ("put", "patch"):
                                    await self._process_stream_event(node_id, current_event, data_str, stream_start_ms)
                                current_event = None

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning(f"Firebase [{node_id}] SSE stream error: {exc}. Reconnecting in {backoff}s...")
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)

    async def _process_stream_event(self, node_id: str, event_type: str, data_str: str, stream_start_ms: float):
        try:
            payload = json.loads(data_str)
        except Exception:
            return

        if not isinstance(payload, dict):
            return

        path = payload.get("path", "")
        data = payload.get("data")
        if data is None:
            return

        # Parse messages from put/patch paths
        messages_to_process: List[tuple[str, dict]] = []  # List of (client_id, message_dict)

        path_parts = [p for p in path.strip("/").split("/") if p]
        
        # Scenario 1: Path is /client_id/timestamp -> data is single message dict
        if len(path_parts) >= 2 and isinstance(data, dict) and "message" in data:
            client_id = path_parts[0]
            messages_to_process.append((client_id, data))

        # Scenario 2: Path is /client_id -> data is dictionary of timestamp -> message_dict
        elif len(path_parts) == 1 and isinstance(data, dict):
            client_id = path_parts[0]
            for ts_key, msg_obj in data.items():
                if isinstance(msg_obj, dict) and "message" in msg_obj:
                    messages_to_process.append((client_id, msg_obj))

        # Scenario 3: Path is / (Root dump on initial connect or bulk update)
        elif len(path_parts) == 0 and isinstance(data, dict):
            for cid, msgs in data.items():
                if isinstance(msgs, dict):
                    for ts_key, msg_obj in msgs.items():
                        if isinstance(msg_obj, dict) and "message" in msg_obj:
                            messages_to_process.append((cid, msg_obj))

        if not messages_to_process:
            return

        # Filter and match messages
        for client_id, msg in messages_to_process:
            msg_ts = msg.get("timestamp") or msg.get("id") or 0
            try:
                msg_ts = float(msg_ts)
            except Exception:
                msg_ts = 0

            # Ignore initial dump of historical messages older than connection start
            if msg_ts < stream_start_ms:
                continue

            msg_text = msg.get("message", "").strip()
            if not msg_text:
                continue

            await self._match_sms_to_activation(node_id, client_id, msg_text, msg_ts, msg)

    async def _match_sms_to_activation(self, node_id: str, client_id: str, msg_text: str, msg_ts: float, full_msg: dict):
        # ─── Phase 1: Also push to Redis Stream (unified inbound pipeline) ────
        await self._push_to_inbound_stream(node_id, client_id, msg_text, msg_ts, full_msg)

        # ─── Legacy direct-match (backward compatible, will be removed in Phase 3) ─
        activations = await get_all_activations()
        if not activations:
            return

        now = time.time()
        for act_id, act in activations.items():
            if act.get("status") in ("STATUS_CANCEL", "STATUS_OK"):
                continue

            # Match client_id
            if act.get("client_id") == client_id:
                created_ms = act.get("created", 0) * 1000
                if msg_ts >= created_ms:
                    act["has_sms"] = True
                    act["received_messages"] = [full_msg]
                    act["code_text"] = msg_text
                    act["sms_time"] = msg_ts
                    act["status"] = "STATUS_OK"
                    await save_activation(act_id, act)
                    logger.info(f"[SSE STREAM match] Activation {act_id} matched live SMS from Client {client_id}: '{msg_text}'")

    async def _push_to_inbound_stream(self, node_id: str, client_id: str, msg_text: str, msg_ts: float, full_msg: dict):
        """Push Firebase SSE message to same Redis Stream as webhook inbound."""
        try:
            from utils.redis_manager import redis_manager
        except ImportError:
            from bot_project.utils.redis_manager import redis_manager

        redis_client = await redis_manager.get_client()
        if redis_client is None:
            return

        # Dedup: Check if webhook already delivered this message
        dedup_key = f"nexsms:dedup:{client_id}:{int(msg_ts)}"
        try:
            already_exists = await redis_client.exists(dedup_key)
            if already_exists:
                logger.debug(f"[SSE] Skipping duplicate (already via webhook): {client_id}:{int(msg_ts)}")
                return

            # Set dedup key so webhook won't re-process either
            await redis_client.set(dedup_key, "1", nx=True, ex=settings.INBOUND_DEDUP_TTL)
        except Exception as e:
            logger.warning(f"[SSE] Dedup check failed: {e}. Proceeding anyway.")

        # Push to inbound stream
        stream_name = settings.REDIS_STREAM_INBOUND
        entry = {
            "deviceId": client_id,
            "timestamp": str(int(msg_ts)),
            "sender": full_msg.get("sender", ""),
            "body": msg_text,
            "isOtp": "0",
            "otpCode": "",
            "simSlot": "0",
            "ingest_ts": str(int(time.time() * 1000)),
            "source": f"firebase_sse:{node_id}",
        }
        try:
            msg_id = await redis_client.xadd(stream_name, entry)
            logger.debug(f"[SSE→Stream] Pushed {client_id} message to stream: {msg_id}")
        except Exception as e:
            logger.warning(f"[SSE→Stream] Failed to push to stream: {e}")

firebase_stream_manager = FirebaseStreamManager()

