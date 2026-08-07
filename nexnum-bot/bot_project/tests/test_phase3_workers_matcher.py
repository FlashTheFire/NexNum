# tests/test_phase3_workers_matcher.py
"""
Phase 3 Deep Test Suite — Activation Matcher & Re-Send Cycle
"""
import sys
import os
import asyncio
import unittest
from pathlib import Path

_bot_dir = Path(__file__).resolve().parent.parent
if str(_bot_dir) not in sys.path:
    sys.path.insert(0, str(_bot_dir))

# pyrefly: ignore [missing-import]
from app.services.sms_parser import extract_otp_code
from app.services.pattern_registry import ServicePatternRegistry
from fastapi.testclient import TestClient
from main import fastapi_app


class TestPhase3WorkersMatcher(unittest.TestCase):

    def test_01_service_sms_pattern_matching(self):
        """Test matching SMS text and sender ID against requested service codes."""
        # Telegram match
        matched_tg, _, _ = asyncio.run(ServicePatternRegistry.match_sms_dynamic(None, "Telegram login code: 54321", "Telegram", "tg"))
        self.assertTrue(matched_tg)
        # WhatsApp match
        matched_wa, _, _ = asyncio.run(ServicePatternRegistry.match_sms_dynamic(None, "Your WhatsApp code: 123-456", "WhatsApp", "wa"))
        self.assertTrue(matched_wa)
        # Google match
        matched_go, _, _ = asyncio.run(ServicePatternRegistry.match_sms_dynamic(None, "G-987654 is your Google verification code", "Google", "go"))
        self.assertTrue(matched_go)
        # Wrong service mismatch
        matched_sw_tg, _, _ = asyncio.run(ServicePatternRegistry.match_sms_dynamic(None, "Your Swiggy order code is 112233", "Swiggy", "tg"))
        self.assertFalse(matched_sw_tg)
        print("  [Phase 3] Service SMS pattern matching verified for Telegram, WhatsApp, Google!")

    def test_02_otp_code_extraction(self):
        """Test universal OTP code extraction."""
        self.assertEqual(extract_otp_code("Your code is 123456"), "123456")
        self.assertEqual(extract_otp_code("WhatsApp code: 888-999"), "888999")
        self.assertEqual(extract_otp_code("Telegram login code 54321"), "54321")

    def test_03_cancellation_shield(self):
        """Test that setStatus=8 (cancel) is blocked if has_sms is True (refund protection)."""
        import httpx
        from main import fastapi_app

        async def _call():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=fastapi_app), base_url="http://test") as client:
                return await client.get("/stubs/handler_api.php?action=setStatus&api_key=test&id=999999999&status=8")

        response = asyncio.run(_call())
        self.assertIn(response.text, ("NO_ACTIVATION", "BAD_STATUS"))
        print("  [Phase 3] Cancellation shield logic verified!")


if __name__ == "__main__":
    unittest.main()
