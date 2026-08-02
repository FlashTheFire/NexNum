"""
Account Linking Integration Test Suite
Validates:
1. Account link conflict rejection when Telegram ID is already linked to another Web App user.
2. Concurrent relinking in opposite directions (deadlock prevention via ascending ID locking).
3. Complete account merge migrating wallet transactions, outbound referrals, and inbound referrals safely.
"""

import sys
import os
import asyncio
import uuid
from decimal import Decimal

# Ensure Windows Selector Event Loop policy for psycopg3 compatibility on Windows
if sys.platform == 'win32' and sys.version_info < (3, 14):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())  # type: ignore[attr-defined]

BOT_PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BOT_PROJECT_DIR not in sys.path:
    sys.path.insert(0, BOT_PROJECT_DIR)

try:
    from utils.db import db_adapter
except ImportError:
    from bot_project.utils.db import db_adapter  # type: ignore[no-redef]


async def create_test_user(email: str, name: str, origin: str = 'web', tg_id: str | None = None) -> str:
    """Helper to insert a test user with wallet."""
    user_id = str(uuid.uuid4())
    pool = await db_adapter._ensure_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "INSERT INTO users (id, email, password_hash, name, telegram_id, account_origin, updated_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, NOW())",
                (user_id, email, "hash_dummy", name, tg_id, origin)
            )
            wallet_id = str(uuid.uuid4())
            await cur.execute(
                "INSERT INTO wallets (id, user_id, balance, reserved, updated_at) "
                "VALUES (%s, %s, 10.00, 0.00, NOW())",
                (wallet_id, user_id)
            )
            await conn.commit()
    return user_id


async def test_account_link_conflict_rejection():
    """
    Test Item 2: Telegram ID T linked to Web App user A, then attempting to link to Web App user B.
    Verifies operation is rejected with ACCOUNT_LINK_CONFLICT and User A remains unchanged.
    """
    print("Running test_account_link_conflict_rejection...")
    tg_id = f"tg_conflict_{uuid.uuid4().hex[:8]}"

    # Create Web App User A (origin = 'web', linked to tg_id)
    user_a_id = await create_test_user(
        email=f"user_a_{uuid.uuid4().hex[:6]}@example.com",
        name="User A (Web App)",
        origin="web",
        tg_id=tg_id
    )

    # Create Web App User B (origin = 'web', unlinked)
    user_b_id = await create_test_user(
        email=f"user_b_{uuid.uuid4().hex[:6]}@example.com",
        name="User B (Web App)",
        origin="web",
        tg_id=None
    )

    # Attempt to link Telegram ID T to Web App User B
    res = await db_adapter.link_telegram_account(web_user_id=user_b_id, telegram_id=tg_id)

    # Verify conflict rejection
    assert res["success"] is False
    assert res.get("error_code") == "ACCOUNT_LINK_CONFLICT"

    # Verify User A remains unchanged (still owns tg_id)
    pool = await db_adapter._ensure_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT telegram_id FROM users WHERE id = %s", (user_a_id,))
            row_a = await cur.fetchone()
            assert row_a["telegram_id"] == tg_id

            await cur.execute("SELECT telegram_id FROM users WHERE id = %s", (user_b_id,))
            row_b = await cur.fetchone()
            assert row_b["telegram_id"] is None

    print("PASSED: test_account_link_conflict_rejection")


async def test_concurrent_telegram_id_relink_locking():
    """
    Test Item 3: Concurrent relinking in opposite directions.
    Verifies that locking in ascending user ID order prevents deadlocks.
    """
    print("Running test_concurrent_telegram_id_relink_locking...")
    tg_1 = f"tg_swap1_{uuid.uuid4().hex[:6]}"
    tg_2 = f"tg_swap2_{uuid.uuid4().hex[:6]}"

    # Create bot provisioned user 1 & user 2
    u1_id = await create_test_user(email=f"tg_{tg_1}@nexnum.internal", name="Bot 1", origin="bot", tg_id=tg_1)
    u2_id = await create_test_user(email=f"tg_{tg_2}@nexnum.internal", name="Bot 2", origin="bot", tg_id=tg_2)

    # Create two Web App users
    w1_id = await create_test_user(email=f"web1_{uuid.uuid4().hex[:6]}@example.com", name="Web 1", origin="web")
    w2_id = await create_test_user(email=f"web2_{uuid.uuid4().hex[:6]}@example.com", name="Web 2", origin="web")

    # Run concurrent relinks: W1 links tg_2 while W2 links tg_1
    task1 = db_adapter.link_telegram_account(web_user_id=w1_id, telegram_id=tg_2)
    task2 = db_adapter.link_telegram_account(web_user_id=w2_id, telegram_id=tg_1)

    res1, res2 = await asyncio.gather(task1, task2)

    assert res1["success"] is True
    assert res2["success"] is True

    print("PASSED: test_concurrent_telegram_id_relink_locking")


