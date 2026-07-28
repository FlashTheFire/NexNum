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
logger = logging.getLogger("test_p4_migration")

from utils.db import db_adapter
import utils.config as config
from utils.redis_manager import RedisManager

async def test_redis_disabled_fallback():
    logger.info("Running test_redis_disabled_fallback...")

    # Override ENABLE_REDIS to False to simulate Redis-free execution
    config.ENABLE_REDIS = False

    test_redis_mgr = RedisManager()
    client = await test_redis_mgr.get_client()
    assert client is None, "Redis client should return None when ENABLE_REDIS is False"

    # Verify DatabaseAdapter works standalone without Redis
    user_info = await db_adapter.get_or_create_user(f"p4_user_{int(asyncio.get_event_loop().time())}")
    assert user_info is not None, "DatabaseAdapter failed to create user in PostgreSQL without Redis"
    assert "id" in user_info

    logger.info("PASSED: test_redis_disabled_fallback")

async def main():
    logger.info("=== Starting Phase P4 Migration Tests ===")
    await db_adapter.init_pool()
    try:
        await test_redis_disabled_fallback()
        print("\n==================================================")
        print("ALL PHASE P4 TESTS PASSED CLEANLY & SUCCESSFULLY!")
        print("==================================================\n")
    finally:
        await db_adapter.close_pool()

if __name__ == "__main__":
    asyncio.run(main())
