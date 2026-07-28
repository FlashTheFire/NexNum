"""
Phase P1 Migration Test Suite
Validates DatabaseAdapter extensions, UserManagement, OrderManagement, DepositManagement, and FinancialManagement
running against PostgreSQL/Supabase without mandatory Redis persistent storage.
"""

import sys
import os
import asyncio
import uuid

# Ensure Windows Selector Event Loop policy for psycopg3 compatibility on Windows
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

BOT_PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BOT_PROJECT_DIR not in sys.path:
    sys.path.insert(0, BOT_PROJECT_DIR)

from dotenv import load_dotenv
load_dotenv("D:/Nex-Projects/NexNum/.env")

from utils.db import db_adapter
from handlers.manager.operation import UserManagement, OrderManagement, DepositManagement, FinancialManagement


async def test_database_adapter_sessions_and_referrals():
    print("Running test_database_adapter_sessions_and_referrals...")
    test_tg_id = f"test_tg_{uuid.uuid4().hex[:8]}"
    
    # Ensure user exists in users table first
    user = await db_adapter.get_or_create_user(telegram_id=test_tg_id, name="Test User")
    assert user["telegram_id"] == test_tg_id
    
    # 1. Test Session
    saved = await db_adapter.save_user_session(test_tg_id, {
        "selected_country_id": 22,
        "selected_service_code": "wa",
        "menu_state": "services",
        "temp_data": {"test_key": "test_val"}
    })
    assert saved is True

    session = await db_adapter.get_user_session(test_tg_id)
    assert session["selected_country_id"] == 22
    assert session["selected_service_code"] == "wa"
    assert session["menu_state"] == "services"

    # 2. Test Referral
    ref_tg_id = f"ref_tg_{uuid.uuid4().hex[:8]}"
    await db_adapter.get_or_create_user(telegram_id=ref_tg_id, name="Referrer User")
    
    ref_code = f"REF_{uuid.uuid4().hex[:6]}"
    saved_ref = await db_adapter.save_referral_info(test_tg_id, ref_tg_id, ref_code)
    assert saved_ref is True

    ref_info = await db_adapter.get_referral_info(test_tg_id)
    assert ref_info is not None
    assert ref_info["referral_code"] == ref_code
    assert ref_info["referrer_telegram_id"] == ref_tg_id
    print("PASSED: test_database_adapter_sessions_and_referrals")


async def test_database_adapter_deposits_and_orders():
    print("Running test_database_adapter_deposits_and_orders...")
    test_tg_id = f"test_tg_{uuid.uuid4().hex[:8]}"
    await db_adapter.get_or_create_user(telegram_id=test_tg_id, name="Depositor User")

    # 1. Test Deposit Request
    dep_id = await db_adapter.create_deposit_request(
        telegram_id=test_tg_id,
        amount=50.0,
        gateway="UPI",
        idempotency_key=f"idem_{uuid.uuid4().hex}"
    )
    assert dep_id is not None

    dep = await db_adapter.get_deposit_request(dep_id)
    assert dep is not None
    assert float(dep["amount"]) == 50.0
    assert dep["status"] == "PENDING"

    updated_dep = await db_adapter.update_deposit_status(dep_id, "COMPLETED", code="TXN12345")
    assert updated_dep is True

    dep_after = await db_adapter.get_deposit_request(dep_id)
    assert dep_after["status"] == "COMPLETED"
    assert dep_after["code"] == "TXN12345"

    # 2. Test Activation Order
    act_id = f"act_{uuid.uuid4().hex[:10]}"
    order_id = await db_adapter.create_activation_order(
        telegram_id=test_tg_id,
        service_name="whatsapp",
        country_name="India",
        amount=15.5,
        activation_id=act_id,
        phone_number="+919876543210",
        provider="5sim"
    )
    assert order_id is not None

    order = await db_adapter.get_activation_order(order_id)
    assert order is not None
    assert order["service_name"] == "whatsapp"
    assert float(order["amount"]) == 15.5
    assert order["activation_id"] == act_id

    sms_updated = await db_adapter.update_activation_sms(order_id, sms_code="987654", status="COMPLETED")
    assert sms_updated is True

    order_after = await db_adapter.get_activation_order(order_id)
    assert order_after["sms_code"] == "987654"
    assert order_after["status"] == "COMPLETED"
    print("PASSED: test_database_adapter_deposits_and_orders")


