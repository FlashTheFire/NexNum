# app/crud/firebase_crud.py
from typing import Dict, Any, List, Optional
from app.core.config import get_settings
import httpx
import logging
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)
settings = get_settings()

# Multi-Node Firebase Setup
FIREBASE_NODES = settings.get_firebase_nodes()

# In-Memory Routing Map: client_id -> node_dict
CLIENT_NODE_MAP: Dict[str, Dict[str, str]] = {}

# ThreadPoolExecutor for concurrent parallel database requests
_CRUD_EXECUTOR = ThreadPoolExecutor(max_workers=16)

def _firebase_request_node(node: Dict[str, str], method: str, path: str, json_data: dict = None, params: str = "") -> Any:
    """Execute HTTP REST request to a specific Firebase node."""
    url = f"{node['url']}{path}.json?auth={node['auth']}{params}"
    try:
        with httpx.Client(timeout=15.0) as client:
            if method.upper() == 'GET':
                resp = client.get(url)
            elif method.upper() == 'PUT':
                resp = client.put(url, json=json_data)
            elif method.upper() == 'PATCH':
                resp = client.patch(url, json=json_data)
            elif method.upper() == 'POST':
                resp = client.post(url, json=json_data)
            elif method.upper() == 'DELETE':
                resp = client.delete(url)
            else:
                raise ValueError(f"Unsupported method {method}")
                
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.error(f"Firebase [{node['id']}] API Error on {method} {path}: {exc}")
        return None

def _find_client_node(client_id: str) -> Optional[Dict[str, str]]:
    """Locate owning node for a client_id across all configured Firebase instances."""
    if client_id in CLIENT_NODE_MAP:
        return CLIENT_NODE_MAP[client_id]

    def probe(node):
        res = _firebase_request_node(node, 'GET', f'/clients/{client_id}')
        if res:
            return node
        return None

    futures = [_CRUD_EXECUTOR.submit(probe, n) for n in FIREBASE_NODES]
    for fut in futures:
        found_node = fut.result()
        if found_node:
            CLIENT_NODE_MAP[client_id] = found_node
            return found_node

    # Default to first node if unmapped
    return FIREBASE_NODES[0] if FIREBASE_NODES else None

import os
import json

# ---- Universal Aggregated Reads & Writes ----
CACHE_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "phone_cache.json")
REDIS_PHONE_CACHE_KEY = "nexsms:phone_cache"
GLOBAL_PHONE_CACHE: Dict[str, Dict[str, Any]] = {}

def _load_phone_cache() -> Dict[str, Dict[str, Any]]:
    """Load persistent phone cache from local JSON file."""
    global GLOBAL_PHONE_CACHE
    if GLOBAL_PHONE_CACHE:
        return GLOBAL_PHONE_CACHE
    try:
        if os.path.exists(CACHE_FILE_PATH):
            with open(CACHE_FILE_PATH, "r", encoding="utf-8") as f:
                GLOBAL_PHONE_CACHE = json.load(f)
                logger.info(f"[PhoneCache] Loaded {len(GLOBAL_PHONE_CACHE)} cached device phone numbers from JSON file.")
    except Exception as e:
        logger.warning(f"[PhoneCache] Failed to load JSON phone cache: {e}")
    return GLOBAL_PHONE_CACHE

def _save_phone_cache(updated_entries: Optional[Dict[str, Dict[str, Any]]] = None) -> None:
    """
    Saves in-memory phone cache to local JSON file AND syncs to Redis Hash nexsms:phone_cache.
    Atomic multi-layer persistence for zero lock contention and 0ms reads.
    """
    # 1. Save to disk (JSON file backup)
    try:
        os.makedirs(os.path.dirname(CACHE_FILE_PATH), exist_ok=True)
        temp_path = f"{CACHE_FILE_PATH}.tmp"
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(GLOBAL_PHONE_CACHE, f, indent=2)
        os.replace(temp_path, CACHE_FILE_PATH)
    except Exception as e:
        logger.warning(f"[PhoneCache] Failed to save JSON phone cache: {e}")

    # 2. Async/Threaded Push to Redis Hash for multi-process sharing
    if updated_entries:
        try:
            import asyncio
            async def _push_to_redis():
                try:
                    from utils.redis_manager import redis_manager
                    client = await redis_manager.get_client()
                    if client:
                        pipe = client.pipeline()
                        for cid, data in updated_entries.items():
                            pipe.hset(REDIS_PHONE_CACHE_KEY, cid, json.dumps(data))
                        await pipe.execute()
                except Exception as ex:
                    logger.debug(f"[PhoneCache] Redis sync background notice: {ex}")

            try:
                loop = asyncio.get_running_loop()
                if loop.is_running():
                    asyncio.create_task(_push_to_redis())
            except RuntimeError:
                pass
        except Exception:
            pass

