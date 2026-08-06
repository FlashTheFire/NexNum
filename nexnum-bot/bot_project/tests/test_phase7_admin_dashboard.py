# tests/test_phase7_admin_dashboard.py
"""
Phase 7 Deep Test Suite — Gateway Admin REST API & Control Dashboard Web UI
"""
import sys
import os
import asyncio
import unittest
from pathlib import Path

_bot_dir = Path(__file__).resolve().parent.parent
if str(_bot_dir) not in sys.path:
    sys.path.insert(0, str(_bot_dir))

import httpx
from main import fastapi_app


def async_req(method: str, path: str, **kwargs):
    async def _call():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=fastapi_app), base_url="http://test") as client:
            return await client.request(method, path, **kwargs)
    return asyncio.run(_call())


class TestPhase7AdminDashboard(unittest.TestCase):

    def test_01_admin_stats_endpoint(self):
        """Test GET /api/v1/admin/stats metric response structure."""
        response = async_req("GET", "/api/v1/admin/stats")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("sim_nodes", data)
        self.assertIn("activations", data)
        self.assertIn("stream", data)
        print("  [Phase 7] GET /api/v1/admin/stats verified!")

    def test_02_admin_devices_endpoint(self):
        """Test GET /api/v1/admin/devices listing."""
        response = async_req("GET", "/api/v1/admin/devices")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("devices", data)
        print(f"  [Phase 7] GET /api/v1/admin/devices verified! Total SIMs: {data.get('count', 0)}")

    def test_03_admin_activations_endpoint(self):
        """Test GET /api/v1/admin/activations feed."""
        response = async_req("GET", "/api/v1/admin/activations")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("activations", data)
        print("  [Phase 7] GET /api/v1/admin/activations verified!")

    def test_04_admin_test_match_sandbox(self):
        """Test POST /api/v1/admin/test-match sandbox pattern tester."""
        payload = {
            "serviceCode": "tg",
            "sender": "Telegram",
            "body": "Your Telegram login code is 54321"
        }
        response = async_req("POST", "/api/v1/admin/test-match", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["isMatched"])
        self.assertEqual(data["extractedCode"], "54321")
        print("  [Phase 7] Pattern test match sandbox verified!")

    def test_05_admin_dashboard_web_gui_rendering(self):
        """Test GET /admin/dashboard HTML single-page web app rendering."""
        response = async_req("GET", "/admin/dashboard")
        self.assertEqual(response.status_code, 200)
        self.assertIn("<html", response.text)
        self.assertIn("NexNum Gateway Control Center", response.text)
        print("  [Phase 7] GET /admin/dashboard HTML Web UI dashboard rendering verified!")


if __name__ == "__main__":
    unittest.main()
