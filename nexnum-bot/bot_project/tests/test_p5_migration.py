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
logger = logging.getLogger("test_p5_migration")

from scripts.migrate_redis_to_db import RedisToPgMigrator
from utils.db import db_adapter

async def test_migration_script_dry_run():
    logger.info("Running test_migration_script_dry_run...")
    migrator = RedisToPgMigrator(dry_run=True, batch_size=10)
    await migrator.run()
    assert migrator.stats["sessions"]["errors"] == 0
    assert migrator.stats["referrals"]["errors"] == 0
    assert migrator.stats["orders"]["errors"] == 0
    assert migrator.stats["deposits"]["errors"] == 0
    logger.info("PASSED: test_migration_script_dry_run")

async def main():
    logger.info("=== Starting Phase P5 Migration Tests ===")
    await test_migration_script_dry_run()
    print("\n==================================================")
    print("ALL PHASE P5 TESTS PASSED CLEANLY & SUCCESSFULLY!")
    print("==================================================\n")

if __name__ == "__main__":
    asyncio.run(main())