# Initial load on import
_load_phone_cache()


def get_all_clients() -> Dict[str, Any]:
    """
    Fetch clients from all configured Firebase RTDB nodes concurrently.
    Merges all client dictionaries into a single master map {clientId: clientData}
    and registers client-to-node routing mappings.
    Applies persistent GLOBAL_PHONE_CACHE for instant 0ms number & network resolution.
    """
    cache_updated = False
    updated_entries: Dict[str, Dict[str, Any]] = {}
    aggregated_clients: Dict[str, Any] = {}

    def fetch_node(node):
        res = _firebase_request_node(node, 'GET', '/clients')
        if isinstance(res, dict):
            return node, res
        return node, {}

    futures = [_CRUD_EXECUTOR.submit(fetch_node, n) for n in FIREBASE_NODES]
    for fut in futures:
        node, clients_dict = fut.result()
        for cid, cdata in clients_dict.items():
            if isinstance(cdata, dict):
                cdata["firebase_id"] = node["id"]
                cdata["firebaseId"] = node["id"]

                # Extract phone & network from root, SIMs, smsAnalysis, or memory cache
                phone = cdata.get("mobNo") or cdata.get("phoneNumber") or cdata.get("number")
                network = cdata.get("service_provider") or cdata.get("network") or cdata.get("operator")

                # Fallback 1: SIMs array
                if not phone or not network:
                    sims = cdata.get("sims", [])
                    if isinstance(sims, list) and sims and isinstance(sims[0], dict):
                        if not phone:
                            phone = sims[0].get("phoneNumber") or sims[0].get("number")
                        if not network:
                            network = sims[0].get("carrier") or sims[0].get("operator")

                # Fallback 2: smsAnalysis
                if not phone or not network:
                    sms_analysis = cdata.get("smsAnalysis", {})
                    if isinstance(sms_analysis, dict):
                        if not phone and sms_analysis.get("phoneNumbers"):
                            phone = sms_analysis["phoneNumbers"][0]
                        if not network and sms_analysis.get("networks"):
                            network = sms_analysis["networks"][0]

                # Fallback 3: In-Memory Cache
                if not phone or not network:
                    if cid in GLOBAL_PHONE_CACHE:
                        cached = GLOBAL_PHONE_CACHE[cid]
                        if not phone:
                            phone = cached.get("mobNo")
                        if not network:
                            network = cached.get("service_provider")

                # Format phone with +91 uniformly
                if phone:
                    clean_p = str(phone).strip().replace(" ", "").replace("-", "")
                    if not clean_p.startswith("+"):
                        if len(clean_p) == 10 and clean_p[0] in "6789":
                            phone = f"+91{clean_p}"
                        elif clean_p.startswith("91") and len(clean_p) == 12:
                            phone = f"+{clean_p}"

                # Inject promoted fields into root cdata & update global cache
                if phone:
                    cdata["mobNo"] = phone
                    cdata["phoneNumber"] = phone
                if network:
                    cdata["service_provider"] = network
                    cdata["operator"] = network

                if phone or network:
                    old_entry = GLOBAL_PHONE_CACHE.get(cid)
                    new_entry = {"mobNo": phone, "service_provider": network}
                    if old_entry != new_entry:
                        GLOBAL_PHONE_CACHE[cid] = new_entry
                        updated_entries[cid] = new_entry
                        cache_updated = True

                aggregated_clients[cid] = cdata
                CLIENT_NODE_MAP[cid] = node

    if cache_updated:
        _save_phone_cache(updated_entries)

    return aggregated_clients


def get_all_sim_nodes() -> List[Any]:
    """
    Universal Multi-Schema Aggregator:
    Queries all declared Firebase nodes via UniversalFirebaseRegistry, running whichever
    schema each node is declared to use ('gateways', 'clients', or 'auto').
    """
    from app.crud.universal_firebase import UniversalFirebaseRegistry
    sim_nodes = UniversalFirebaseRegistry.fetch_all_sim_nodes()
    logger.info(f"[SchemaAdapter] Aggregated {len(sim_nodes)} valid allocatable SIM nodes across Universal Firebase Registry")
    return sim_nodes


