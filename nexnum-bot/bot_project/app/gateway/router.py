# app/gateway/router.py
from __future__ import annotations

import re
import time
import random
import logging
import httpx
from datetime import datetime
from typing import Dict, Optional

from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse, JSONResponse

from app.core.config import get_settings
from app.services.sms_parser import extract_otp_code

settings = get_settings()
logger = logging.getLogger(__name__)

router = APIRouter(tags=["SMS Gateway"])

# -----------------------------------------------------------------------------
# Configuration – use the same FireXPanel backend
# -----------------------------------------------------------------------------
FX_API_BASE = "http://127.0.0.1:8000"
FX_API_KEY = settings.API_KEY
FX_HEADERS = {"X-API-Key": FX_API_KEY, "Content-Type": "application/json"}

# -----------------------------------------------------------------------------
# Redis Integration & Local Fallback States
# -----------------------------------------------------------------------------
try:
    from utils.redis_manager import redis_manager
except ImportError:
    from bot_project.utils.redis_manager import redis_manager

import json

_local_activations: Dict[str, dict] = {}
_local_number_last_allocated: Dict[str, float] = {}
_local_number_service_allocated: Dict[tuple, float] = {}

balance = 999999.00
REDIS_PREFIX = "nexsms"
GLOBAL_COOLDOWN_TTL = 300
SERVICE_COOLDOWN_TTL = 1200
ACTIVATION_TTL = 1200

async def get_redis_client():
    try:
        return await redis_manager.get_client()
    except Exception as e:
        logger.warning(f"Error retrieving Redis client: {e}. Falling back to in-memory store.")
        return None

async def check_global_cooldown(phone_number: str) -> float:
    client = await get_redis_client()
    if client:
        try:
            val = await client.get(f"{REDIS_PREFIX}:cooldown:global:{phone_number}")
            if val is not None:
                return float(val)
        except Exception as e:
            logger.warning(f"Redis error checking global cooldown: {e}")
    return _local_number_last_allocated.get(phone_number, 0.0)

async def set_global_cooldown(phone_number: str, timestamp: float):
    _local_number_last_allocated[phone_number] = timestamp
    client = await get_redis_client()
    if client:
        try:
            await client.set(f"{REDIS_PREFIX}:cooldown:global:{phone_number}", str(timestamp), ex=GLOBAL_COOLDOWN_TTL)
        except Exception as e:
            logger.warning(f"Redis error setting global cooldown: {e}")

async def check_service_cooldown(phone_number: str, service: str) -> float:
    client = await get_redis_client()
    if client:
        try:
            val = await client.get(f"{REDIS_PREFIX}:cooldown:service:{phone_number}:{service}")
            if val is not None:
                return float(val)
        except Exception as e:
            logger.warning(f"Redis error checking service cooldown: {e}")
    return _local_number_service_allocated.get((phone_number, service), 0.0)

async def set_service_cooldown(phone_number: str, service: str, timestamp: float):
    _local_number_service_allocated[(phone_number, service)] = timestamp
    client = await get_redis_client()
    if client:
        try:
            await client.set(f"{REDIS_PREFIX}:cooldown:service:{phone_number}:{service}", str(timestamp), ex=SERVICE_COOLDOWN_TTL)
        except Exception as e:
            logger.warning(f"Redis error setting service cooldown: {e}")

USER_NUMBER_COOLDOWN_TTL = 1800  # 30 minutes rule for same user

async def check_user_number_cooldown(user_id: str, phone_number: str) -> float:
    if not user_id:
        return 0.0
    client = await get_redis_client()
    if client:
        try:
            val = await client.get(f"{REDIS_PREFIX}:cooldown:user:{user_id}:{phone_number}")
            if val is not None:
                return float(val)
        except Exception as e:
            logger.warning(f"Redis error checking user number cooldown: {e}")
    return 0.0

