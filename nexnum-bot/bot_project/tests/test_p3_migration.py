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
logger = logging.getLogger("test_p3_migration")

from utils.db import db_adapter

async def test_support_tickets_crud():
    logger.info("Running test_support_tickets_crud...")
    test_user_id = f"p3_user_{int(asyncio.get_event_loop().time())}"

    # 1. Create support ticket
    ticket_id = await db_adapter.create_support_ticket(
        telegram_id=test_user_id,
        message="Need assistance with OTP delivery for WhatsApp.",
        ticket_type="technical",
        subject="OTP Delay"
    )
    assert ticket_id is not None, "Failed to create support ticket in PostgreSQL"

    # 2. Get support ticket
    ticket = await db_adapter.get_support_ticket(ticket_id)
    assert ticket is not None, "Failed to fetch created support ticket"
    assert ticket["ticket_type"] == "technical"
    assert ticket["status"] == "OPEN"
    assert "Need assistance" in ticket["message"]

    # 3. Update ticket status
    updated = await db_adapter.update_support_ticket_status(ticket_id, "RESOLVED")
    assert updated is True, "Failed to update support ticket status"

    ticket_after = await db_adapter.get_support_ticket(ticket_id)
    assert ticket_after["status"] == "RESOLVED"

    # 4. Search support tickets
    search_res = await db_adapter.search_support_tickets(telegram_id=test_user_id)
    assert search_res["response"] is True
    assert search_res["total"] >= 1
    assert len(search_res["results"]) >= 1

    logger.info("PASSED: test_support_tickets_crud")

async def test_search_orders_pg_fallback():
    logger.info("Running test_search_orders_pg_fallback...")
    res = await db_adapter.search_purchase_orders(limit=10, offset=0)
    assert res["response"] is True
    assert "total" in res
    assert "results" in res
    logger.info(f"PostgreSQL purchase orders count: {res['total']}")
    logger.info("PASSED: test_search_orders_pg_fallback")

async def main():
    logger.info("=== Starting Phase P3 Migration Tests ===")
    await db_adapter.init_pool()
    try:
        await test_support_tickets_crud()
        await test_search_orders_pg_fallback()
        print("\n==================================================")
        print("ALL PHASE P3 TESTS PASSED CLEANLY & SUCCESSFULLY!")
        print("==================================================\n")
    finally:
        await db_adapter.close_pool()

if __name__ == "__main__":
    asyncio.run(main())
