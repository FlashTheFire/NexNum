import sys
import os
import asyncio
import httpx

os.environ["REDIS_HOST"] = "127.0.0.1"
os.environ["ENABLE_REDIS"] = "False"

BOT_PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BOT_PROJECT_DIR not in sys.path:
    sys.path.insert(0, BOT_PROJECT_DIR)

from main import fastapi_app

async def test_spec_endpoints():
    print("Testing Gateway Spec Endpoint Responses...")
    transport = httpx.ASGITransport(app=fastapi_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:

        # 1. getBalance
        res = await client.get("/stubs/handler_api.php?action=getBalance&api_key=testkey")
        assert "ACCESS_BALANCE:" in res.text, f"getBalance failed: {res.text}"
        print(f"[PASS] getBalance -> {res.text}")

        # 2. getServicesList
        res = await client.get("/stubs/handler_api.php?action=getServicesList&api_key=testkey")
        data = res.json()
        assert isinstance(data, list) and len(data) > 0
        assert "code" in data[0] and "external_id" in data[0] and "name" in data[0]
        print(f"[PASS] getServicesList -> {len(data)} services mapped successfully")

        # 3. getCountriesList
        res = await client.get("/stubs/handler_api.php?action=getCountriesList&api_key=testkey")
        data = res.json()
        assert isinstance(data, list) and len(data) > 0
        assert "code" in data[0] and "id" in data[0] and "eng" in data[0]
        print(f"[PASS] getCountriesList -> {data}")

        # 4. getPrices
        res = await client.get("/stubs/handler_api.php?action=getPrices&api_key=testkey&country=22&service=tg")
        data = res.json()
        assert "22" in data and "tg" in data["22"]
        assert "cost" in data["22"]["tg"] and "count" in data["22"]["tg"]
        print(f"[PASS] getPrices -> {data}")

        # 5. getFullSms (with active activation and SMS text)
        from app.gateway.router import save_activation
        import time

        act_id = "test_full_sms_99"
        await save_activation(act_id, {
            "id": act_id,
            "client_id": "test_client",
            "service": "tg",
            "country": "22",
            "number": "+919999988888",
            "created": time.time(),
            "status": "STATUS_OK",
            "has_sms": True,
            "code_text": "Your Telegram code is 77665"
        })

        res = await client.get(f"/stubs/handler_api.php?action=getFullSms&api_key=testkey&id={act_id}")
        data = res.json()
        assert isinstance(data, dict), f"Expected JSON dict, got {res.text}"
        assert data.get("fullSms") == "Your Telegram code is 77665", f"fullSms mismatch: {data}"
        assert data.get("sms", {}).get("text") == "Your Telegram code is 77665", f"sms.text mismatch: {data}"
        print(f"[PASS] getFullSms (dynamic provider json_object) -> {data}")

        print("All Spec Endpoint Tests Passed Successfully!")

if __name__ == "__main__":
    if sys.platform == 'win32' and sys.version_info < (3, 14):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_spec_endpoints())
