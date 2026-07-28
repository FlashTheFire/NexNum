import asyncio
import logging
import uuid
import sys
import os

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv
load_dotenv("D:/Nex-Projects/NexNum/.env")

from utils.db import db_adapter
from psycopg.rows import dict_row

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_account_linking")

async def run_tests():
    logger.info("=== Testing 1-Click Telegram Account Linking ===")
    pool = await db_adapter._ensure_pool()

    web_user_id = f"web_{uuid.uuid4()}"
    bot_telegram_id = str(987654321)

    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            # 1. Setup Web User with 50.0 balance
            await cur.execute(
                "INSERT INTO users (id, name, email, password_hash, updated_at) VALUES (%s, 'Web Test User', %s, 'dummy_hash', NOW())",
                (web_user_id, f"webtest_{web_user_id}@example.com")
            )
            await cur.execute(
                "INSERT INTO wallets (id, user_id, balance) VALUES (%s, %s, 50.0)",
                (str(uuid.uuid4()), web_user_id)
            )
            # 2. Setup Bot User with 25.0 balance
            bot_user_info = await db_adapter.get_or_create_user(bot_telegram_id)
            bot_user_id = bot_user_info["id"]
            await cur.execute(
                "UPDATE wallets SET balance = 25.0 WHERE user_id = %s",
                (bot_user_id,)
            )
            await conn.commit()

    # 3. Create Link Token
    token = await db_adapter.create_account_link_token(web_user_id, ttl_seconds=600)
    logger.info(f"Generated Link Token: {token}")
    assert token.startswith("LINK-"), "Token format mismatch"

    # 4. Consume Token
    consumed_web_id = await db_adapter.consume_account_link_token(token)
    logger.info(f"Consumed Web User ID: {consumed_web_id}")
    assert consumed_web_id == web_user_id, "Consumed user ID mismatch"

    # 5. Link Telegram Account (Merging Wallets: 50.0 + 25.0 = 75.0)
    res = await db_adapter.link_telegram_account(
        web_user_id=web_user_id,
        telegram_id=bot_telegram_id,
        first_name="Linked User",
        username="linked_user"
    )
    logger.info(f"Link Result: {res}")
    assert res.get("success") is True, f"Linking failed: {res}"
    assert res.get("balance") == 75.0, f"Expected merged balance 75.0, got {res.get('balance')}"

    # 6. Verify single unified user record in DB
    async with pool.connection() as conn:
        async with conn.cursor(row_factory=dict_row) as cur:
            await cur.execute("SELECT telegram_id FROM users WHERE id = %s", (web_user_id,))
            row = await cur.fetchone()
            assert row and str(row["telegram_id"]) == bot_telegram_id, "Telegram ID not linked to web user"

    logger.info("[SUCCESS] 1-Click Telegram Account Linking Test Passed 100%!")

if __name__ == "__main__":
    asyncio.run(run_tests())
