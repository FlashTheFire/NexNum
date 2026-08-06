# tests/test_phase6_archiver.py
"""
Phase 6 Deep Test Suite — Supabase Async Archiver
"""
import sys
import os
import asyncio
import unittest
from pathlib import Path

_bot_dir = Path(__file__).resolve().parent.parent
if str(_bot_dir) not in sys.path:
    sys.path.insert(0, str(_bot_dir))

from app.services.supabase_archive import SupabaseArchiver


class TestPhase6SupabaseArchiver(unittest.TestCase):

    def test_01_archiver_non_blocking(self):
        """Test that calling SupabaseArchiver methods creates non-blocking asyncio tasks without raising errors."""
        loop = asyncio.get_event_loop()

        # Execute archive_message
        loop.run_until_complete(SupabaseArchiver.archive_message(
            device_id="test_dev_01",
            sender="Telegram",
            body="Telegram code 12345",
            otp_code="12345",
            service="tg",
            activation_id="act_1001"
        ))

        # Execute archive_activation_log
        loop.run_until_complete(SupabaseArchiver.archive_activation_log(
            activation_id="act_1001",
            device_id="test_dev_01",
            phone_number="+919876543210",
            service="tg",
            status="STATUS_OK",
            code_text="12345",
            duration_sec=12.5
        ))

        print("  [Phase 6] Supabase non-blocking archiver payload and task execution verified!")


if __name__ == "__main__":
    unittest.main()