async def test_database_adapter_advisory_locks():
    print("Running test_database_adapter_advisory_locks...")
    lock_key = f"lock_{uuid.uuid4().hex}"
    
    # Acquire lock
    acquired = await db_adapter.acquire_advisory_lock(lock_key, ttl_seconds=10)
    assert acquired is True

    # Release lock
    released = await db_adapter.release_advisory_lock(lock_key)
    assert released is True
    print("PASSED: test_database_adapter_advisory_locks")


async def test_managers_integration_without_redis():
    print("Running test_managers_integration_without_redis...")
    # Pass redis_manager=None to verify operations work without Redis
    u_mgr = UserManagement(redis_manager=None, enable_logging=False)
    o_mgr = OrderManagement(redis_manager=None, enable_logging=False)
    d_mgr = DepositManagement(redis_manager=None, enable_logging=False)
    f_mgr = FinancialManagement(deposit_mgr=d_mgr, order_mgr=o_mgr, user_mgr=u_mgr, enable_logging=False)

    test_tg_id = f"test_mgr_{uuid.uuid4().hex[:8]}"

    # 1. Create User
    create_res = await u_mgr.create_user({
        "user_id": test_tg_id,
        "first_name": "Manager User",
        "username": "mgr_user",
        "language_code": "en"
    })
    assert create_res["response"] is True

    # 2. Get User Data
    user_res = await u_mgr.get_user_data(test_tg_id)
    assert user_res["response"] is True
    assert user_res["result"]["first_name"] == "Manager User"

    # 3. Create & Add Order Data
    gen_id_res = await o_mgr.create_order_id(test_tg_id)
    assert gen_id_res["response"] is True
    order_id = str(gen_id_res["result"])

    add_ord_res = await o_mgr.add_order_data(order_id, test_tg_id, {
        "app_name": "telegram",
        "country_name": "USA",
        "order_amount": 25.0,
        "order_status": "PENDING",
        "number": "+12025550143"
    })
    assert add_ord_res["response"] is True

    get_ord_res = await o_mgr.get_order_data(order_id)
    assert get_ord_res["response"] is True
    assert get_ord_res["result"]["service_name"] == "telegram"

    # 4. Create & Add Deposit Data
    gen_dep_res = await d_mgr.create_deposit_id(test_tg_id)
    assert gen_dep_res["response"] is True
    dep_id = str(gen_dep_res["result"])

    add_dep_res = await d_mgr.add_deposit_data(dep_id, test_tg_id, {
        "amount": 100.0,
        "gateway": "CRYPTO",
        "deposit_status": "PENDING"
    })
    assert add_dep_res["response"] is True

    get_dep_res = await d_mgr.get_deposit_data(dep_id)
    assert get_dep_res["response"] is True
    assert float(get_dep_res["result"]["amount"]) == 100.0

    # 5. Financial Summary
    fin_res = await f_mgr.get_user(test_tg_id)
    assert fin_res["response"] is True
    assert "metrics" in fin_res
    print("PASSED: test_managers_integration_without_redis")


async def main():
    print("=== Starting Phase P1 Migration Tests ===")
    await db_adapter.init_pool()
    try:
        await test_database_adapter_sessions_and_referrals()
        await test_database_adapter_deposits_and_orders()
        await test_database_adapter_advisory_locks()
        await test_managers_integration_without_redis()
        print("\n==================================================")
        print("ALL PHASE P1 TESTS PASSED CLEANLY & SUCCESSFULLY!")
        print("==================================================\n")
    finally:
        await db_adapter.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
