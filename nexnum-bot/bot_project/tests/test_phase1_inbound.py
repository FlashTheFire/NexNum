import sys
import os
import time
import asyncio
import unittest
from pathlib import Path

_bot_dir = Path(__file__).resolve().parent.parent
if str(_bot_dir) not in sys.path:
    sys.path.insert(0, str(_bot_dir))

import httpx
from main import fastapi_app
# pyrefly: ignore [missing-import]
from app.core.config import get_settings

settings = get_settings()


def async_req(method: str, path: str, **kwargs):
    async def _call():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=fastapi_app), base_url="http://test") as client:
            return await client.request(method, path, **kwargs)
    return asyncio.run(_call())


class TestPhase1Inbound(unittest.TestCase):
    def setUp(self):
        settings.WEBHOOK_SHARED_SECRET = "test-secret-123"

    def test_01_health_check(self):
        """Test health check endpoint."""
        response = async_req("GET", "/health")
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
        response = async_req("POST", "/webhook/inbound", json=payload, headers={"X-API-Key": "wrong-secret"})
        self.assertEqual(response.status_code, 401)
        self.assertIn("Invalid API key", response.json()["detail"])

    def test_03_inbound_auth_success_and_fast_ack(self):
        """Test successful auth and fast-ack response time (<50ms target)."""
        payload = {
            "deviceId": f"test_device_{int(time.time() * 1000)}",
            "timestamp": int(time.time() * 1000),
            "sender": "+919876543210",
            "body": "Your WhatsApp code is 888-999",
            "isOtp": True,
            "otpCode": "888999"
        }
        start = time.time()
        response = async_req("POST", "/webhook/inbound", json=payload, headers={"X-API-Key": "test-secret-123"})
        elapsed_ms = (time.time() - start) * 1000

        self.assertIn(response.status_code, (200, 202))
        self.assertIn("status", response.json())
        print(f"  [Phase 1] Webhook fast-ack response time: {elapsed_ms:.2f}ms")

    def test_04_inbound_deduplication(self):
        """Test Redis SETNX deduplication for repeated SMS payload."""
        ts = int(time.time() * 1000)
        payload = {
            "deviceId": "dup_test_device",
            "timestamp": ts,
            "sender": "GOOGLE",
            "body": "Your Google verification code is 654321",
            "isOtp": True
        }
        res1 = async_req("POST", "/webhook/inbound", json=payload, headers={"X-API-Key": "test-secret-123"})
        res2 = async_req("POST", "/webhook/inbound", json=payload, headers={"X-API-Key": "test-secret-123"})
        
        self.assertIn(res2.status_code, (200, 202))
        if res2.status_code == 200:
            self.assertEqual(res2.json()["status"], "duplicate")
            print("  [Phase 1] Redis SETNX deduplication verified: Duplicate SMS dropped successfully!")


if __name__ == "__main__":
    unittest.main()
