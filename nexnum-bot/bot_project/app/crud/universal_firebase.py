# app/crud/universal_firebase.py
"""
Universal Firebase Mapper & Multi-Schema Router
Unifies multiple Firebase database instances running different schemas:
- 'gateways': SilentGate modern schema (/gateways/{device_id})
- 'clients': Legacy client schema (/clients/{client_id})
- 'auto': Probes both endpoints dynamically
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional, Tuple
import httpx

from app.core.config import get_settings
from app.core.http_pool import get_http_client
from app.crud.schema_adapter import FirebaseSchemaAdapter, DeviceSimNode

logger = logging.getLogger(__name__)
settings = get_settings()


class UniversalFirebaseNode:
    """
    Encapsulates a single Firebase database node and its declared schema type.
    Uses shared AsyncClient HTTP connection pool.
    """
    def __init__(self, node_id: str, url: str, auth: str = "", schema_type: str = "auto"):
        self.node_id = node_id
        self.url = url.rstrip("/")
        self.auth = auth
        self.schema_type = schema_type.lower() if schema_type in ("gateways", "clients", "auto") else "auto"

    def _build_url(self, path: str, params: str = "") -> str:
        sep = "&" if "?" in path else "?"
        url = f"{self.url}{path}.json"
        if self.auth:
            url += f"{sep}auth={self.auth}"
        if params:
            url += f"&{params}" if "?" in url else f"?{params}"
        return url

    async def fetch_raw_data_async(self) -> Dict[str, Any]:
        """
        Asynchronously fetches raw device dictionary from Firebase.
        Uses shared AsyncClient connection pool.
        """
        combined = {}
        client = await get_http_client()

        # 1. Fetch /gateways if schema is 'gateways' or 'auto'
        if self.schema_type in ("gateways", "auto"):
            try:
                resp = await client.get(self._build_url("/gateways"))
                if resp.status_code == 200 and resp.json():
                    data = resp.json()
                    if isinstance(data, dict):
                        combined.update(data)
            except Exception as e:
                logger.warning(f"UniversalFirebase [{self.node_id}] /gateways error: {e}")

        # 2. Fetch /clients if schema is 'clients' or 'auto'
        if self.schema_type in ("clients", "auto"):
            try:
                resp = await client.get(self._build_url("/clients"))
                if resp.status_code == 200 and resp.json():
                    data = resp.json()
                    if isinstance(data, dict):
                        combined.update(data)
            except Exception as e:
                logger.warning(f"UniversalFirebase [{self.node_id}] /clients error: {e}")

        return combined

    def fetch_raw_data(self) -> Dict[str, Any]:
        """Synchronous wrapper for legacy callers."""
        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                # Run in executor to avoid event loop blocking
                return asyncio.run_coroutine_threadsafe(self.fetch_raw_data_async(), loop).result()
        except RuntimeError:
            pass
        return asyncio.run(self.fetch_raw_data_async())

    async def parse_sim_nodes_async(self) -> List[DeviceSimNode]:
        raw_dict = await self.fetch_raw_data_async()
        sim_nodes = []
        try:
            from app.crud.firebase_crud import GLOBAL_PHONE_CACHE
        except ImportError:
            GLOBAL_PHONE_CACHE = {}

        for dev_id, raw_data in raw_dict.items():
            if isinstance(raw_data, dict):
                if not raw_data.get("mobNo") and dev_id in GLOBAL_PHONE_CACHE:
                    raw_data["mobNo"] = GLOBAL_PHONE_CACHE[dev_id]

            parsed = FirebaseSchemaAdapter.parse_node(
                device_id=dev_id,
                node_data=raw_data if isinstance(raw_data, dict) else {},
                firebase_node_id=self.node_id
            )
            sim_nodes.extend(parsed)
        return sim_nodes

    def parse_sim_nodes(self) -> List[DeviceSimNode]:
        """Synchronous wrapper for legacy callers."""
        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                return asyncio.run_coroutine_threadsafe(self.parse_sim_nodes_async(), loop).result()
        except RuntimeError:
            pass
        return asyncio.run(self.parse_sim_nodes_async())

    async def send_command_async(self, device_id: str, command_payload: dict) -> bool:
        """
        Asynchronously sends command payload to Firebase using shared AsyncClient.
        """
        client = await get_http_client()
        if self.schema_type in ("gateways", "auto"):
            url = self._build_url(f"/gateways/{device_id}/commands")
            try:
                resp = await client.post(url, json=command_payload)
                if resp.status_code == 200:
                    return True
            except Exception as e:
                logger.warning(f"UniversalFirebase [{self.node_id}] send_command gateway error: {e}")

        if self.schema_type in ("clients", "auto"):
            url = self._build_url(f"/clients/{device_id}/command")
            try:
                resp = await client.put(url, json=command_payload)
                if resp.status_code == 200:
                    return True
            except Exception as e:
                logger.warning(f"UniversalFirebase [{self.node_id}] send_command client error: {e}")

        return False

    def send_command(self, device_id: str, command_payload: dict) -> bool:
        """Synchronous wrapper for legacy callers."""
        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                return asyncio.run_coroutine_threadsafe(self.send_command_async(device_id, command_payload), loop).result()
        except RuntimeError:
            pass
        return asyncio.run(self.send_command_async(device_id, command_payload))


class UniversalFirebaseRegistry:
    """
    Global Registry managing all declared Firebase database instances.
    """
    _nodes: List[UniversalFirebaseNode] = []

    @classmethod
    def load_nodes(cls) -> List[UniversalFirebaseNode]:
        raw_configs = settings.get_firebase_nodes()
        cls._nodes = [
            UniversalFirebaseNode(
                node_id=cfg.get("id", f"node_{i+1}"),
                url=cfg.get("url", ""),
                auth=cfg.get("auth", ""),
                schema_type=cfg.get("schema_type", "auto")
            )
            for i, cfg in enumerate(raw_configs) if cfg.get("url")
        ]
        logger.info(f"[UniversalFirebaseRegistry] Loaded {len(cls._nodes)} active Firebase nodes.")
        return cls._nodes

    @classmethod
    def get_nodes(cls) -> List[UniversalFirebaseNode]:
        if not cls._nodes:
            cls.load_nodes()
        return cls._nodes

    @classmethod
    async def fetch_all_sim_nodes_async(cls) -> List[DeviceSimNode]:
        """
        Asynchronously queries all declared Firebase nodes using asyncio gather.
        """
        nodes = cls.get_nodes()
        if not nodes:
            return []

        tasks = [node.parse_sim_nodes_async() for node in nodes]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_sims: List[DeviceSimNode] = []
        for res in results:
            if isinstance(res, list):
                all_sims.extend(res)
            elif isinstance(res, Exception):
                logger.error(f"[UniversalFirebaseRegistry] Async node execution error: {res}")

        return all_sims

    @classmethod
    def fetch_all_sim_nodes(cls) -> List[DeviceSimNode]:
        """
        Queries all declared Firebase nodes concurrently.
        """
        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                # In running loop: execute async version natively via run_coroutine_threadsafe or gather
                fut = asyncio.run_coroutine_threadsafe(cls.fetch_all_sim_nodes_async(), loop)
                return fut.result()
        except RuntimeError:
            pass
        return asyncio.run(cls.fetch_all_sim_nodes_async())
