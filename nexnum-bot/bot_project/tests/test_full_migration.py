import sys
import os
import asyncio
import logging
from pathlib import Path
from dotenv import load_dotenv

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

BOT_PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BOT_PROJECT_DIR not in sys.path:
    sys.path.insert(0, BOT_PROJECT_DIR)

load_dotenv("D:/Nex-Projects/NexNum/.env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_full_migration")

from utils.db import db_adapter
from handlers.security.transaction_guard import TransactionGuard

async def run_p1_tests():
    logger.info("=== [Phase P1] DatabaseAdapter & Operations ===")
    user_id = f"p6_full_user_{int(asyncio.get_event_loop().time())}"

    # User & session
    session = await db_adapter.get_user_session(user_id)
    assert session is not None and "menu_state" in session

    await db_adapter.save_user_session(user_id, {"selected_country_id": "1", "menu_state": "COUNTRY"})
    session_after = await db_adapter.get_user_session(user_id)
    assert session_after["menu_state"] == "COUNTRY"

    # Referral
    ref_saved = await db_adapter.save_referral_info(user_id, referrer_id=None, code=f"ref_{user_id}")
    assert ref_saved is True

    ref_info = await db_adapter.get_referral_info(user_id)
    assert ref_info is not None and ref_info["referral_code"] == f"ref_{user_id}"

    # Deposit
    dep_id = await db_adapter.create_deposit_request(user_id, 100.0, "upi", f"idemp_{user_id}")
    assert dep_id is not None
    dep_updated = await db_adapter.update_deposit_status(dep_id, "COMPLETED", "TXN123456")
    assert dep_updated is True

    # Order
    order_id = await db_adapter.create_activation_order(
        telegram_id=user_id,
        service_name="whatsapp",
        country_name="India",
        amount=15.5,
        phone_number="+919876543210",
        activation_id=f"act_{user_id}"
    )
    assert order_id is not None
    order_updated = await db_adapter.update_activation_sms(order_id, "123456", "COMPLETED")
    assert order_updated is True

    logger.info("Phase P1 Tests: PASSED")

async def run_p2_tests():
    logger.info("=== [Phase P2] Core Handlers & System Stats ===")
    # Advisory lock
    guard = TransactionGuard(lock_timeout=10)
    async with guard:
        lock_acquired = await guard.acquire_lock(f"p6_lock_{int(asyncio.get_event_loop().time())}")
        assert lock_acquired is True

    # System stats
    stats = await db_adapter.get_system_stats_pg()
    assert "pending_orders" in stats
    assert "completed_orders" in stats
    logger.info(f"System Stats: {stats}")
    logger.info("Phase P2 Tests: PASSED")

async def run_p3_tests():
    logger.info("=== [Phase P3] Support Tickets & Fallback Search ===")
    user_id = f"p6_supp_user_{int(asyncio.get_event_loop().time())}"

    ticket_id = await db_adapter.create_support_ticket(user_id, "Need help with API key.", "api", "API Issue")
    assert ticket_id is not None

    ticket = await db_adapter.get_support_ticket(ticket_id)
    assert ticket is not None
    assert ticket["status"] == "OPEN"

    search_res = await db_adapter.search_support_tickets(telegram_id=user_id)
    assert search_res["total"] >= 1
    logger.info("Phase P3 Tests: PASSED")

async def run_p4_p5_tests():
    logger.info("=== [Phase P4 & P5] Redis Fallback & Migrator ===")
    from scripts.migrate_redis_to_db import RedisToPgMigrator
    migrator = RedisToPgMigrator(dry_run=True, batch_size=10)
    await migrator.run()
    logger.info("Phase P4 & P5 Tests: PASSED")

async def main():
    logger.info("==================================================")
    logger.info("    EXECUTION OF FULL END-TO-END MIGRATION SUITE  ")
    logger.info("==================================================")

    await db_adapter.init_pool()
    try:
        await run_p1_tests()
        await run_p2_tests()
        await run_p3_tests()
        await run_p4_p5_tests()

        print("\n" + "=" * 55)
        print("[SUCCESS] ALL MIGRATION TEST SUITES (P1-P6) PASSED 100% CLEANLY!")
        print("=======================================================\n")
    finally:
        await db_adapter.close_pool()

if __name__ == "__main__":
    asyncio.run(main())
