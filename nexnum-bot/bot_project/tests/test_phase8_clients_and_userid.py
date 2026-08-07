# tests/test_phase8_clients_and_userid.py
"""
Phase 8 Deep Test Suite — User ID Propagation & Legacy Client Allocation
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
# pyrefly: ignore [missing-import]
from app.crud.schema_adapter import FirebaseSchemaAdapter, DeviceSimNode


def async_req(method: str, path: str, **kwargs):
    async def _call():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=fastapi_app), base_url="http://test") as client:
            return await client.request(method, path, **kwargs)
    return asyncio.run(_call())


class TestPhase8ClientsAndUserId(unittest.TestCase):

    def test_01_user_id_propagation_in_get_number(self):
        """Test passing user_id / userId query parameter in getNumber request."""
        response = async_req(
            "GET",
            "/stubs/handler_api.php?action=getNumber&api_key=your-random-secret-key&service=tg&user_id=usr_test_999"
        )
        self.assertIn(response.status_code, (200, 400))
        if response.status_code == 200:
            if "NO_NUMBERS" not in response.text:
                data = response.json()
                self.assertEqual(data.get("userId"), "usr_test_999")
                print("  [Phase 8] userId propagation verified in getNumber response!")

    def test_02_legacy_client_allocation(self):
        """Test that legacy /clients schema node with phone number is allocatable as a DeviceSimNode."""
        raw_client = {
            "mobNo": "+919876543210",
            "status": True,
            "simInfo": {"carrier": "Jio"}
        }
        nodes = FirebaseSchemaAdapter.parse_node("client_legacy_01", raw_client, firebase_node_id="node_1")
        self.assertEqual(len(nodes), 1)
        self.assertEqual(nodes[0].phone_number, "+919876543210")
        self.assertEqual(nodes[0].schema_type, "legacy")
        print("  [Phase 8] Legacy /clients device allocation verified!")


if __name__ == "__main__":
    unittest.main()
