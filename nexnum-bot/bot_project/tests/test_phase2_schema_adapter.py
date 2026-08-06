# tests/test_phase2_schema_adapter.py
"""
Phase 2 Deep Test Suite — Dual-Schema Adapter & Multi-SIM Extractor
"""
import sys
import os
import unittest
from pathlib import Path

_bot_dir = Path(__file__).resolve().parent.parent
if str(_bot_dir) not in sys.path:
    sys.path.insert(0, str(_bot_dir))

from app.crud.schema_adapter import (
    FirebaseSchemaAdapter,
    DeviceSimNode,
    normalize_phone_number,
    extract_phone_and_carrier_from_messages
)


class TestPhase2SchemaAdapter(unittest.TestCase):

    def test_01_phone_normalization(self):
        """Test phone number formatting and cleaning."""
        self.assertEqual(normalize_phone_number("9876543210"), "+919876543210")
        self.assertEqual(normalize_phone_number("+919876543210"), "+919876543210")
        self.assertEqual(normalize_phone_number("919876543210"), "+919876543210")
        self.assertIsNone(normalize_phone_number("N/A"))
        self.assertIsNone(normalize_phone_number(""))

    def test_02_silentgate_multi_sim_parsing(self):
        """Test parsing of dual-SIM /gateways SilentGate schema node into 2 distinct DeviceSimNodes."""
        raw_gateway = {
            "status": {"online": True, "lastSeen": 1720000000000, "battery": 85},
            "sims": [
                {"slot": 0, "phoneNumber": "+919876543210", "carrier": "Jio"},
                {"slot": 1, "phoneNumber": "+919123456789", "carrier": "Airtel"}
            ]
        }
        nodes = FirebaseSchemaAdapter.parse_node("dev_dual_sim", raw_gateway, firebase_node_id="node_1")
        
        self.assertEqual(len(nodes), 2)
        self.assertEqual(nodes[0].phone_number, "+919876543210")
        self.assertEqual(nodes[0].sim_slot, 0)
        self.assertEqual(nodes[0].carrier, "Jio")
        
        self.assertEqual(nodes[1].phone_number, "+919123456789")
        self.assertEqual(nodes[1].sim_slot, 1)
        self.assertEqual(nodes[1].carrier, "Airtel")
        print("  [Phase 2] Multi-SIM parsing verified: Dual-SIM device parsed into 2 allocatable nodes!")

    def test_03_fallback_sms_history_extractor(self):
        """Test extracting phone number & carrier from historical SMS messages when direct fields are missing."""
        messages = [
            {"sender": "AD-JIOINF-T", "message": "Dear customer, your Jio mobile number is 9876543210. Plan active."}
        ]
        phone, carrier = extract_phone_and_carrier_from_messages(messages)
        self.assertEqual(phone, "+919876543210")
        self.assertEqual(carrier, "Jio")
        print("  [Phase 2] Fallback SMS history phone & carrier extraction verified!")

    def test_04_strict_no_number_exclusion(self):
        """Test that devices with no valid phone number (even after SMS check) are strictly excluded."""
        raw_invalid = {
            "status": True,
            "mobNo": "N/A"
        }
        nodes = FirebaseSchemaAdapter.parse_node("dev_no_phone", raw_invalid, firebase_node_id="node_1", messages=[])
        self.assertEqual(len(nodes), 0)
        print("  [Phase 2] Strict exclusion verified: Device with no phone number excluded from pool!")


if __name__ == "__main__":
    unittest.main()
