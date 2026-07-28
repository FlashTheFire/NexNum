import sys
import os
import asyncio
import logging
from pathlib import Path
from dotenv import load_dotenv

# Ensure Windows Selector Event Loop policy for psycopg3 compatibility on Windows
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

BOT_PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BOT_PROJECT_DIR not in sys.path:
    sys.path.insert(0, BOT_PROJECT_DIR)

load_dotenv("D:/Nex-Projects/NexNum/.env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_p2_migration")

from utils.db import db_adapter
from handlers.security.transaction_guard import TransactionGuard
from handlers.main.show_menu import UserStartManager
from handlers.main.show_refferal import ReferManagement
from handlers.methods.admin.admin_panel import AdminPanelManager

async def test_transaction_guard_advisory_locks():
    logger.info(f"Using DB conninfo: {db_adapter.conninfo}")
    logger.info("Running test_transaction_guard_advisory_locks...")
    lock_key = "test_p2_guard_lock_key"
    guard = TransactionGuard(redis_client=None, lock_timeout=10)
    
    # Acquire lock via PostgreSQL advisory lock
    acquired = await guard.acquire_lock(lock_key)
    assert acquired is True, "Failed to acquire advisory lock via TransactionGuard"

    # Second acquire for same lock should fail
    guard2 = TransactionGuard(redis_client=None, lock_timeout=10)
    acquired2 = await guard2.acquire_lock(lock_key)
    assert acquired2 is False, "Acquired advisory lock twice when second attempt should fail"

    # Release lock
    released = await guard.release_lock(lock_key)
    assert released is True, "Failed to release advisory lock via TransactionGuard"
    logger.info("PASSED: test_transaction_guard_advisory_locks")

async def test_admin_panel_system_stats():
    logger.info("Running test_admin_panel_system_stats...")
    stats = await db_adapter.get_system_stats_pg()
    assert isinstance(stats, dict), "get_system_stats_pg should return a dict"
    assert "pending_orders" in stats
    assert "completed_orders" in stats
    assert "deposit_amount" in stats
    logger.info(f"Retrieved PostgreSQL system stats: {stats}")
    logger.info("PASSED: test_admin_panel_system_stats")

async def test_referral_stats_query():
    logger.info("Running test_referral_stats_query...")
    ref_user = f"p2_ref_{int(asyncio.get_event_loop().time())}"
    referrer = f"p2_referrer_{int(asyncio.get_event_loop().time())}"
    
    saved = await db_adapter.save_referral_info(ref_user, referrer, f"REF_{ref_user}")
    assert saved is True, "Failed to save referral info"

    stats = await db_adapter.get_user_referral_stats(referrer, limit=10, offset=0)
    assert stats["total"] >= 1, "Expected referral total count >= 1"
    assert len(stats["referrals"]) >= 1, "Expected referral list to contain referred user"
    logger.info("PASSED: test_referral_stats_query")

async def main():
    logger.info("=== Starting Phase P2 Migration Tests ===")
    await db_adapter.init_pool()
    try:
        await test_transaction_guard_advisory_locks()
        await test_admin_panel_system_stats()
        await test_referral_stats_query()
        print("\n==================================================")
        print("ALL PHASE P2 TESTS PASSED CLEANLY & SUCCESSFULLY!")
        print("==================================================\n")
    finally:
        await db_adapter.close_pool()

if __name__ == "__main__":
    asyncio.run(main())
