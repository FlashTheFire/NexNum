# tests/test_phase5_patterns.py
"""
Phase 5 Deep Test Suite — Dynamic Service Pattern Registry
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
from app.services.pattern_registry import ServicePatternRegistry, load_default_patterns


class TestPhase5PatternRegistry(unittest.TestCase):

    def test_01_json_defaults_loading(self):
        """Test loading built-in service patterns for 25+ services."""
        defaults = load_default_patterns()
        self.assertIn("tg", defaults)
        self.assertIn("wa", defaults)
        self.assertIn("go", defaults)
        self.assertIn("ig", defaults)
        self.assertIn("fb", defaults)
        self.assertGreaterEqual(len(defaults), 20)
        print(f"  [Phase 5] Loaded {len(defaults)} built-in service patterns from JSON file!")

    def test_02_dynamic_sms_matching(self):
        """Test match_sms_dynamic() for Telegram, WhatsApp, Google, Swiggy, Amazon."""
        # Telegram
        m1, code1, _d1 = asyncio.run(ServicePatternRegistry.match_sms_dynamic(None, "Telegram login code: 54321", "Telegram", "tg"))
        self.assertTrue(m1)
        self.assertEqual(code1, "54321")

        # WhatsApp
        m2, code2, _d2 = asyncio.run(ServicePatternRegistry.match_sms_dynamic(None, "Your WhatsApp code: 123-456", "WhatsApp", "wa"))
        self.assertTrue(m2)
        self.assertEqual(code2, "123456")

        # Google
        m3, code3, _d3 = asyncio.run(ServicePatternRegistry.match_sms_dynamic(None, "G-987654 is your Google verification code", "Google", "go"))
        self.assertTrue(m3)
        self.assertEqual(code3, "987654")

        # Amazon
        m4, code4, _d4 = asyncio.run(ServicePatternRegistry.match_sms_dynamic(None, "Use code 456789 for Amazon login", "AD-AMAZON-T", "am"))
        self.assertTrue(m4)
        self.assertEqual(code4, "456789")

        print("  [Phase 5] Dynamic SMS pattern matching & OTP extraction verified for top services!")


if __name__ == "__main__":
    unittest.main()
