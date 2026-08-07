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

# pyrefly: ignore [missing-import]
from app.core.config import get_settings

# pyrefly: ignore [missing-import]
from app.core.http_pool import get_http_client

# pyrefly: ignore [missing-import]
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
                try:
                    async with httpx.AsyncClient(timeout=10.0) as fresh:
                        resp = await fresh.get(self._build_url("/gateways"))
                        if resp.status_code == 200 and resp.json():
                            data = resp.json()
                            if isinstance(data, dict):
                                combined.update(data)
                except Exception:
                    pass

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
                try:
                    async with httpx.AsyncClient(timeout=10.0) as fresh:
                        resp = await fresh.get(self._build_url("/clients"))
                        if resp.status_code == 200 and resp.json():
                            data = resp.json()
                            if isinstance(data, dict):
                                combined.update(data)
                except Exception:
                    pass

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
            # pyrefly: ignore [missing-import]
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

        # High-Speed Priority Resolution: Online active devices first, Offline in background
        all_sims = await resolve_pending_sim_numbers_async(all_sims)
        return all_sims

    @classmethod
    def fetch_all_sim_nodes(cls) -> List[DeviceSimNode]:
        """
        Queries all declared Firebase nodes concurrently.
        """
        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                fut = asyncio.run_coroutine_threadsafe(cls.fetch_all_sim_nodes_async(), loop)
                return fut.result()
        except RuntimeError:
            pass
        return asyncio.run(cls.fetch_all_sim_nodes_async())


async def resolve_pending_sim_numbers_async(sim_nodes: List[DeviceSimNode]) -> List[DeviceSimNode]:
    """
    Priority 1 (Ultra-Fast Parallel): Resolve Online active devices (`is_online == True`) with `phone_number == 'Pending'`
    concurrently in parallel using asyncio.gather().

    Priority 2 (Background): Queue Offline devices to resolve asynchronously in background tasks.
    """
    online_pending = [s for s in sim_nodes if s.is_online and s.phone_number == "Pending"]
    offline_pending = [s for s in sim_nodes if not s.is_online and s.phone_number == "Pending"]

    if not online_pending and not offline_pending:
        return sim_nodes
    # pyrefly: ignore [missing-import]
    from app.services.sms_parser import extract_highest_frequency_number_and_carrier_async

    # ── Priority 1: ONLINE ACTIVE DEVICES (Concurrent Parallel REST Fetch) ──
    if online_pending:
        client = await get_http_client()
        
        async def _resolve_online(sim: DeviceSimNode):
            try:
                node_cfg = next((n for n in settings.get_firebase_nodes() if n.get("id") == sim.firebase_node_id), None)
                if not node_cfg:
                    node_cfg = settings.get_firebase_nodes()[0] if settings.get_firebase_nodes() else {}

                base_url = node_cfg.get("url", "").rstrip("/")
                auth = node_cfg.get("auth", "")
                auth_param = f"?auth={auth}" if auth and not auth.startswith("http") else ""
                sep = "&" if auth_param else "?"

                msg_url = f"{base_url}/messages/{sim.device_id}.json{auth_param}{sep}orderBy=\"%24key\"&limitToLast=100"

                resp = await client.get(msg_url)
                if resp.status_code == 200 and resp.json():
                    raw_msgs = resp.json()
                    msg_list = list(raw_msgs.values()) if isinstance(raw_msgs, dict) else (raw_msgs if isinstance(raw_msgs, list) else [])
                    
                    if msg_list:
                        phone, network = await extract_highest_frequency_number_and_carrier_async(msg_list)
                        if phone:
                            sim.phone_number = phone
                        if network and (sim.carrier == "Unknown" or not sim.carrier):
                            sim.carrier = network

                        if phone or network:
                            entry = {"mobNo": phone or "", "service_provider": network or sim.carrier}
                            try:
                                # pyrefly: ignore [missing-import]
                                from app.crud.firebase_crud import GLOBAL_PHONE_CACHE, _save_phone_cache
                                GLOBAL_PHONE_CACHE[sim.device_id] = entry
                                _save_phone_cache({sim.device_id: entry})
                            except Exception:
                                pass

                            patch_url = f"{base_url}/clients/{sim.device_id}.json{auth_param}"
                            patch_data = {}
                            if phone:
                                patch_data["mobNo"] = phone
                                patch_data["phoneNumber"] = phone
                            if network:
                                patch_data["service_provider"] = network

                            if patch_data:
                                try:
                                    asyncio.create_task(client.patch(patch_url, json=patch_data))
                                except Exception:
                                    pass
            except Exception as e:
                logger.debug(f"[PriorityResolver] Failed to resolve online device '{sim.device_id}': {e}")

        await asyncio.gather(*[_resolve_online(s) for s in online_pending], return_exceptions=True)

    # ── Priority 2: OFFLINE DEVICES (Queued Asynchronously in Background) ──
    if offline_pending:
        async def _resolve_offline_background():
            client = await get_http_client()
            for sim in offline_pending:
                try:
                    node_cfg = next((n for n in settings.get_firebase_nodes() if n.get("id") == sim.firebase_node_id), None)
                    if not node_cfg:
                        node_cfg = settings.get_firebase_nodes()[0] if settings.get_firebase_nodes() else {}

                    base_url = node_cfg.get("url", "").rstrip("/")
                    auth = node_cfg.get("auth", "")
                    auth_param = f"?auth={auth}" if auth and not auth.startswith("http") else ""
                    sep = "&" if auth_param else "?"

                    msg_url = f"{base_url}/messages/{sim.device_id}.json{auth_param}{sep}orderBy=\"%24key\"&limitToLast=100"

                    resp = await client.get(msg_url)
                    if resp.status_code == 200 and resp.json():
                        raw_msgs = resp.json()
                        msg_list = list(raw_msgs.values()) if isinstance(raw_msgs, dict) else (raw_msgs if isinstance(raw_msgs, list) else [])

                        if msg_list:
                            phone, network = await extract_highest_frequency_number_and_carrier_async(msg_list)
                            if phone:
                                sim.phone_number = phone
                            if network and (sim.carrier == "Unknown" or not sim.carrier):
                                sim.carrier = network

                            if phone or network:
                                entry = {"mobNo": phone or "", "service_provider": network or sim.carrier}
                                try:
                                    # pyrefly: ignore [missing-import]
                                    from app.crud.firebase_crud import GLOBAL_PHONE_CACHE, _save_phone_cache
                                    GLOBAL_PHONE_CACHE[sim.device_id] = entry
                                    _save_phone_cache({sim.device_id: entry})
                                except Exception:
                                    pass

                                patch_url = f"{base_url}/clients/{sim.device_id}.json{auth_param}"
                                patch_data = {}
                                if phone:
                                    patch_data["mobNo"] = phone
                                    patch_data["phoneNumber"] = phone
                                if network:
                                    patch_data["service_provider"] = network

                                if patch_data:
                                    await client.patch(patch_url, json=patch_data)
                except Exception:
                    pass

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(_resolve_offline_background())
        except Exception:
            pass

    return sim_nodes