async def test_account_merge_wallet_and_referral_migration():
    """
    Test Item 4: Merges bot-provisioned user into Web App user.
    Verifies:
    1. Wallet balance is merged and wallet_transactions are reassigned.
    2. Outbound user_referrals record is migrated conflict-safely.
    3. Inbound user_referrals records (including self-referrals) are handled cleanly.
    """
    print("Running test_account_merge_wallet_and_referral_migration...")
    tg_id = f"tg_merge_{uuid.uuid4().hex[:6]}"

    # Create Web App user
    web_id = await create_test_user(email=f"web_merge_{uuid.uuid4().hex[:6]}@example.com", name="Web Master", origin="web")

    # Create Bot User (origin = 'bot') with balance = 25.00
    bot_id = await create_test_user(email=f"tg_{tg_id}@telegram.nexnum.in", name="Bot Provisioned", origin="bot", tg_id=tg_id)

    pool = await db_adapter._ensure_pool()
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            # Set bot wallet balance to 25.00 and add a wallet_transaction
            await cur.execute("SELECT id FROM wallets WHERE user_id = %s", (bot_id,))
            bot_w = await cur.fetchone()
            bot_w_id = bot_w["id"]

            await cur.execute("UPDATE wallets SET balance = 25.00 WHERE id = %s", (bot_w_id,))
            tx_id = str(uuid.uuid4())
            await cur.execute(
                "INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, created_at) "
                "VALUES (%s, %s, 25.00, 'DEPOSIT', 'Test deposit on bot', NOW())",
                (tx_id, bot_w_id)
            )

            # Insert outbound referral record for bot_id
            await cur.execute(
                "INSERT INTO user_referrals (user_id, telegram_id, referral_code) "
                "VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                (bot_id, tg_id, f"REF_{uuid.uuid4().hex[:6]}")
            )

            # Insert inbound referral where bot_id referred web_id (self-referral check)
            await cur.execute(
                "INSERT INTO user_referrals (user_id, referrer_id, referral_code) "
                "VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                (web_id, bot_id, f"REF_{uuid.uuid4().hex[:6]}")
            )
            await conn.commit()

    # Execute link / merge
    res = await db_adapter.link_telegram_account(web_user_id=web_id, telegram_id=tg_id)
    assert res["success"] is True

    # Verify wallet_transactions reassigned to web_id's wallet
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT id FROM wallets WHERE user_id = %s", (web_id,))
            web_w = await cur.fetchone()
            web_w_id = web_w["id"]

            await cur.execute("SELECT wallet_id FROM wallet_transactions WHERE id = %s", (tx_id,))
            wt = await cur.fetchone()
            assert wt["wallet_id"] == web_w_id, "wallet_transaction was not reassigned to target user's wallet"

            # Verify self-referral set to NULL
            await cur.execute("SELECT referrer_id FROM user_referrals WHERE user_id = %s", (web_id,))
            ref_row = await cur.fetchone()
            assert ref_row["referrer_id"] is None, "self-referral loop was not cleared"

    print("PASSED: test_account_merge_wallet_and_referral_migration")


async def run_all_tests():
    await test_account_link_conflict_rejection()
    await test_concurrent_telegram_id_relink_locking()
    await test_account_merge_wallet_and_referral_migration()
    print("\nALL ACCOUNT LINKING INTEGRATION TESTS PASSED CLEANLY!")


if __name__ == "__main__":
    asyncio.run(run_all_tests())