def get_client(client_id: str) -> Optional[Dict[str, Any]]:
    """Get single client data from its owning Firebase node."""
    node = _find_client_node(client_id)
    if not node:
        return None
    res = _firebase_request_node(node, 'GET', f'/clients/{client_id}')
    if res and isinstance(res, dict):
        res["firebase_id"] = node["id"]
        res["firebaseId"] = node["id"]
        CLIENT_NODE_MAP[client_id] = node
        return res
    return None

def update_client(client_id: str, data: Dict[str, Any]) -> None:
    """Update client fields on its owning Firebase node."""
    node = _find_client_node(client_id)
    if node:
        _firebase_request_node(node, 'PATCH', f'/clients/{client_id}', json_data=data)

def set_webhook_event(client_id: str, command_data: Dict[str, Any]) -> None:
    """Set webhookEvent.sendSms for a client on its owning Firebase node."""
    node = _find_client_node(client_id)
    if node:
        _firebase_request_node(node, 'PUT', f'/clients/{client_id}/webhookEvent', json_data=command_data)

def get_webhook_event(client_id: str) -> Optional[Dict[str, Any]]:
    node = _find_client_node(client_id)
    if node:
        return _firebase_request_node(node, 'GET', f'/clients/{client_id}/webhookEvent')
    return None

def clear_webhook_event(client_id: str) -> None:
    node = _find_client_node(client_id)
    if node:
        _firebase_request_node(node, 'DELETE', f'/clients/{client_id}/webhookEvent')

def get_incoming_messages(client_id: str, limit: int = 150) -> List[Dict[str, Any]]:
    """Get last 'limit' incoming messages for a client from its owning Firebase node."""
    node = _find_client_node(client_id)
    if not node:
        return []
    params = f"&orderBy=%22%24key%22&limitToLast={limit}"
    result = _firebase_request_node(node, 'GET', f'/messages/{client_id}', params=params) or {}
    
    messages = []
    if isinstance(result, dict):
        for key, val in result.items():
            if isinstance(val, dict):
                try:
                    val['id'] = int(key)
                except ValueError:
                    val['id'] = key
                messages.append(val)
    # Sort by id descending
    messages.sort(key=lambda x: str(x.get('id', '')), reverse=True)
    return messages

def get_client_messages(client_id: str, limit: int = 150) -> Any:
    """Fetch client messages map/list from owning node."""
    node = _find_client_node(client_id)
    if not node:
        return {}
    params = f"&orderBy=%22%24key%22&limitToLast={limit}"
    return _firebase_request_node(node, 'GET', f'/messages/{client_id}', params=params) or {}

def get_client_id_by_phone(phone: str) -> Optional[str]:
    """Lookup clientId by phone number across all Firebase nodes concurrently."""
    def probe(node):
        return _firebase_request_node(node, 'GET', f'/phoneMapping/{phone}')

    futures = [_CRUD_EXECUTOR.submit(probe, n) for n in FIREBASE_NODES]
    for fut in futures:
        cid = fut.result()
        if cid and isinstance(cid, str):
            return cid
    return None

def log_outgoing_message(client_id: str, command_data: Dict[str, Any]) -> None:
    """Append outgoing message log on owning Firebase node."""
    node = _find_client_node(client_id)
    if node:
        _firebase_request_node(node, 'POST', f'/clients/{client_id}/messages', json_data=command_data)

def store_incoming_message(client_id: str, timestamp: int, data: dict):
    """Store incoming message on owning Firebase node."""
    node = _find_client_node(client_id)
    if node:
        _firebase_request_node(node, 'PUT', f"/messages/{client_id}/{timestamp}", json_data=data)

def get_client_sms_analysis(client_id: str) -> Optional[dict]:
    node = _find_client_node(client_id)
    if node:
        return _firebase_request_node(node, 'GET', f"/clients/{client_id}/smsAnalysis")
    return None

def update_client_sms_analysis(client_id: str, data: dict):
    node = _find_client_node(client_id)
    if node:
        _firebase_request_node(node, 'PATCH', f"/clients/{client_id}/smsAnalysis", json_data=data)