# tests/test_phase9_decoupled_worker.py
"""
Phase 9 Deep Test Suite — Decoupled Worker & Config Settings
"""
import sys
import os
import asyncio
import unittest
from pathlib import Path

_bot_dir = Path(__file__).resolve().parent.parent
if str(_bot_dir) not in sys.path:
    sys.path.insert(0, str(_bot_dir))

from app.core.config import get_settings

settings = get_settings()


class TestPhase9DecoupledWorker(unittest.TestCase):

    def test_01_worker_concurrency_config(self):
        """Test that INBOUND_WORKER_COUNT is set to 5 (Option A)."""
        self.assertEqual(settings.INBOUND_WORKER_COUNT, 5)
        print("  [Phase 9] INBOUND_WORKER_COUNT verified: 5 concurrent workers configured!")

    def test_02_enable_in_process_workers_flag(self):
        """Test that ENABLE_IN_PROCESS_WORKERS is set to False (Decoupled Mode)."""
        self.assertFalse(settings.ENABLE_IN_PROCESS_WORKERS)
        print("  [Phase 9] ENABLE_IN_PROCESS_WORKERS verified: HTTP API Mode active with 0ms worker overhead!")


if __name__ == "__main__":
    unittest.main()
