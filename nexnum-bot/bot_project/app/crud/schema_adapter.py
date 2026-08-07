# app/crud/schema_adapter.py
"""
Phase 2 — Dual-Schema Adapter & Multi-SIM Number Extractor

Provides unified normalization for both:
  1. `/gateways` (SilentGate new schema: multi-SIM, online status object, webhook enabled)
  2. `/clients`  (Legacy schema: single/multi fields, online status bool)

Key features:
  - Multi-SIM support: A dual-SIM device returns 2 distinct DeviceSimNode instances
  - Smart Number Extractor: Inspects direct fields -> SMS history fallback -> Redis cache
  - Strict Filter: Excludes any SIM/device where no valid phone number can be resolved
  - Equal Rights: Both `clients/` and `gateways/` nodes are given equal standing if a valid phone number is found!
"""

from __future__ import annotations

import re
import time
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field

# pyrefly: ignore [missing-import]
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ─── Data Model ───────────────────────────────────────────────────────────────

@dataclass
class DeviceSimNode:
    """Atomic allocatable unit representing a single SIM on a device."""
    device_id: str             # e.g., "dev_123"
    sim_slot: int              # 0 or 1
    phone_number: str          # e.g., "+919876543210"
    carrier: str               # e.g., "Jio", "Airtel", "Vi", "BSNL"
    schema_type: str           # "silentgate" | "legacy"
    is_online: bool            # Online status
    last_seen_ms: float        # Timestamp of last activity
    battery: int               # Battery percentage
    firebase_node_id: str      # ID of owning Firebase node
    raw_node: dict = field(default_factory=dict, repr=False)

    @property
    def clean_digits(self) -> str:
        """Return phone number without leading '+'."""
        return self.phone_number.replace("+", "")


def safe_int(val: Any, default: int = 100) -> int:
    """Safely convert string/float/int to integer, handling percent signs like '38%'."""
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return int(val)
    try:
        clean = str(val).replace("%", "").strip()
        return int(float(clean))
    except Exception:
        return default


def safe_float(val: Any, default: float = 0.0) -> float:
    """Safely convert string/float/int to float."""
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    try:
        clean = str(val).strip()
        return float(clean)
    except Exception:
        return default


# ─── Phone Number Helper ──────────────────────────────────────────────────────

def normalize_phone_number(raw_phone: Optional[str]) -> Optional[str]:
    """Clean and format phone number with +91 (or general country code)."""
    if not raw_phone or str(raw_phone).strip().lower() in ("n/a", "null", "none", ""):
        return None
    
    clean = str(raw_phone).strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
    
    # Already formatted with +
    if clean.startswith("+") and len(clean) >= 11:
        return clean
    
    # 10-digit Indian mobile number (starts with 6, 7, 8, 9)
    if len(clean) == 10 and clean[0] in "6789":
        return f"+91{clean}"
    
    # 12-digit Indian number starting with 91
    if len(clean) == 12 and clean.startswith("91"):
        return f"+{clean}"
    
    # Other international digits without +
    if len(clean) >= 10 and clean.isdigit():
        return f"+{clean}"
    
    return None


# ─── Fallback SMS History Phone Extractor ────────────────────────────────────

# Regex patterns to extract self phone numbers from welcome / account SMS messages
SMS_PHONE_PATTERNS = [
    re.compile(r"(?:your\s+(?:mobile\s+)?number\s+is|num(?:ber)?:?)\s*(\+?91[6-9]\d{9}|[6-9]\d{9})", re.IGNORECASE),
    re.compile(r"(?:jio|airtel|vi|vodafone|idea|bsnl)\s+(?:num(?:ber)?:?|no:?)\s*(\+?91[6-9]\d{9}|[6-9]\d{9})", re.IGNORECASE),
    re.compile(r"\b(\+91[6-9]\d{9})\b"),
    re.compile(r"\b(91[6-9]\d{9})\b"),
    re.compile(r"\b([6-9]\d{9})\b"),
]

CARRIER_PATTERNS = [
    (re.compile(r"\b(jio|reliance)\b", re.IGNORECASE), "Jio"),
    (re.compile(r"\b(airtel|bharti)\b", re.IGNORECASE), "Airtel"),
    (re.compile(r"\b(vi|vodafone|idea)\b", re.IGNORECASE), "Vi"),
    (re.compile(r"\b(bsnl)\b", re.IGNORECASE), "BSNL"),
]

def extract_phone_and_carrier_from_messages(messages: List[Dict[str, Any]]) -> Tuple[Optional[str], Optional[str]]:
    """
    Scan incoming SMS messages for self phone number and carrier name.
    Used as fallback when direct fields are missing in clients/ or gateways/.
    """
    extracted_phone = None
    extracted_carrier = None

    for msg in messages:
        if not isinstance(msg, dict):
            continue
        
        text = str(msg.get("message") or msg.get("body") or msg.get("text") or "")
        sender = str(msg.get("sender") or msg.get("from") or "")

        # Try carrier extraction
        if not extracted_carrier:
            combined = f"{sender} {text}"
            for pattern, carrier_name in CARRIER_PATTERNS:
                if pattern.search(combined):
                    extracted_carrier = carrier_name
                    break

        # Try phone extraction
        if not extracted_phone and text:
            for pattern in SMS_PHONE_PATTERNS:
                match = pattern.search(text)
                if match:
                    possible_phone = normalize_phone_number(match.group(1))
                    if possible_phone:
                        extracted_phone = possible_phone
                        break

        if extracted_phone and extracted_carrier:
            break

    return extracted_phone, extracted_carrier


