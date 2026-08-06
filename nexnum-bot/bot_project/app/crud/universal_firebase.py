# app/crud/universal_firebase.py
"""
Universal Firebase Mapper & Multi-Schema Router
Unifies multiple Firebase database instances running different schemas:
- 'gateways': SilentGate modern schema (/gateways/{device_id})
- 'clients': Legacy client schema (/clients/{client_id})
- 'auto': Probes both endpoints dynamically
"""
import logging
from typing import Dict, Any, List, Optional, Tuple
import httpx

from app.core.config import get_settings
from app.crud.schema_adapter import FirebaseSchemaAdapter, DeviceSimNode

logger = logging.getLogger(__name__)
settings = get_settings()


class UniversalFirebaseNode:
    """
    Encapsulates a single Firebase database node and its declared schema type.
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

    def fetch_raw_data(self) -> Dict[str, Any]:
        """
        Fetches raw device dictionary from Firebase based on the node's schema_type.
        Returns normalized dictionary of {device_id: raw_data}.
        """
        combined = {}
        with httpx.Client(timeout=10.0) as client:
            # 1. Fetch /gateways if schema is 'gateways' or 'auto'
            if self.schema_type in ("gateways", "auto"):
                try:
                    resp = client.get(self._build_url("/gateways"))
                    if resp.status_code == 200 and resp.json():
                        data = resp.json()
                        if isinstance(data, dict):
                            combined.update(data)
                except Exception as e:
                    logger.warning(f"UniversalFirebase [{self.node_id}] /gateways error: {e}")

            # 2. Fetch /clients if schema is 'clients' or 'auto'
            if self.schema_type in ("clients", "auto"):
                try:
                    resp = client.get(self._build_url("/clients"))
                    if resp.status_code == 200 and resp.json():
                        data = resp.json()
                        if isinstance(data, dict):
                            combined.update(data)
                except Exception as e:
                    logger.warning(f"UniversalFirebase [{self.node_id}] /clients error: {e}")

        return combined

    def parse_sim_nodes(self) -> List[DeviceSimNode]:
        raw_dict = self.fetch_raw_data()
        sim_nodes = []
        for dev_id, raw_data in raw_dict.items():
            parsed = FirebaseSchemaAdapter.parse_node(
                device_id=dev_id,
                raw_node=raw_data,
                firebase_node_id=self.node_id
            )
            sim_nodes.extend(parsed)
        return sim_nodes

    def send_command(self, device_id: str, command_payload: dict) -> bool:
        """
        Sends command payload to the correct location depending on node schema.
        """
        with httpx.Client(timeout=10.0) as client:
            if self.schema_type in ("gateways", "auto"):
                url = self._build_url(f"/gateways/{device_id}/commands")
                try:
                    resp = client.post(url, json=command_payload)
                    if resp.status_code == 200:
                        return True
                except Exception:
                    pass

            if self.schema_type in ("clients", "auto"):
                url = self._build_url(f"/clients/{device_id}/command")
                try:
                    resp = client.put(url, json=command_payload)
                    if resp.status_code == 200:
                        return True
                except Exception:
                    pass

        return False


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
    def fetch_all_sim_nodes(cls) -> List[DeviceSimNode]:
        """
        Queries all declared Firebase nodes concurrently and aggregates allocatable DeviceSimNodes.
        """
        from concurrent.futures import ThreadPoolExecutor
        nodes = cls.get_nodes()
        if not nodes:
            return []

        all_sims: List[DeviceSimNode] = []
        with ThreadPoolExecutor(max_workers=max(4, len(nodes) * 2)) as executor:
            futures = [executor.submit(node.parse_sim_nodes) for node in nodes]
            for fut in futures:
                try:
                    res = fut.result()
                    all_sims.extend(res)
                except Exception as e:
                    logger.error(f"[UniversalFirebaseRegistry] Node execution error: {e}")

        return all_sims