async def set_user_number_cooldown(user_id: str, phone_number: str, timestamp: float):
    if not user_id:
        return
    client = await get_redis_client()
    if client:
        try:
            await client.set(f"{REDIS_PREFIX}:cooldown:user:{user_id}:{phone_number}", str(timestamp), ex=USER_NUMBER_COOLDOWN_TTL)
        except Exception as e:
            logger.warning(f"Redis error setting user number cooldown: {e}")


async def save_activation(activation_id: str, activation_data: dict):
    _local_activations[activation_id] = activation_data
    client = await get_redis_client()
    if client:
        try:
            await client.set(f"{REDIS_PREFIX}:activation:{activation_id}", json.dumps(activation_data), ex=ACTIVATION_TTL)
        except Exception as e:
            logger.warning(f"Redis error saving activation: {e}")

async def get_activation(activation_id: str) -> Optional[dict]:
    client = await get_redis_client()
    if client:
        try:
            val = await client.get(f"{REDIS_PREFIX}:activation:{activation_id}")
            if val is not None:
                return json.loads(val)
        except Exception as e:
            logger.warning(f"Redis error getting activation: {e}")
    return _local_activations.get(activation_id)

async def get_all_activations() -> Dict[str, dict]:
    client = await get_redis_client()
    if client:
        try:
            keys = await client.keys(f"{REDIS_PREFIX}:activation:*")
            if keys:
                pipe = client.pipeline()
                for key in keys:
                    pipe.get(key)
                results = await pipe.execute()
                res = {}
                for k, v in zip(keys, results):
                    if v:
                        act_id = k.split(":")[-1]
                        res[act_id] = json.loads(v)
                return res
        except Exception as e:
            logger.warning(f"Redis error listing all activations: {e}")
    return _local_activations

# -----------------------------------------------------------------------------
# HTTP helpers with redirect following
# -----------------------------------------------------------------------------
from app.crud import firebase_crud as crud

async def fx_get_clients():
    return crud.get_all_clients()

async def fx_get_messages(client_id: str, limit: int = 150):
    return crud.get_incoming_messages(client_id, limit=limit)

# -----------------------------------------------------------------------------
# Helper: extract phone number from client data
# -----------------------------------------------------------------------------
def get_phone_number(client_data: dict) -> Optional[str]:
    """Extract phone number from client data dictionary following FireXPanel fallback chain."""
    # 1. Direct keys
    for key in ["mobNo", "phoneNumber", "number", "phone", "simNumber"]:
        val = client_data.get(key)
        if val and val != "N/A":
            return str(val)
    # 2. Check sims array
    sims = client_data.get("sims", [])
    if isinstance(sims, list):
        for sim in sims:
            if isinstance(sim, dict):
                p = sim.get("phoneNumber") or sim.get("number")
                if p and p != "N/A":
                    return str(p)
    # 3. Check smsAnalysis phone numbers
    sms_analysis = client_data.get("smsAnalysis", {})
    if isinstance(sms_analysis, dict):
        for p in sms_analysis.get("phoneNumbers", []):
            if p and p != "N/A":
                return str(p)
    return None

