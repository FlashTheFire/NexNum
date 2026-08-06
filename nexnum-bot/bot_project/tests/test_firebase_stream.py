import sys
import os
import asyncio
import time
import json

# Target local Redis & disable network connection during tests
os.environ["REDIS_HOST"] = "127.0.0.1"
os.environ["ENABLE_REDIS"] = "False"

BOT_PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BOT_PROJECT_DIR not in sys.path:
    sys.path.insert(0, BOT_PROJECT_DIR)

from app.services.firebase_stream import FirebaseStreamManager
from app.gateway.router import save_activation, get_activation

async def run_tests():
    print("Initializing test_firebase_stream...")
    stream_mgr = FirebaseStreamManager()

    # 1. Setup a test activation in Redis / Local state
    now = time.time()
    act_id = "stream_test_act_999"
    client_id = "test_device_client_001"
    
    act_data = {
        "id": act_id,
        "client_id": client_id,
        "service": "tg",
        "country": "22",
        "number": "+919876543210",
        "created": now - 5,  # Created 5s ago
        "status": "STATUS_WAIT_CODE",
        "has_sms": False
    }
    await save_activation(act_id, act_data)

    # 2. Simulate an incoming SSE event payload from Firebase
    msg_ts = (now + 1) * 1000  # Arrives 1s after creation
    simulated_event_data = json.dumps({
        "path": f"/{client_id}/{int(msg_ts)}",
        "data": {
            "message": "Your Telegram verification code is: 55443",
            "sender": "Telegram",
            "timestamp": msg_ts
        }
    })

    # 3. Process stream event
    start_time_margin = (now - 30) * 1000
    await stream_mgr._process_stream_event("node_1", "put", simulated_event_data, start_time_margin)

    # 4. Verify that activation was updated with OTP code
    updated_act = await get_activation(act_id)
    assert updated_act is not None, "Activation should exist"
    assert updated_act["status"] == "STATUS_OK", f"Expected STATUS_OK, got {updated_act['status']}"
    assert updated_act["code_text"] == "Your Telegram verification code is: 55443", f"Got code_text: {updated_act.get('code_text')}"
    assert updated_act["has_sms"] is True, "has_sms should be True"

    print("[PASS] Firebase SSE Event Parsing & Live Matching verified successfully!")
    print("All stream tests passed!")

if __name__ == "__main__":
    if sys.platform == 'win32' and sys.version_info < (3, 14):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run_tests())
