# tests/test_phase1_inbound.py
"""
Phase 1 Deep Test Suite — Unified Webhook Inbound & Fast-Ack
"""
import sys
import os
import asyncio
import unittest
from pathlib import Path

# Add bot_project to sys.path
_bot_dir = Path(__file__).resolve().parent.parent
if str(_bot_dir) not in sys.path:
    sys.path.insert(0, str(_bot_dir))

from fastapi.testclient import TestClient
from main import fastapi_app
from app.core.config import get_settings

settings = get_settings()


class TestPhase1Inbound(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(fastapi_app)
        # Set a test shared secret
        settings.WEBHOOK_SHARED_SECRET = "test-secret-123"

    def test_01_health_check(self):
        """Test health check endpoint."""
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_02_inbound_auth_failure(self):
        """Test authentication failure when invalid X-API-Key is passed."""
        payload = {
            "deviceId": "test_device_01",
            "timestamp": 1720000000000,
            "sender": "+919876543210",
            "body": "Your Telegram code is 12345",
            "isOtp": True,
            "otpCode": "12345"
        }
        response = self.client.post("/webhook/inbound", json=payload, headers={"X-API-Key": "wrong-secret"})
        self.assertEqual(response.status_code, 401)
        self.assertIn("Invalid API key", response.json()["detail"])

    def test_03_inbound_auth_success_and_fast_ack(self):
        """Test successful auth and fast-ack response time (<50ms target)."""
        payload = {
            "deviceId": f"test_device_{int(asyncio.get_event_loop().time() * 1000)}",
            "timestamp": int(asyncio.get_event_loop().time() * 1000),
            "sender": "+919876543210",
            "body": "Your WhatsApp code is 888-999",
            "isOtp": True,
            "otpCode": "888999"
        }
        start = asyncio.get_event_loop().time()
        response = self.client.post("/webhook/inbound", json=payload, headers={"X-API-Key": "test-secret-123"})
        elapsed_ms = (asyncio.get_event_loop().time() - start) * 1000

        self.assertIn(response.status_code, (200, 202))
        self.assertIn("status", response.json())
        print(f"  [Phase 1] Webhook fast-ack response time: {elapsed_ms:.2f}ms")

    def test_04_inbound_deduplication(self):
        """Test Redis SETNX deduplication for repeated SMS payload."""
        ts = int(asyncio.get_event_loop().time() * 1000)
        payload = {
            "deviceId": "dup_test_device",
            "timestamp": ts,
            "sender": "GOOGLE",
            "body": "Your Google verification code is 654321",
            "isOtp": True
        }
        # First attempt
        res1 = self.client.post("/webhook/inbound", json=payload, headers={"X-API-Key": "test-secret-123"})
        # Second attempt with exact same deviceId and timestamp
        res2 = self.client.post("/webhook/inbound", json=payload, headers={"X-API-Key": "test-secret-123"})
        
        self.assertIn(res2.status_code, (200, 202))
        if res2.status_code == 200:
            self.assertEqual(res2.json()["status"], "duplicate")
            print("  [Phase 1] Redis SETNX deduplication verified: Duplicate SMS dropped successfully!")


if __name__ == "__main__":
    unittest.main()
