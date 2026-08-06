# tests/test_phase4_scorer.py
"""
Phase 4 Deep Test Suite — DeviceScorer Engine & Fresh Numbers Priority
"""
import sys
import os
import asyncio
import unittest
import time
from pathlib import Path

_bot_dir = Path(__file__).resolve().parent.parent
if str(_bot_dir) not in sys.path:
    sys.path.insert(0, str(_bot_dir))

from app.crud.schema_adapter import DeviceSimNode
from app.gateway.scorer import DeviceScorer, ScoredSimCandidate


class TestPhase4DeviceScorer(unittest.TestCase):

    def setUp(self):
        self.now = time.time()
        self.node_fresh = DeviceSimNode(
            device_id="dev_fresh",
            sim_slot=0,
            phone_number="+919876543210",
            carrier="Jio",
            schema_type="silentgate",
            is_online=True,
            last_seen_ms=self.now * 1000,
            battery=90,
            firebase_node_id="node_1"
        )
        self.node_used = DeviceSimNode(
            device_id="dev_used",
            sim_slot=0,
            phone_number="+919123456789",
            carrier="Airtel",
            schema_type="silentgate",
            is_online=True,
            last_seen_ms=self.now * 1000,
            battery=90,
            firebase_node_id="node_1"
        )

    def test_01_fresh_numbers_priority_scoring(self):
        """Test that fresh numbers (0 SMS for service) get higher scores than previously used numbers."""
        # Fresh candidate (0 SMS)
        c_fresh = asyncio.run(DeviceScorer.score_sim_node(None, self.node_fresh, "tg", "u1", self.now, service_sms_count_override=0))
        # Used candidate (3 previous SMS)
        c_used = asyncio.run(DeviceScorer.score_sim_node(None, self.node_used, "tg", "u1", self.now, service_sms_count_override=3))
        
        self.assertGreater(c_fresh.score, c_used.score)
        print(f"  [Phase 4] Fresh Numbers scoring verified! Fresh score={c_fresh.score} > Used score={c_used.score}")

    def test_02_battery_health_scoring(self):
        """Test battery health scoring bonus and penalty."""
        high_batt = DeviceSimNode("d1", 0, "+919876543210", "Jio", "silentgate", True, self.now * 1000, 90, "n1")
        low_batt = DeviceSimNode("d2", 0, "+919123456789", "Jio", "silentgate", True, self.now * 1000, 10, "n1")
        
        c_high = asyncio.run(DeviceScorer.score_sim_node(None, high_batt, "tg", "u1", self.now))
        c_low = asyncio.run(DeviceScorer.score_sim_node(None, low_batt, "tg", "u1", self.now))
        
        self.assertGreater(c_high.score, c_low.score)
        print(f"  [Phase 4] Battery health scoring verified! High batt score={c_high.score} > Low batt score={c_low.score}")

    def test_03_offline_exclusion(self):
        """Test that devices offline > 10 minutes return score = -9999 (Excluded)."""
        old_time = (self.now - 900) * 1000  # 15 minutes ago
        offline_node = DeviceSimNode("d_old", 0, "+919876543210", "Jio", "silentgate", False, old_time, 50, "n1")
        
        c_offline = asyncio.run(DeviceScorer.score_sim_node(None, offline_node, "tg", "u1", self.now))
        self.assertEqual(c_offline.score, -9999)
        print("  [Phase 4] Offline exclusion verified! Device offline >10min scored -9999 (Excluded)")


if __name__ == "__main__":
    unittest.main()
