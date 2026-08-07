# app/services/sms_archiver.py
from __future__ import annotations

import json
import logging
import math
import re
import time
from typing import Any, Dict, List, Optional

# pyrefly: ignore [missing-import]
from app.crud.firebase_crud import (
    parse_any_datetime_to_epoch_ms,
    get_all_sim_nodes,
    GLOBAL_PHONE_CACHE,
    FIREBASE_NODES,
    _firebase_request_node
)
# pyrefly: ignore [missing-import]
from app.services.sms_parser import extract_otp_code

logger = logging.getLogger(__name__)

REDIS_SMS_24H_ZSET = "nexnum:sms:24h_zset"
REDIS_SMS_REC_PREFIX = "nexnum:sms:rec"
SMS_TTL_SECONDS = 86400  # 24 Hours TTL Retention


class SmsArchiver24h:
    """
    High-Performance 24-Hour Incoming SMS Archiver & Indexer backed by Redis with TTL.
    Maintains a chronological sorted set of all incoming SMS across all devices and nodes,
    with automatic 24-hour expiration and sub-millisecond paginated querying.
    """

    @classmethod
    def _clean_string(cls, val: Any) -> str:
        if val is None:
            return ""
        return str(val).strip()

    @classmethod
    def format_sms_record(
        cls,
        raw_msg: Dict[str, Any],
        device_id: str = "",
        node_id: str = "",
        phone_number: str = "",
        carrier: str = "",
        sim_slot: int = 0
    ) -> Dict[str, Any]:
        """Normalize raw incoming SMS object into a standardized, enriched record."""
        body = cls._clean_string(
            raw_msg.get("message") or raw_msg.get("body") or raw_msg.get("text")
        )
        sender = cls._clean_string(
            raw_msg.get("sender") or raw_msg.get("from") or raw_msg.get("service") or "Unknown"
        )
        otp = extract_otp_code(body)

        # Parse timestamp safely
        date_time_str = cls._clean_string(
            raw_msg.get("dateTime") or raw_msg.get("datetime") or raw_msg.get("date_time")
        )
        ts_val = 0.0
        if date_time_str:
            ts_val = parse_any_datetime_to_epoch_ms(date_time_str)
        if ts_val <= 0:
            try:
                ts_val = parse_any_datetime_to_epoch_ms(raw_msg)
            except Exception:
                ts_val = 0.0

        if ts_val <= 0:
            ts_val = float(time.time() * 1000)

        # Infer phone number & carrier from global phone cache if not provided
        clean_dev = device_id or cls._clean_string(raw_msg.get("deviceId") or raw_msg.get("client_id"))
        if not phone_number and clean_dev in GLOBAL_PHONE_CACHE:
            cached = GLOBAL_PHONE_CACHE[clean_dev]
            phone_number = cached.get("mobNo", "")
            if not carrier:
                carrier = cached.get("carrier", "UNKNOWN")
            if sim_slot == 0:
                sim_slot = int(cached.get("simSlot", 0) or 0)

        # Service mapping guess from sender
        service_name = cls._clean_string(raw_msg.get("service"))
        if not service_name:
            s_up = sender.upper()
            if any(k in s_up for k in ("TELEGRAM", "TG", "B-TG")):
                service_name = "Telegram"
            elif any(k in s_up for k in ("WHATSAPP", "WA", "B-WA")):
                service_name = "WhatsApp"
            elif any(k in s_up for k in ("GOOGLE", "G-", "GOOG")):
                service_name = "Google"
            elif any(k in s_up for k in ("INSTAGRAM", "IG")):
                service_name = "Instagram"
            elif any(k in s_up for k in ("SWIGGY", "PURESC", "FLOT", "JIO")):
                service_name = sender.split("-")[0] if "-" in sender else sender
            else:
                service_name = sender

        unique_id = cls._clean_string(raw_msg.get("id"))
        if not unique_id or unique_id == "unknown":
            hash_suffix = abs(hash(f"{clean_dev}_{body}_{int(ts_val)}")) % 1000000
            unique_id = f"sms_{clean_dev[:8]}_{int(ts_val)}_{hash_suffix}"

        return {
            "id": unique_id,
            "deviceId": clean_dev,
            "nodeId": node_id or cls._clean_string(raw_msg.get("nodeId") or "node_1"),
            "phoneNumber": phone_number or clean_dev,
            "carrier": carrier or "UNKNOWN",
            "simSlot": sim_slot,
            "sender": sender,
            "message": body,
            "otp": otp,
            "service": service_name,
            "timestamp": int(ts_val),
            "dateTime": date_time_str or time.strftime("%d-%m-%Y | %I:%M %p", time.localtime(ts_val / 1000.0)),
            "ingest_ts": int(time.time() * 1000)
        }

    @classmethod
    async def store_incoming_sms(cls, redis_client: Any, sms_record: Dict[str, Any]) -> bool:
        """Atomically persist SMS into Redis with 24 hours TTL retention."""
        if not redis_client or not sms_record or not sms_record.get("message"):
            return False

        try:
            record_id = sms_record["id"]
            ts = sms_record["timestamp"]
            record_json = json.dumps(sms_record)

            now_ms = time.time() * 1000.0
            cutoff_ms = now_ms - (SMS_TTL_SECONDS * 1000.0)

            pipe = redis_client.pipeline()
            # 1. Store in sorted set with timestamp score
            pipe.zadd(REDIS_SMS_24H_ZSET, {record_json: ts})
            # 2. Prune records older than 24 hours
            pipe.zremrangebyscore(REDIS_SMS_24H_ZSET, 0, cutoff_ms)
            # 3. Refresh 24h key TTL
            pipe.expire(REDIS_SMS_24H_ZSET, SMS_TTL_SECONDS)
            # 4. Store individual record lookup
            pipe.set(f"{REDIS_SMS_REC_PREFIX}:{record_id}", record_json, ex=SMS_TTL_SECONDS)
            await pipe.execute()
            return True
        except Exception as e:
            logger.warning(f"[SmsArchiver24h] Failed to store SMS in Redis: {e}")
            return False

    @classmethod
    async def fetch_24h_incoming_sms(
        cls,
        redis_client: Any,
        page: int = 1,
        limit: int = 25,
        search: str = "",
        service: str = "",
        has_otp: Optional[bool] = None,
        sort_order: str = "desc",
        seed_if_empty: bool = True
    ) -> Dict[str, Any]:
        """
        Query all 24-hour incoming SMS with server-side pagination, regex/substring search,
        and real-time analytics aggregation.
        """
        page = max(1, page)
        limit = max(1, min(limit, 500))
        now_ms = time.time() * 1000.0
        cutoff_ms = now_ms - (SMS_TTL_SECONDS * 1000.0)

        all_records: List[Dict[str, Any]] = []

        # 1. Fetch from Redis Sorted Set
        if redis_client:
            try:
                # Prune older than 24h
                await redis_client.zremrangebyscore(REDIS_SMS_24H_ZSET, 0, cutoff_ms)
                # Fetch all recent records (scored within last 24h)
                raw_items = await redis_client.zrangebyscore(REDIS_SMS_24H_ZSET, cutoff_ms, "+inf")
                for item in raw_items:
                    try:
                        parsed = json.loads(item)
                        if isinstance(parsed, dict):
                            all_records.append(parsed)
                    except Exception:
                        pass
            except Exception as e:
                logger.warning(f"[SmsArchiver24h] Redis read error: {e}")

        # 2. Cold-Start / Backfill: If Redis cache is empty or minimal, seed from active Firebase nodes
        if seed_if_empty and len(all_records) < 5:
            try:
                seeded_records = await cls._seed_from_firebase_nodes(redis_client)
                if seeded_records:
                    all_records = seeded_records
            except Exception as e:
                logger.debug(f"[SmsArchiver24h] Firebase node seeding notice: {e}")

        # 3. Filter by search query
        if search:
            s_low = search.strip().lower()
            all_records = [
                r for r in all_records
                if s_low in r.get("message", "").lower()
                or s_low in r.get("sender", "").lower()
                or s_low in str(r.get("otp", "") or "").lower()
                or s_low in r.get("phoneNumber", "").lower()
                or s_low in r.get("deviceId", "").lower()
                or s_low in r.get("service", "").lower()
                or s_low in r.get("nodeId", "").lower()
            ]

        # 4. Filter by service
        if service and service.lower() != "all":
            svc_low = service.strip().lower()
            all_records = [
                r for r in all_records
                if svc_low in r.get("service", "").lower() or svc_low in r.get("sender", "").lower()
            ]

        # 5. Filter by OTP presence
        if has_otp is True:
            all_records = [r for r in all_records if r.get("otp")]
        elif has_otp is False:
            all_records = [r for r in all_records if not r.get("otp")]

        # 6. Sort
        reverse = sort_order.lower() == "desc"
        all_records.sort(key=lambda r: r.get("timestamp", 0), reverse=reverse)

        # 7. Summary Stats
        total_24h = len(all_records)
        total_otp = sum(1 for r in all_records if r.get("otp"))
        unique_senders = len(set(r.get("sender", "") for r in all_records if r.get("sender")))
        unique_devices = len(set(r.get("deviceId", "") for r in all_records if r.get("deviceId")))

        # 8. Pagination Slice
        total_pages = max(1, math.ceil(total_24h / limit)) if limit > 0 else 1
        start_idx = (page - 1) * limit
        end_idx = start_idx + limit
        paginated = all_records[start_idx:end_idx]

        return {
            "total": total_24h,
            "page": page,
            "limit": limit,
            "totalPages": total_pages,
            "count": len(paginated),
            "ttlHours": 24,
            "messages": paginated,
            "stats": {
                "total24h": total_24h,
                "totalWithOtp": total_otp,
                "uniqueSenders": unique_senders,
                "uniqueDevices": unique_devices
            }
        }

    @classmethod
    async def _seed_from_firebase_nodes(cls, redis_client: Any) -> List[Dict[str, Any]]:
        """Collect recent messages from active Firebase SIM devices and cache into Redis."""
        try:
            sim_nodes = get_all_sim_nodes()
        except Exception:
            return []

        seeded: List[Dict[str, Any]] = []
        if not sim_nodes or not FIREBASE_NODES:
            return seeded

        try:
            for sn in sim_nodes[:5]:
                dev_id = sn.device_id
                if not dev_id or not getattr(sn, "firebase_url", ""):
                    continue

                # Query node messages
                node = _firebase_request_node({"url": getattr(sn, "firebase_url", "")}, "GET", f"/messages/{dev_id}", params='&limitToLast=10')
                if not node or not isinstance(node, dict):
                    continue

                for _, msg_data in node.items():
                    if isinstance(msg_data, dict) and (msg_data.get("message") or msg_data.get("body")):
                        rec = cls.format_sms_record(
                            raw_msg=msg_data,
                            device_id=dev_id,
                            node_id=sn.firebase_node_id,
                            phone_number=sn.phone_number,
                            carrier=sn.carrier,
                            sim_slot=sn.sim_slot
                        )
                        seeded.append(rec)
                        if redis_client:
                            await cls.store_incoming_sms(redis_client, rec)
        except Exception as e:
            logger.debug(f"[SmsArchiver24h] Seed error: {e}")

        return seeded
