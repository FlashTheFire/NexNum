# app/crud/schema_registry.py
"""
Declarative Universal Schema Registry Engine
Loads JSON schema contracts from app/data/schema_mappings.json and resolves device,
SIM array, and message fields deterministically in O(1) time across all Firebase RTDB variants.
"""

import os
import json
import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

MAPPINGS_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "schema_mappings.json")

class SchemaRegistry:
    _instance: Optional['SchemaRegistry'] = None
    _mappings: Dict[str, Any] = {}

    def __init__(self):
        self.load_mappings()

    @classmethod
    def get_instance(cls) -> 'SchemaRegistry':
        if cls._instance is None:
            cls._instance = SchemaRegistry()
        return cls._instance

    def load_mappings(self) -> None:
        try:
            if os.path.exists(MAPPINGS_FILE_PATH):
                with open(MAPPINGS_FILE_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self._mappings = data.get("schemas", {})
                    logger.info(f"[SchemaRegistry] Loaded {len(self._mappings)} declarative schema definitions.")
            else:
                logger.warning(f"[SchemaRegistry] File not found: {MAPPINGS_FILE_PATH}. Using built-in fallbacks.")
        except Exception as e:
            logger.error(f"[SchemaRegistry] Error loading schema_mappings.json: {e}")

    @classmethod
    def detect_schema_type(cls, node_dict: dict) -> str:
        """
        Auto-detect schema type based on node characteristics:
          - "silentgate": if 'status' is dict or 'sims' is non-empty list of dicts with 'slot'
          - "legacy_rich": if 'sims' is non-empty list or 'isSdCard'/'joined' exists
          - "legacy_dual": if 'mobNo' and 'phoneNumber' both exist
          - "legacy_light": status bool or lightweight fields
        """
        if not isinstance(node_dict, dict):
            return "legacy_light"

        status = node_dict.get("status")
        sims = node_dict.get("sims")

        if isinstance(status, dict):
            return "silentgate"
        if isinstance(sims, list) and len(sims) > 0:
            if isinstance(sims[0], dict) and "slot" in sims[0]:
                return "silentgate"
            return "legacy_rich"
        if "mobNo" in node_dict and "phoneNumber" in node_dict:
            return "legacy_dual"
        if "mobNo" in node_dict or "joined" in node_dict or "modelName" in node_dict:
            return "legacy_rich"

        return "legacy_light"

    @classmethod
    def resolve_field(cls, node_dict: dict, field_name: str, schema_type: str = "auto", default: Any = None) -> Any:
        """
        Resolve a field from a raw device node dictionary using declarative alias chains.
        """
        if not isinstance(node_dict, dict):
            return default

        registry = cls.get_instance()
        if schema_type == "auto" or schema_type not in registry._mappings:
            schema_type = cls.detect_schema_type(node_dict)

        schema_cfg = registry._mappings.get(schema_type, registry._mappings.get("legacy_rich", {}))
        mappings = schema_cfg.get("mappings", {})

        alias_chain = mappings.get(field_name, [field_name])
        for alias in alias_chain:
            if alias in node_dict and node_dict[alias] is not None:
                val = node_dict[alias]
                if str(val).strip() != "":
                    return val

        # Fallback to general alias search
        for alias in [field_name, field_name.lower(), field_name.upper()]:
            if alias in node_dict and node_dict[alias] is not None:
                return node_dict[alias]

        return default

    @classmethod
    def resolve_sims(cls, node_dict: dict, schema_type: str = "auto") -> List[dict]:
        """
        Resolve SIMs array from a raw device node dictionary, normalizing SIM fields.
        """
        if not isinstance(node_dict, dict):
            return []

        sims_raw = node_dict.get("sims")
        if not isinstance(sims_raw, list) or len(sims_raw) == 0:
            return []

        registry = cls.get_instance()
        if schema_type == "auto" or schema_type not in registry._mappings:
            schema_type = cls.detect_schema_type(node_dict)

        schema_cfg = registry._mappings.get(schema_type, registry._mappings.get("legacy_rich", {}))
        sim_mappings = schema_cfg.get("mappings", {}).get("sim_item", {})

        slot_aliases = sim_mappings.get("slot", ["simSlotIndex", "slot", "index"])
        phone_aliases = sim_mappings.get("phone_number", ["phoneNumber", "mobNo", "number", "phone"])
        carrier_aliases = sim_mappings.get("carrier", ["carrierName", "carrier", "operator", "network", "service_provider"])

        normalized_sims = []
        for idx, sim in enumerate(sims_raw):
            if not isinstance(sim, dict):
                continue

            # Slot
            slot_val = None
            for s_alias in slot_aliases:
                if s_alias in sim and sim[s_alias] is not None:
                    slot_val = sim[s_alias]
                    break

            # Phone
            phone_val = None
            for p_alias in phone_aliases:
                if p_alias in sim and sim[p_alias] is not None:
                    phone_val = str(sim[p_alias]).strip()
                    if phone_val and phone_val.lower() not in ("unknown", "n/a", "null", "none"):
                        break
                    else:
                        phone_val = None

            # Carrier
            carrier_val = None
            for c_alias in carrier_aliases:
                if c_alias in sim and sim[c_alias] is not None:
                    carrier_val = str(sim[c_alias]).strip()
                    if carrier_val and carrier_val.lower() not in ("unknown", "n/a", "null", "none"):
                        break
                    else:
                        carrier_val = None

            normalized_sims.append({
                "slot_raw": slot_val,
                "slot_index": idx,
                "phoneNumber": phone_val,
                "carrierName": carrier_val or "Unknown"
            })

        return normalized_sims

    @classmethod
    def resolve_message_field(cls, msg_dict: dict, field_name: str, schema_type: str = "auto", default: Any = None) -> Any:
        """
        Resolve a field from a raw message dictionary using declarative alias chains.
        """
        if not isinstance(msg_dict, dict):
            return default

        registry = cls.get_instance()
        if schema_type == "auto" or schema_type not in registry._mappings:
            schema_type = "legacy_rich"

        schema_cfg = registry._mappings.get(schema_type, registry._mappings.get("legacy_rich", {}))
        msg_mappings = schema_cfg.get("message_mappings", {})

        alias_chain = msg_mappings.get(field_name, [field_name])
        for alias in alias_chain:
            if alias in msg_dict and msg_dict[alias] is not None:
                return msg_dict[alias]

        return default