# -------------------------------------------------------------------------------
# Gateway endpoints
# -----------------------------------------------------------------------------
@router.get("/stubs/handler_api.php", response_class=PlainTextResponse)
@router.get("/handler_api.php", response_class=PlainTextResponse)
async def handler_api(
    action: Optional[str] = Query(None),
    api_key: Optional[str] = Query(None),
    service: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    forward: Optional[str] = Query(None),
    operator: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    userId: Optional[str] = Query(None),
    user: Optional[str] = Query(None),
):
    global balance

    if not action:
        return "FireXPanel Gateway – Use /stubs/handler_api.php"

    if not api_key:
        return "BAD_KEY"

    action = action.lower()
    req_user_id = user_id or userId or user or ""

    # --- getBalance ---
    if action in ("getbalance", "balance"):
        return f"ACCESS_BALANCE:{balance:.2f}"

    # --- getNumber / getNumberV2 ---
    if action in ("getnumber", "getnumberv2"):
        try:
            sim_nodes = crud.get_all_sim_nodes()
        except Exception as e:
            logger.error(f"Failed to fetch SIM nodes: {e}")
            return "ERROR_SQL"

        req_service = (service or "ot").lower()
        now = time.time()

        # Phase 4: Deterministic Multi-Factor Device SIM Selection via DeviceScorer
        from app.gateway.scorer import DeviceScorer

        redis_client = await get_redis_client()
        selected_sim = await DeviceScorer.select_best_sim_node(
            redis_client=redis_client,
            sim_nodes=sim_nodes,
            service=req_service,
            user_id=req_user_id
        )

        if not selected_sim:
            logger.warning(f"No valid SIM nodes available for service '{req_service}' meeting scoring and cooldown requirements.")
            return "NO_NUMBERS"

        client_id = selected_sim.device_id
        phone_number = selected_sim.phone_number
        sim_slot = selected_sim.sim_slot

        # Update allocation cooldown timestamps (Service & User-to-number 30-min cooldowns)
        await set_service_cooldown(phone_number, req_service, now)
        if req_user_id:
            await set_user_number_cooldown(req_user_id, phone_number, now)

        act_id = f"{int(now * 1000)}{random.randint(10, 99)}"  # Unique numeric activation ID
        logger.info(f"Activation {act_id} created for Client {client_id} (User: {req_user_id}) with phone {phone_number}")

        clean_digits = phone_number.replace("+", "")
        svc_cost = 0.35

        act = {
            "id": act_id,
            "user_id": req_user_id,
            "client_id": client_id,
            "sim_slot": sim_slot,
            "service": req_service,
            "country": country or "22",
            "number": phone_number,
            "created": now,
            "expires_at": now + 1200,  # Total active order duration = 20 minutes
            "status": "STATUS_WAIT_CODE",
            "has_sms": False,
            "received_messages": [],
            "code_text": None,
        }
        await save_activation(act_id, act)

        json_resp = {
            "id": act_id,
            "activationId": int(act_id),
            "userId": req_user_id,
            "phone": clean_digits,
            "phoneNumber": clean_digits,
            "price": svc_cost,
            "cost": svc_cost,
            "amount": svc_cost,
            "activationCancel": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now + 300)),
            "activationEnd": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now + 1200)),
            "activationTime": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now)),
        }
        return JSONResponse(json_resp)

    # --- getStatus / getStatusV2 ---
    if action in ("getstatus", "getstatusv2"):
        if not id:
            return "NO_ACTIVATION"

        act_key = str(id)
        act = await get_activation(act_key)
        if not act:
            return "NO_ACTIVATION"

        client_id = act["client_id"]
        now = time.time()

        # Helper for status response in JSON format (matching dynamic provider json_object schema)
        def render_status_ok(full_text: str, msg_ts: float):
            dt_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(msg_ts / 1000 if msg_ts > 1e11 else msg_ts))
            extracted_code = extract_otp_code(full_text) or full_text
            return JSONResponse({
                "status": 2,
                "verificationType": 2,
                "fullSms": full_text,
                "fullText": full_text,
                "text": full_text,
                "content": full_text,
                "message": full_text,
                "code": extracted_code,
                "sms": {
                    "dateTime": dt_str,
                    "code": extracted_code,
                    "text": full_text
                }
            })

        # If already canceled or completed, return current state
        if act["status"] == "STATUS_CANCEL":
            return "STATUS_CANCEL"
        if act["status"] == "STATUS_OK" and act.get("code_text"):
            return render_status_ok(act["code_text"], act.get("sms_time", now))

        # Rule 1: 10-Minute Auto Cancel if NO SMS received under 10 minutes (600s)
        time_elapsed = now - act["created"]
        if not act["has_sms"] and time_elapsed >= 600:
            act["status"] = "STATUS_CANCEL"
            await save_activation(act_key, act)
            logger.info(f"Activation {id} auto-canceled after 10 mins with no incoming SMS.")
            return "STATUS_CANCEL"

        # Rule 2: 20-Minute Expiration Window for total activation
        if time_elapsed >= 1200:
            if not act["has_sms"]:
                act["status"] = "STATUS_CANCEL"
                await save_activation(act_key, act)
                return "STATUS_CANCEL"

        return "STATUS_WAIT_CODE"

    # --- getFullSms / getFullSmsText ---
    if action in ("getfullsms", "getfullsmstext"):
        if not id:
            return "NO_ACTIVATION"
        act_key = str(id)
        act = await get_activation(act_key)
        if not act:
            return "NO_ACTIVATION"

        if act.get("status") == "STATUS_CANCEL":
            return "STATUS_CANCEL"

        full_text = act.get("code_text")
        if not full_text and act.get("received_messages"):
            first_msg = act["received_messages"][0]
            if isinstance(first_msg, dict):
                full_text = first_msg.get("message")

        if full_text:
            extracted_code = extract_otp_code(full_text) or full_text
            return JSONResponse({
                "fullSms": full_text,
                "fullText": full_text,
                "text": full_text,
                "content": full_text,
                "message": full_text,
                "code": extracted_code,
                "sms": {
                    "text": full_text,
                    "code": extracted_code
                }
            })

        return "STATUS_WAIT_CODE"

    # --- setStatus ---
    if action == "setstatus":
        if not id:
            return "NO_ACTIVATION"

        act_key = str(id)
        act = await get_activation(act_key)
        if not act:
            return "NO_ACTIVATION"

        st = str(status or "")

        # Action = Cancel (status=-1 or 8)
        if st in ("-1", "8"):
            # Rule: If SMS was already received, CANNOT CANCEL!
            if act["has_sms"]:
                logger.warning(f"Attempted to cancel activation {id} but SMS has already been received.")
                return "BAD_STATUS"
            act["status"] = "STATUS_CANCEL"
            await save_activation(act_key, act)
            return "ACCESS_CANCEL"

        # Action = Complete (status=6)
        elif st == "6":
            # Rule: If no SMS received, CANNOT COMPLETE!
            if not act["has_sms"]:
                logger.warning(f"Attempted to complete activation {id} but no SMS has been received yet.")
                return "BAD_STATUS"
            act["status"] = "STATUS_OK"
            await save_activation(act_key, act)
            return "ACCESS_ACTIVATION"

        # Action = Ready (status=1)
        elif st == "1":
            act["status"] = "STATUS_WAIT_CODE"
            await save_activation(act_key, act)
            return "ACCESS_READY"

        # Action = Retry (status=3)
        elif st == "3":
            act["status"] = "STATUS_WAIT_CODE"
            await save_activation(act_key, act)
            return "ACCESS_RETRY_GET"

        else:
            return "BAD_STATUS"

    # --- Metadata & Pre-Computed Catalog endpoints (getPrices / getPricing) ---
    if action in ("getprices", "getpricesv2", "getpricesv3", "getpricing"):
        try:
            clients = await fx_get_clients()
            online_count = sum(1 for data in clients.values() if data.get("status") == True and get_phone_number(data))
        except Exception:
            online_count = 10

        services_catalog = [
            {"code": "go", "name": "Google/YouTube", "cost": 0.35},
            {"code": "tg", "name": "Telegram", "cost": 0.35},
            {"code": "wa", "name": "WhatsApp", "cost": 0.50},
            {"code": "fb", "name": "Facebook", "cost": 0.35},
            {"code": "ig", "name": "Instagram", "cost": 0.35},
            {"code": "tw", "name": "Twitter/X", "cost": 0.35},
            {"code": "vi", "name": "Viber", "cost": 0.35},
            {"code": "ds", "name": "Discord", "cost": 0.35},
            {"code": "ot", "name": "Other", "cost": 0.35},
            {"code": "mm", "name": "Microsoft", "cost": 0.35},
            {"code": "ya", "name": "Yahoo", "cost": 0.35},
            {"code": "am", "name": "Amazon", "cost": 0.35},
            {"code": "wx", "name": "Apple", "cost": 0.35},
            {"code": "lf", "name": "TikTok", "cost": 0.35},
            {"code": "vk", "name": "VK", "cost": 0.35},
            {"code": "ok", "name": "OK.ru", "cost": 0.35},
            {"code": "ma", "name": "Mail.ru", "cost": 0.35},
            {"code": "oi", "name": "Tinder", "cost": 0.35},
            {"code": "nz", "name": "Nike", "cost": 0.35},
            {"code": "hw", "name": "Alipay", "cost": 0.35},
        ]

        target_country = str(country) if country and country != "any" else "22"
        req_svc = service.lower() if service else None

        services_map = {}
        for s in services_catalog:
            code = s["code"]
            if not req_svc or code == req_svc:
                cost = s["cost"]
                count = max(1, online_count)
                services_map[code] = {
                    "cost": cost,
                    "price": cost,
                    "amount": cost,
                    "count": count,
                    "stock": count,
                    "operator": "any"
                }

        prices = {target_country: services_map}
        return JSONResponse(prices)

    if action in ("getcountries", "getcountrieslist"):
        countries = [
            {"id": 22, "code": 22, "eng": "India", "name": "India"}
        ]
        return JSONResponse(countries)

    if action in ("getservices", "getserviceslist"):
        services = [
            {"code": "go", "external_id": "go", "name": "Google/YouTube"},
            {"code": "tg", "external_id": "tg", "name": "Telegram"},
            {"code": "wa", "external_id": "wa", "name": "WhatsApp"},
            {"code": "fb", "external_id": "fb", "name": "Facebook"},
            {"code": "ig", "external_id": "ig", "name": "Instagram"},
            {"code": "tw", "external_id": "tw", "name": "Twitter/X"},
            {"code": "vi", "external_id": "vi", "name": "Viber"},
            {"code": "ds", "external_id": "ds", "name": "Discord"},
            {"code": "ot", "external_id": "ot", "name": "Other"},
            {"code": "mm", "external_id": "mm", "name": "Microsoft"},
            {"code": "ya", "external_id": "ya", "name": "Yahoo"},
            {"code": "am", "external_id": "am", "name": "Amazon"},
            {"code": "wx", "external_id": "wx", "name": "Apple"},
            {"code": "lf", "external_id": "lf", "name": "TikTok"},
            {"code": "vk", "external_id": "vk", "name": "VK"},
            {"code": "ok", "external_id": "ok", "name": "OK.ru"},
            {"code": "ma", "external_id": "ma", "name": "Mail.ru"},
            {"code": "oi", "external_id": "oi", "name": "Tinder"},
            {"code": "nz", "external_id": "nz", "name": "Nike"},
            {"code": "hw", "external_id": "hw", "name": "Alipay"},
        ]
        return JSONResponse(services)

    if action == "getactiveactivations":
        all_acts = await get_all_activations()
        active = [
            {
                "activationId": a["id"],
                "id": a["id"],
                "serviceCode": a.get("service", "unknown"),
                "phoneNumber": a.get("number", "0"),
                "activationCost": 0.35,
                "activationStatus": a["status"],
                "countryCode": a.get("country", "22"),
            }
            for a in all_acts.values()
            if a["status"] != "STATUS_CANCEL"
        ]
        return JSONResponse({"status": "success", "activeActivations": active})

    return f"BAD_ACTION:{action}"

# Debug
@router.get("/debug/activations")
async def debug_activations():
    all_acts = await get_all_activations()
    return {"balance": balance, "activations": all_acts}