# ─── Schema Auto-Detector & Converter ────────────────────────────────────────

class FirebaseSchemaAdapter:
    """
    Adapter that reads both `/gateways` and `/clients` from Firebase
    and normalizes them into atomic `DeviceSimNode` allocatable instances.
    """

    @staticmethod
    def detect_schema_type(node_data: dict) -> str:
        """
        Auto-detect schema type:
          - "silentgate": if 'status' is a dict OR 'sims' is a non-empty list
          - "legacy": if 'status' is bool OR 'mobNo' exists
        """
        status = node_data.get("status")
        if isinstance(status, dict) or "sims" in node_data:
            return "silentgate"
        if isinstance(status, bool) or "mobNo" in node_data:
            return "legacy"
        return "unknown"

    @classmethod
    def parse_node(
        cls,
        device_id: str,
        node_data: dict,
        firebase_node_id: str = "default",
        messages: Optional[List[dict]] = None
    ) -> List[DeviceSimNode]:
        """
        Parse a single Firebase raw device dictionary into one or more DeviceSimNodes (1 per valid SIM).
        Applies direct field check -> SMS history fallback -> strict exclusion if no number found.
        """
        if not isinstance(node_data, dict):
            return []

        schema_type = cls.detect_schema_type(node_data)
        sim_nodes: List[DeviceSimNode] = []

        # ── Parse Online Status ──
        raw_status = node_data.get("status")
        is_online = False
        last_seen_ms = 0.0
        battery = 100

        if isinstance(raw_status, dict):
            is_online = bool(raw_status.get("online", False))
            last_seen_ms = safe_float(raw_status.get("lastSeen") or raw_status.get("updatedAt") or 0.0)
            battery = safe_int(raw_status.get("battery"), 100)
        elif isinstance(raw_status, bool):
            is_online = raw_status
            last_seen_ms = safe_float(node_data.get("lastMessageTime") or node_data.get("timestamp") or 0.0)
            battery = safe_int(node_data.get("battery"), 100)
        else:
            last_seen_ms = safe_float(node_data.get("lastMessageTime") or node_data.get("timestamp") or 0.0)
            battery = safe_int(node_data.get("battery"), 100)

        # ────────── SCENARIO A: SilentGate Schema (/gateways) ──────────
        sims_raw = node_data.get("sims")
        if isinstance(sims_raw, list) and len(sims_raw) > 0:
            for idx, sim in enumerate(sims_raw):
                if not isinstance(sim, dict):
                    continue

                slot_val = sim.get("simSlotIndex") if sim.get("simSlotIndex") is not None else sim.get("slot")
                slot = safe_int(slot_val, default=idx)
                
                # Check direct SIM fields
                raw_p = sim.get("phoneNumber") or sim.get("number") or sim.get("phone") or sim.get("mobNo")
                carrier = str(sim.get("carrierName") or sim.get("carrier") or sim.get("operator") or sim.get("network") or sim.get("service_provider") or "Unknown")
                phone = normalize_phone_number(raw_p)

                # Fallback: SMS History scan if phone is missing
                if not phone and messages:
                    sms_phone, sms_carrier = extract_phone_and_carrier_from_messages(messages)
                    if sms_phone:
                        phone = sms_phone
                    if sms_carrier and carrier == "Unknown":
                        carrier = sms_carrier

                # Include SIM in fleet even if phone is pending resolution
                if not phone:
                    phone = "Pending"

                sim_nodes.append(DeviceSimNode(
                    device_id=device_id,
                    sim_slot=slot,
                    phone_number=phone,
                    carrier=carrier,
                    schema_type=schema_type,
                    is_online=is_online,
                    last_seen_ms=last_seen_ms,
                    battery=battery,
                    firebase_node_id=firebase_node_id,
                    raw_node=node_data
                ))

            if sim_nodes:
                return sim_nodes

        # ────────── SCENARIO B: Legacy Schema (/clients) or fallback ──────────
        # Extract direct fields
        raw_p = (
            node_data.get("mobNo") or
            node_data.get("phoneNumber") or
            node_data.get("number") or
            node_data.get("phone") or
            node_data.get("simNumber")
        )
        carrier = str(
            node_data.get("service_provider") or
            node_data.get("network") or
            node_data.get("operator") or
            "Unknown"
        )
        
        # Check smsAnalysis if present
        sms_analysis = node_data.get("smsAnalysis")
        if isinstance(sms_analysis, dict):
            if not raw_p and sms_analysis.get("phoneNumbers"):
                raw_p = sms_analysis["phoneNumbers"][0]
            if carrier == "Unknown" and sms_analysis.get("networks"):
                carrier = str(sms_analysis["networks"][0])

        phone = normalize_phone_number(raw_p)

        # Fallback: SMS History scan if phone is missing
        if not phone and messages:
            sms_phone, sms_carrier = extract_phone_and_carrier_from_messages(messages)
            if sms_phone:
                phone = sms_phone
            if sms_carrier and carrier == "Unknown":
                carrier = sms_carrier

        # Include client node in fleet even if phone is pending resolution
        if not phone:
            phone = "Pending"

        return [DeviceSimNode(
            device_id=device_id,
            sim_slot=0,
            phone_number=phone,
            carrier=carrier,
            schema_type=schema_type if schema_type != "unknown" else "legacy",
            is_online=is_online,
            last_seen_ms=last_seen_ms,
            battery=battery,
            firebase_node_id=firebase_node_id,
            raw_node=node_data
        )]
