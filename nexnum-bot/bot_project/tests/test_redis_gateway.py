import sys
import os
import asyncio
import time

# Target local Redis running on Windows host
os.environ["REDIS_HOST"] = "127.0.0.1"
os.environ["ENABLE_REDIS"] = "False"

BOT_PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BOT_PROJECT_DIR not in sys.path:
    sys.path.insert(0, BOT_PROJECT_DIR)

# pyrefly: ignore [missing-import]
from app.gateway.router import (
    check_global_cooldown,
    set_global_cooldown,
    check_service_cooldown,
    set_service_cooldown,
    save_activation,
    get_activation,
    get_all_activations
)

async def run_tests():
    print("Initializing test_redis_gateway...")
    
    # 1. Test Global Cooldown Integration
    test_phone = "+919999988888"
    now = time.time()
    
    # Ensure it starts at 0.0
    initial_alloc = await check_global_cooldown(test_phone)
    assert initial_alloc == 0.0, f"Expected 0.0, got {initial_alloc}"
    
    # Set and read back
    await set_global_cooldown(test_phone, now)
    updated_alloc = await check_global_cooldown(test_phone)
    assert abs(updated_alloc - now) < 0.1, f"Expected {now}, got {updated_alloc}"
    print("[PASS] Global cooldown checked & verified.")

    # 2. Test Service Cooldown Integration
    test_service = "tg"
    initial_serv_alloc = await check_service_cooldown(test_phone, test_service)
    assert initial_serv_alloc == 0.0, f"Expected 0.0, got {initial_serv_alloc}"
    
    await set_service_cooldown(test_phone, test_service, now)
    updated_serv_alloc = await check_service_cooldown(test_phone, test_service)
    assert abs(updated_serv_alloc - now) < 0.1, f"Expected {now}, got {updated_serv_alloc}"
    print("[PASS] Service cooldown checked & verified.")

    # 3. Test Activations Save & Get
    act_id = "test_act_12345"
    act_data = {
        "id": act_id,
        "client_id": "test_client",
        "service": "tg",
        "country": "22",
        "number": test_phone,
        "created": now,
        "status": "STATUS_WAIT_CODE"
    }
    
    # Should be None initially
    initial_act = await get_activation(act_id)
    assert initial_act is None, f"Expected None, got {initial_act}"
    
    # Save and fetch
    await save_activation(act_id, act_data)
    fetched_act = await get_activation(act_id)
    assert fetched_act is not None, "Expected activation to be found"
    assert fetched_act["client_id"] == "test_client", f"Expected 'test_client', got {fetched_act.get('client_id')}"
    print("[PASS] Save and get activation verified.")

    # 4. Test Get All Activations
    all_acts = await get_all_activations()
    assert act_id in all_acts, f"Expected activation {act_id} in all activations list"
    print("[PASS] Get all activations list verified.")
    
    print("All tests completed successfully!")

if __name__ == "__main__":
    if sys.platform == 'win32' and sys.version_info < (3, 14):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(run_tests())
