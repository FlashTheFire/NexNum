import sys
import os
import asyncio
import json
import logging
import uuid
import time
from pathlib import Path
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, Dict, Any, List, Tuple
from psycopg_pool import AsyncConnectionPool
from psycopg.rows import dict_row
from psycopg.sql import SQL

# Ensure bot_project root is on sys.path for type checkers and runtime
_utils_dir = Path(__file__).resolve().parent
_bot_project_dir = _utils_dir.parent
if str(_bot_project_dir) not in sys.path:
    sys.path.insert(0, str(_bot_project_dir))

from .config import DATABASE_URL

if sys.platform == 'win32' and sys.version_info < (3, 14):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())  # type: ignore[attr-defined]

logger = logging.getLogger("db_adapter")

class DatabaseAdapter:
    """
    Async PostgreSQL Adapter for NexBots targeting NexNum's Supabase schema.
    Uses psycopg 3 with connection pooling.
    """
    def __init__(self, conninfo: Optional[str] = None, min_size: int = 2, max_size: int = 20):
        from .config import DATABASE_URL, sanitize_db_url
        target_info = conninfo or DATABASE_URL or os.getenv("DATABASE_URL", "")
        self.conninfo = sanitize_db_url(target_info)
        self.min_size = min_size
        self.max_size = max_size
        self.pool: Optional[AsyncConnectionPool] = None
        self._user_cache: Dict[str, Tuple[str, str]] = {}  # telegram_id -> (user_uuid, wallet_uuid)

    async def init_pool(self) -> bool:
        """Initialize the async connection pool."""
        if self.pool is not None:
            return True
        from .config import DATABASE_URL, sanitize_db_url
        if not self.conninfo or "localhost:5432" in self.conninfo:
            target_info = os.getenv("DATABASE_URL") or DATABASE_URL or ""
            if target_info and "localhost:5432" not in target_info:
                self.conninfo = sanitize_db_url(target_info)
        try:
            self.pool = AsyncConnectionPool(
                conninfo=self.conninfo,
                min_size=self.min_size,
                max_size=self.max_size,
                timeout=10,
                max_lifetime=300,
                reconnect_timeout=5,
                open=False,
                kwargs={"row_factory": dict_row, "prepare_threshold": None}
            )
            await self.pool.open()
            try:
                self._pool_loop = asyncio.get_running_loop()
            except RuntimeError:
                self._pool_loop = None
            logger.info("Successfully initialized PostgreSQL connection pool.")
            await self.ensure_bot_schema()
            return True
        except Exception as e:
            logger.error(f"Failed to initialize PostgreSQL pool: {e}", exc_info=True)
            self.pool = None
            return False

    async def ensure_bot_schema(self) -> bool:
        """
        Executes bot schema initialization (001_redis_to_pg.sql) to create
        user_sessions, deposit_requests, support_tickets, etc. if missing in DB.
        """
        if not self.pool:
            return False
        sql_file = _bot_project_dir / "migrations" / "bot_schema.sql"
        if not sql_file.exists():
            logger.warning(f"Bot schema migration file not found at {sql_file}")
            return False
        try:
            sql_script = sql_file.read_text(encoding="utf-8")
            async with self.pool.connection() as conn:
                await conn.set_autocommit(True)
                async with conn.cursor() as cur:
                    await cur.execute(sql_script)  # type: ignore[arg-type]
            logger.info("Successfully verified/created bot PostgreSQL schema tables (user_sessions, etc.).")
            return True
        except Exception as e:
            logger.error(f"Error executing bot schema initialization: {e}", exc_info=True)
            return False

    async def close_pool(self) -> None:
        """Close the async connection pool."""
        if self.pool is not None:
            await self.pool.close()
            self.pool = None
            logger.info("Closed PostgreSQL connection pool.")

    async def _ensure_pool(self) -> AsyncConnectionPool:
        """Helper to ensure pool is initialized and return non-null pool."""
        try:
            cur_loop = asyncio.get_running_loop()
        except RuntimeError:
            cur_loop = None

        if self.pool is not None and getattr(self, "_pool_loop", None) != cur_loop:
            logger.info("Event loop changed, resetting PostgreSQL connection pool.")
            try:
                await self.pool.close()
            except Exception:
                pass
            self.pool = None

        if self.pool is None:
            self._pool_loop = cur_loop
            await self.init_pool()

        if self.pool is None:
            raise RuntimeError("Database pool not initialized.")
        return self.pool

    async def get_or_create_user(self, telegram_id: str, name: str = "", email: Optional[str] = None) -> Dict[str, Any]:
        """
        Fetch or create a user in Supabase by Telegram ID.
        Ensures a linked wallet exists in the `wallets` table.
        """
        tg_id_str = telegram_id
        pool = await self._ensure_pool()

        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                # 1. Fetch user by telegram_id
                await cur.execute(
                    "SELECT u.id, u.email, u.name, u.role, u.is_banned, u.created_at, "
                    "w.id as wallet_id, w.balance, w.reserved "
                    "FROM users u LEFT JOIN wallets w ON u.id = w.user_id "
                    "WHERE u.telegram_id = %s",
                    (tg_id_str,)
                )
                row: Any = await cur.fetchone()

                if row:
                    user_uuid = str(row['id'])
                    wallet_uuid = str(row['wallet_id']) if row.get('wallet_id') else None

                    # Create wallet if missing
                    if not wallet_uuid:
                        wallet_uuid = str(uuid.uuid4())
                        await cur.execute(
                            "INSERT INTO wallets (id, user_id, balance, reserved, updated_at) "
                            "VALUES (%s, %s, 0.00, 0.00, NOW()) ON CONFLICT (user_id) DO NOTHING",
                            (wallet_uuid, user_uuid)
                        )
                        await conn.commit()

                    # Update name in PostgreSQL if name is provided and current name is generic fallback
                    if name and (not row['name'] or str(row['name']).startswith("Telegram User ")):
                        await cur.execute(
                            "UPDATE users SET name = %s, updated_at = NOW() WHERE id = %s",
                            (name, user_uuid)
                        )
                        await conn.commit()
                        row['name'] = name
                    
                    self._user_cache[tg_id_str] = (user_uuid, wallet_uuid)
                    return {
                        "id": user_uuid,
                        "telegram_id": tg_id_str,
                        "name": row['name'],
                        "email": row['email'],
                        "role": row['role'],
                        "is_banned": row['is_banned'],
                        "wallet_id": wallet_uuid,
                        "balance": float(row['balance'] or 0.0),
                        "reserved": float(row['reserved'] or 0.0),
                    }

                # 2. Insert new user if not found
                new_user_uuid = str(uuid.uuid4())
                synthetic_email = email or f"tg_{tg_id_str}@nexnum.internal"
                display_name = name or f"Telegram User {tg_id_str}"
                
                await cur.execute(
                    "INSERT INTO users (id, telegram_id, email, password_hash, name, role, is_banned, updated_at) "
                    "VALUES (%s, %s, %s, %s, %s, 'USER', false, NOW()) "
                    "ON CONFLICT (telegram_id) DO UPDATE SET updated_at = NOW() "
                    "RETURNING id, telegram_id, name, email, role, is_banned",
                    (new_user_uuid, tg_id_str, synthetic_email, "$2a$10$BotAutoGeneratedHashDummyKeyForTGUsers", display_name)
                )
                user_res: Any = await cur.fetchone()
                if not user_res:
                    raise RuntimeError("Failed to insert user into database.")

                actual_user_uuid = str(user_res['id'])

                # 3. Create wallet for new user
                new_wallet_uuid = str(uuid.uuid4())
                await cur.execute(
                    "INSERT INTO wallets (id, user_id, balance, reserved, updated_at) "
                    "VALUES (%s, %s, 0.00, 0.00, NOW()) "
                    "ON CONFLICT (user_id) DO NOTHING RETURNING id, balance",
                    (new_wallet_uuid, actual_user_uuid)
                )
                wallet_res: Any = await cur.fetchone()
                actual_wallet_uuid = str(wallet_res['id']) if wallet_res else new_wallet_uuid

                await conn.commit()
                self._user_cache[tg_id_str] = (actual_user_uuid, actual_wallet_uuid)

                return {
                    "id": actual_user_uuid,
                    "telegram_id": tg_id_str,
                    "name": user_res['name'],
                    "email": user_res['email'],
                    "role": user_res['role'],
                    "is_banned": user_res['is_banned'],
                    "wallet_id": actual_wallet_uuid,
                    "balance": 0.0,
                    "reserved": 0.0,
                }

    async def get_user_by_telegram_id(self, telegram_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve user details and wallet balance by Telegram ID."""
        tg_id_str = telegram_id
        pool = await self._ensure_pool()

        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT u.id, u.telegram_id, u.name, u.email, u.role, u.is_banned, "
                    "w.id as wallet_id, w.balance, w.reserved "
                    "FROM users u LEFT JOIN wallets w ON u.id = w.user_id "
                    "WHERE u.telegram_id = %s",
                    (tg_id_str,)
                )
                row: Any = await cur.fetchone()
                if not row:
                    return None
                
                return {
                    "id": str(row['id']),
                    "telegram_id": str(row['telegram_id']),
                    "name": row['name'],
                    "email": row['email'],
                    "role": row['role'],
                    "is_banned": row['is_banned'],
                    "wallet_id": str(row['wallet_id']) if row.get('wallet_id') else None,
                    "balance": float(row['balance'] or 0.0),
                    "reserved": float(row['reserved'] or 0.0),
                }

    async def update_user(self, telegram_id: str, name: Optional[str] = None, is_banned: Optional[bool] = None) -> bool:
        """Update user profile details in PostgreSQL."""
        tg_id_str = telegram_id
        pool = await self._ensure_pool()
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    updates = []
                    params = []
                    if name is not None:
                        updates.append("name = %s")
                        params.append(name)
                    if is_banned is not None:
                        updates.append("is_banned = %s")
                        params.append(is_banned)  # type: ignore[arg-type]  # bool is valid param value
                    if not updates:
                        return True
                    updates.append("updated_at = NOW()")
                    params.append(tg_id_str)
                    sql = f"UPDATE users SET {', '.join(updates)} WHERE telegram_id = %s"
                    await cur.execute(sql, tuple(params))  # type: ignore[arg-type]
                    await conn.commit()
                    return True
        except Exception as e:
            logger.error(f"Error updating user {telegram_id} in PostgreSQL: {e}")
            return False

    async def execute_atomic_balance_update(
        self,
        telegram_id: str,
        amount: float,
        txn_type: str,
        description: str = "",
        idempotency_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Execute an atomic wallet ledger transaction:
        1. Lock wallet row (`FOR UPDATE`)
        2. Verify balance sufficiency if debit (amount < 0)
        3. Update `wallets.balance` and `wallets.ledger_checksum`
        4. Insert audit record into `wallet_transactions`
        """
        tg_id_str = telegram_id
        pool = await self._ensure_pool()

        user_info = await self.get_or_create_user(tg_id_str)
        user_uuid = user_info['id']
        wallet_uuid = user_info['wallet_id']
        decimal_amount = Decimal(str(amount))
        idem_key = idempotency_key or f"bot:{user_uuid}:{txn_type}:{uuid.uuid4()}"

        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                try:
                    # 1. Lock wallet
                    await cur.execute(
                        "SELECT id, balance FROM wallets WHERE user_id = %s FOR UPDATE",
                        (user_uuid,)
                    )
                    wallet_row: Any = await cur.fetchone()
                    if not wallet_row:
                        return {"response": False, "error": "Wallet not found"}

                    current_balance = Decimal(str(wallet_row['balance']))
                    new_balance = current_balance + decimal_amount

                    if decimal_amount < 0 and new_balance < Decimal("0.00"):
                        return {"response": False, "error": "INSUFFICIENT_FUNDS", "balance": float(current_balance)}

                    # 2. Update wallet + ledger checksum
                    await cur.execute(
                        "UPDATE wallets SET balance = %s, ledger_checksum = ledger_checksum + %s, "
                        "ledger_checksum_at = NOW(), updated_at = NOW() WHERE user_id = %s",
                        (new_balance, decimal_amount, user_uuid)
                    )

                    # 3. Insert transaction log
                    txn_uuid = str(uuid.uuid4())
                    await cur.execute(
                        "INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, idempotency_key, created_at) "
                        "VALUES (%s, %s, %s, %s, %s, %s, NOW())",
                        (txn_uuid, wallet_uuid, decimal_amount, txn_type, description, idem_key)
                    )

                    await conn.commit()
                    return {
                        "response": True,
                        "transaction_id": txn_uuid,
                        "user_id": tg_id_str,
                        "previous_balance": float(current_balance),
                        "new_balance": float(new_balance),
                        "amount": float(decimal_amount)
                    }

                except Exception as e:
                    await conn.rollback()
                    logger.error(f"Error in execute_atomic_balance_update for user {telegram_id}: {e}", exc_info=True)
                    return {"response": False, "error": str(e)}

    async def create_purchase_order(
        self,
        telegram_id: str,
        service_name: str,
        country_name: str,
        amount: float,
        status: str = "PENDING",
        provider: Optional[str] = None,
        activation_id: Optional[str] = None,
        expires_at: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """Create a purchase order record in Supabase."""
        tg_id_str = telegram_id
        pool = await self._ensure_pool()

        user_info = await self.get_or_create_user(tg_id_str)
        user_uuid = user_info['id']
        order_uuid = str(uuid.uuid4())
        decimal_amount = Decimal(str(amount))
        exp_time = expires_at or datetime.now(timezone.utc)

        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "INSERT INTO purchase_orders (id, user_id, service_name, country_name, amount, status, provider, activation_id, expires_at, created_at, updated_at) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW()) "
                    "RETURNING id, status, created_at",
                    (order_uuid, user_uuid, service_name, country_name, decimal_amount, status, provider, activation_id, exp_time)
                )
                res: Any = await cur.fetchone()
                if not res:
                    raise RuntimeError("Failed to insert purchase order.")
                await conn.commit()
                return {
                    "response": True,
                    "order_id": str(res['id']),
                    "user_id": tg_id_str,
                    "status": res['status'],
                    "created_at": res['created_at'].isoformat() if res['created_at'] else None
                }

    async def update_purchase_order_status(self, order_id: str, status: str) -> Dict[str, Any]:
        """Update purchase order status."""
        pool = await self._ensure_pool()

        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "UPDATE purchase_orders SET status = %s, updated_at = NOW() WHERE id = %s RETURNING id, status",
                    (status, order_id)
                )
                res: Any = await cur.fetchone()
                await conn.commit()
                if res:
                    return {"response": True, "order_id": str(res['id']), "status": res['status']}
                return {"response": False, "error": "Order not found"}

    async def get_purchase_order(self, order_id: str) -> Optional[Dict[str, Any]]:
        """Fetch purchase order by ID."""
        pool = await self._ensure_pool()

        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT po.*, u.telegram_id FROM purchase_orders po "
                    "LEFT JOIN users u ON po.user_id = u.id WHERE po.id = %s",
                    (order_id,)
                )
                row: Any = await cur.fetchone()
                if not row:
                    return None
                return {
                    "id": str(row['id']),
                    "user_id": str(row['user_id']),
                    "telegram_id": str(row['telegram_id']),
                    "service_name": row['service_name'],
                    "country_name": row['country_name'],
                    "amount": float(row['amount']),
                    "status": row['status'],
                    "provider": row['provider'],
                    "activation_id": row['activation_id'],
                    "created_at": row['created_at'].isoformat() if row.get('created_at') else None,
                }

    async def get_financial_summary(self, telegram_id: str) -> Dict[str, Any]:
        """Retrieve user financial metrics (balance, total deposits, total spent, order counts) with sub-millisecond Redis caching."""
        tg_id_str = telegram_id
        redis_key = f"user_fin_summary:{tg_id_str}"

        # 1. Fast Path: Check Redis Cache (< 2ms)
        try:
            from .redis_manager import redis_manager
            if redis_manager.redis_client:
                cached_bytes = await redis_manager.redis_client.get(redis_key)
                if cached_bytes:
                    return json.loads(cached_bytes.decode('utf-8') if isinstance(cached_bytes, bytes) else str(cached_bytes))
        except Exception as cache_err:
            logger.debug(f"Redis lookup for financial summary failed: {cache_err}")

        # 2. Database Fallback
        pool = await self._ensure_pool()
        user_info = await self.get_or_create_user(tg_id_str)
        user_uuid = user_info['id']

        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                # Total deposits
                await cur.execute(
                    "SELECT COALESCE(SUM(wt.amount), 0.0) as deposit_sum, COUNT(*) as deposit_count "
                    "FROM wallet_transactions wt JOIN wallets w ON wt.wallet_id = w.id "
                    "WHERE w.user_id = %s AND wt.amount > 0",
                    (user_uuid,)
                )
                dep_res: Any = await cur.fetchone() or {"deposit_sum": 0.0, "deposit_count": 0}

                # Total spent on orders
                await cur.execute(
                    "SELECT COALESCE(SUM(amount), 0.0) as order_sum, COUNT(*) as order_count "
                    "FROM purchase_orders WHERE user_id = %s AND status IN ('COMPLETED', 'PROCESSING', 'PENDING')",
                    (user_uuid,)
                )
                ord_res: Any = await cur.fetchone() or {"order_sum": 0.0, "order_count": 0}

                summary = {
                    "response": True,
                    "full_name": user_info['name'],
                    "metrics": {
                        "current_balance": user_info['balance'],
                        "spend_balance": float(ord_res['order_sum'] or 0.0),
                        "deposits": {
                            "total_amount": float(dep_res['deposit_sum'] or 0.0),
                            "count": int(dep_res['deposit_count'] or 0)
                        },
                        "orders": {
                            "total_amount": float(ord_res['order_sum'] or 0.0),
                            "count": int(ord_res['order_count'] or 0)
                        }
                    }
                }

                # 3. Store in Redis Cache (15s TTL)
                try:
                    from .redis_manager import redis_manager
                    if redis_manager.redis_client:
                        await redis_manager.redis_client.setex(redis_key, 15, json.dumps(summary))
                except Exception:
                    pass

                return summary

    async def invalidate_financial_summary(self, telegram_id: str) -> None:
        """Purge financial summary cache for a user upon wallet or order state change."""
        try:
            from .redis_manager import redis_manager
            if redis_manager.redis_client:
                await redis_manager.redis_client.delete(f"user_fin_summary:{telegram_id}")
        except Exception:
            pass

    async def consume_account_link(self, code: str, telegram_id: str, name: Optional[str] = None) -> Dict[str, Any]:
        """
        Consumes a short-lived link token (e.g. link_ABC123) and associates the Telegram ID 
        with the logged-in Web App user in PostgreSQL/Supabase.
        """
        tg_id_str = telegram_id
        pool = await self._ensure_pool()

        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                # Use the canonical account_link_tokens table (created by bot_schema.sql / Prisma migration)
                await cur.execute(
                    "SELECT user_id FROM account_link_tokens WHERE token = %s AND expires_at > NOW()",
                    (code,)
                )
                link_row: Any = await cur.fetchone()
                if not link_row:
                    return {"success": False, "error": "Invalid or expired link code."}

                web_user_uuid = str(link_row['user_id'])

                await cur.execute(
                    "UPDATE users SET telegram_id = %s, updated_at = NOW() WHERE id = %s RETURNING id, name, email",
                    (tg_id_str, web_user_uuid)
                )
                user_row: Any = await cur.fetchone()

                await cur.execute("DELETE FROM account_link_tokens WHERE token = %s", (code,))
                await conn.commit()

                self._user_cache.pop(tg_id_str, None)

                return {
                    "success": True,
                    "user_id": web_user_uuid,
                    "name": user_row['name'] if user_row else name,
                    "email": user_row['email'] if user_row else None
                }


    # ────────────────────────────────────────────────────────────────
    # Extension Methods: Sessions, Referrals, Deposits, Orders & Locks
    # ────────────────────────────────────────────────────────────────

    async def get_user_session(self, telegram_id: str) -> Dict[str, Any]:
        """Return cached session data for a user (country, service, menu state)."""
        pool = await self._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT us.selected_country_id, us.selected_service_code, us.menu_state, us.temp_data, us.last_activity, us.forum_id, us.forum_message_id, us.forum_archived "
                    "FROM user_sessions us JOIN users u ON us.user_id = u.id "
                    "WHERE u.telegram_id = %s OR us.user_id = %s",
                    (telegram_id, telegram_id)
                )
                row = await cur.fetchone()
                if row:
                    m_state = row.get("menu_state")
                    if isinstance(m_state, str):
                        try:
                            m_state = json.loads(m_state)
                        except Exception:
                            pass
                    return {
                        "selected_country_id": row.get("selected_country_id"),
                        "selected_service_code": row.get("selected_service_code"),
                        "menu_state": m_state or "main",
                        "temp_data": row.get("temp_data") or {},
                        "forum_id": row.get("forum_id"),
                        "forum_message_id": row.get("forum_message_id"),
                        "forum_archived": row.get("forum_archived", False),
                        "last_activity": row.get("last_activity").isoformat() if row.get("last_activity") else None,
                    }
                return {"menu_state": "main", "temp_data": {}}

    async def save_user_session(self, telegram_id: str, session_data: Dict[str, Any]) -> bool:
        """Persist session data into user_sessions table."""
        pool = await self._ensure_pool()
        user_info = await self.get_or_create_user(telegram_id)
        user_uuid = user_info["id"]
        try:
            async with pool.connection() as conn:
                async with conn.cursor(row_factory=dict_row) as cur:
                    menu_state_val = session_data.get("menu_state", "main")
                    await cur.execute(
                        "INSERT INTO user_sessions (user_id, selected_country_id, selected_service_code, "
                        "menu_state, temp_data, forum_id, forum_message_id, forum_archived, updated_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW()) "
                        "ON CONFLICT (user_id) DO UPDATE SET "
                        "selected_country_id = COALESCE(EXCLUDED.selected_country_id, user_sessions.selected_country_id), "
                        "selected_service_code = COALESCE(EXCLUDED.selected_service_code, user_sessions.selected_service_code), "
                        "menu_state = COALESCE(EXCLUDED.menu_state, user_sessions.menu_state), "
                        "temp_data = COALESCE(EXCLUDED.temp_data, user_sessions.temp_data), "
                        "forum_id = COALESCE(EXCLUDED.forum_id, user_sessions.forum_id), "
                        "forum_message_id = COALESCE(EXCLUDED.forum_message_id, user_sessions.forum_message_id), "
                        "forum_archived = COALESCE(EXCLUDED.forum_archived, user_sessions.forum_archived), "
                        "updated_at = NOW() "
                        "RETURNING user_id",
                        (
                            user_uuid,
                            session_data.get("selected_country_id"),
                            session_data.get("selected_service_code"),
                            json.dumps(menu_state_val),
                            json.dumps(session_data.get("temp_data", {})),
                            session_data.get("forum_id"),
                            session_data.get("forum_message_id"),
                            session_data.get("forum_archived", False),
                        ),
                    )
                    await conn.commit()
                    return True
        except Exception as exc:
            logger.error(f"Error saving user session for {telegram_id}: {exc}")
            return False

    # ---- Referrals ----

    async def get_referral_info(self, telegram_id: str) -> Optional[Dict[str, Any]]:
        """Fetch referral chain info for a user."""
        pool = await self._ensure_pool()
        user_info = await self.get_or_create_user(telegram_id)
        user_uuid = user_info["id"]
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT ur.referrer_id, ur.referral_code, u.telegram_id AS referrer_telegram_id "
                    "FROM user_referrals ur LEFT JOIN users u ON ur.referrer_id = u.id "
                    "WHERE ur.user_id = %s",
                    (user_uuid,)
                )
                row = await cur.fetchone()
                if row:
                    return {
                        "referrer_id": str(row["referrer_id"]) if row.get("referrer_id") else None,
                        "referral_code": row.get("referral_code"),
                        "referrer_telegram_id": str(row["referrer_telegram_id"]) if row.get("referrer_telegram_id") else None,
                    }
                return None

    async def save_referral_info(self, telegram_id: str, referrer_id: Optional[str], code: str) -> bool:
        """Persist referral mapping."""
        pool = await self._ensure_pool()
        user_info = await self.get_or_create_user(telegram_id)
        user_uuid = user_info["id"]
        ref_uuid = None
        if referrer_id:
            ref_info = await self.get_or_create_user(referrer_id)
            ref_uuid = ref_info["id"]
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "INSERT INTO user_referrals (user_id, referrer_id, referral_code) VALUES (%s, %s, %s) "
                        "ON CONFLICT (user_id) DO UPDATE SET referrer_id = EXCLUDED.referrer_id, referral_code = EXCLUDED.referral_code",
                        (user_uuid, ref_uuid, code),
                    )
                    await conn.commit()
                    return True
        except Exception as exc:
            logger.error(f"Error saving referral info for {telegram_id}: {exc}")
            return False

    async def get_user_referral_stats(self, telegram_id: str, limit: int = 10, offset: int = 0) -> Dict[str, Any]:
        """Fetch total count and list of referred users for a given referrer telegram_id."""
        pool = await self._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT COUNT(*) as total FROM user_referrals ur "
                    "JOIN users u_ref ON ur.referrer_id = u_ref.id "
                    "WHERE u_ref.telegram_id = %s OR ur.referrer_id = %s",
                    (telegram_id, telegram_id),
                )
                cnt_row = await cur.fetchone()
                total = int(cnt_row["total"]) if cnt_row else 0

                await cur.execute(
                    "SELECT u.telegram_id, u.name, ur.created_at FROM user_referrals ur "
                    "JOIN users u ON ur.user_id = u.id "
                    "JOIN users u_ref ON ur.referrer_id = u_ref.id "
                    "WHERE u_ref.telegram_id = %s OR ur.referrer_id = %s "
                    "ORDER BY ur.created_at DESC LIMIT %s OFFSET %s",
                    (telegram_id, telegram_id, limit, offset),
                )
                rows = await cur.fetchall()
                results = [
                    {
                        "telegram_id": r["telegram_id"],
                        "name": r.get("name") or "User",
                        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
                    }
                    for r in rows
                ]
                return {"total": total, "referrals": results}

    # ---- Deposits ----

    async def create_deposit_request(
        self,
        telegram_id: str,
        amount: float,
        gateway: str = "UPI",
        idempotency_key: Optional[str] = None,
        currency: str = "USD",
        deposit_id: Optional[str] = None,
    ) -> str:
        """Create a pending deposit request and return its UUID."""
        pool = await self._ensure_pool()
        user_info = await self.get_or_create_user(telegram_id)
        user_uuid = user_info["id"]

        use_id = None
        if deposit_id:
            try:
                uuid.UUID(deposit_id)
                use_id = deposit_id
            except ValueError:
                use_id = str(uuid.uuid4())
                if not idempotency_key:
                    idempotency_key = f"dep:{deposit_id}"
        else:
            use_id = str(uuid.uuid4())

        if not idempotency_key:
            idempotency_key = f"dep:{use_id}"

        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "INSERT INTO deposit_requests (id, user_id, amount, gateway, idempotency_key, status) "
                    "VALUES (%s, %s, %s, %s, %s, 'PENDING') "
                    "ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount "
                    "RETURNING id",
                    (use_id, user_uuid, Decimal(str(amount)), gateway, idempotency_key),
                )
                res = await cur.fetchone()
                await conn.commit()
                if res is None:
                    raise RuntimeError("create_deposit_request RETURNING clause returned no row")
                return str(res["id"])

    async def update_deposit_status(
        self,
        deposit_id: str,
        status: str,
        code: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Update deposit status (COMPLETED / FAILED / CANCELLED / TIMEOUT)."""
        pool = await self._ensure_pool()
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    updates = ["status = %s", "updated_at = NOW()"]
                    params: list[Any] = [status]
                    if code is not None:
                        updates.append("code = %s")
                        params.append(code)
                    if metadata is not None:
                        updates.append("metadata = %s")
                        params.append(json.dumps(metadata))
                    params.append(deposit_id)
                    params.append(deposit_id)
                    sql = f"UPDATE deposit_requests SET {', '.join(updates)} WHERE id::text = %s OR idempotency_key = %s"
                    await cur.execute(sql, tuple(params))
                    await conn.commit()
                    return True
        except Exception as exc:
            logger.error(f"Error updating deposit {deposit_id}: {exc}")
            return False

    async def delete_pending_deposit_request(self, deposit_id: str) -> bool:
        """Delete a pending deposit request from PostgreSQL to prevent database bloat."""
        pool = await self._ensure_pool()
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "DELETE FROM deposit_requests WHERE (id::text = %s OR idempotency_key = %s) AND status = 'PENDING'",
                        (deposit_id, f"dep:{deposit_id}")
                    )
                    await conn.commit()
                    return True
        except Exception as exc:
            logger.error(f"Error deleting pending deposit request {deposit_id}: {exc}")
            return False

    async def get_deposit_request(self, deposit_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a single deposit request by ID or idempotency_key."""
        pool = await self._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                dep_str = deposit_id
                await cur.execute(
                    "SELECT dr.*, u.telegram_id FROM deposit_requests dr "
                    "LEFT JOIN users u ON dr.user_id = u.id WHERE dr.id::text = %s OR dr.idempotency_key = %s OR dr.idempotency_key = %s",
                    (dep_str, dep_str, f"dep:{dep_str}"),
                )
                row = await cur.fetchone()
                if not row:
                    return None
                return {
                    "id": str(row["id"]),
                    "user_id": str(row["user_id"]),
                    "telegram_id": str(row.get("telegram_id") or ""),
                    "amount": float(row["amount"]),
                    "gateway": row["gateway"],
                    "code": row.get("code"),
                    "status": row["status"],
                    "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
                }

    async def search_deposit_requests(self, telegram_id: Optional[str] = None, status: Optional[Any] = None, recorded_at: Optional[Any] = None, limit: int = 50, offset: int = 0, hide_recent_pending: bool = False) -> Dict[str, Any]:
        """Query deposit requests from PostgreSQL with filtering."""
        user_info = None
        if telegram_id:
            user_info = await self.get_or_create_user(telegram_id)
        pool = await self._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                where_clauses = []
                params: list[Any] = []
                if telegram_id and user_info:
                    where_clauses.append("(dr.user_id = %s OR dr.user_id = %s)")
                    params.extend([user_info["id"], telegram_id])
                if status:
                    if isinstance(status, list):
                        where_clauses.append("dr.status = ANY(%s)")
                        params.append(status)
                    else:
                        where_clauses.append("dr.status = %s")
                        params.append(status)
                if hide_recent_pending:
                    where_clauses.append("(dr.status = 'COMPLETED' OR dr.created_at < NOW() - INTERVAL '10 minutes')")
                if recorded_at and isinstance(recorded_at, (tuple, list)) and len(recorded_at) == 2:
                    try:
                        st = datetime.fromtimestamp(float(recorded_at[0]), tz=timezone.utc)
                        et = datetime.fromtimestamp(float(recorded_at[1]), tz=timezone.utc)
                        where_clauses.append("dr.created_at >= %s AND dr.created_at <= %s")
                        params.extend([st, et])
                    except Exception:
                        pass

                where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

                await cur.execute(
                    "SELECT dr.*, u.telegram_id FROM deposit_requests dr "
                    f"LEFT JOIN users u ON dr.user_id = u.id {where_sql} "
                    "ORDER BY dr.created_at DESC LIMIT %s OFFSET %s",
                    tuple(params + [limit, offset])
                )
                rows = await cur.fetchall()

                # Also fetch wallet credit transactions if looking for completed deposits
                wt_results = []
                should_fetch_wt = status is None or (isinstance(status, list) and ("COMPLETED" in status or "completed" in status)) or (isinstance(status, str) and status.upper() == "COMPLETED")
                if telegram_id and user_info and should_fetch_wt:
                    wt_params = [user_info["id"], telegram_id]
                    wt_time_sql = ""
                    if recorded_at and isinstance(recorded_at, (tuple, list)) and len(recorded_at) == 2:
                        try:
                            st = datetime.fromtimestamp(float(recorded_at[0]), tz=timezone.utc)
                            et = datetime.fromtimestamp(float(recorded_at[1]), tz=timezone.utc)
                            wt_time_sql = " AND wt.created_at >= %s AND wt.created_at <= %s"
                            wt_params.extend([st, et])
                        except Exception:
                            pass
                    await cur.execute(
                        "SELECT wt.id, w.user_id, wt.amount, wt.created_at, wt.idempotency_key, u.telegram_id "
                        "FROM wallet_transactions wt "
                        "JOIN wallets w ON wt.wallet_id = w.id "
                        "LEFT JOIN users u ON w.user_id = u.id "
                        f"WHERE (w.user_id = %s OR w.user_id = %s) AND LOWER(wt.type) = 'credit'{wt_time_sql} "
                        "ORDER BY wt.created_at DESC LIMIT %s",
                        tuple(wt_params + [limit])
                    )
                    wt_rows = await cur.fetchall()
                    for r in wt_rows:
                        dep_id = r["idempotency_key"].replace("dep_credit:", "") if r.get("idempotency_key") and "dep_credit:" in r["idempotency_key"] else str(r["id"])
                        wt_results.append({
                            "id": f"deposit_data:info:{dep_id}",
                            "deposit_id": dep_id,
                            "user_id": str(r.get("telegram_id") or r["user_id"]),
                            "amount": float(r["amount"]),
                            "deposit_amount": float(r["amount"]),
                            "gateway": "UPI",
                            "method": "UPI",
                            "deposit_status": "COMPLETED",
                            "code": None,
                            "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
                            "recorded_at": r["created_at"].timestamp() if r.get("created_at") else 0,
                        })

                dr_results = [
                    {
                        "id": f"deposit_data:info:{r['id']}",
                        "deposit_id": str(r["id"]),
                        "user_id": str(r.get("telegram_id") or r["user_id"]),
                        "amount": float(r["amount"]),
                        "deposit_amount": float(r["amount"]),
                        "gateway": r.get("gateway", "UPI"),
                        "method": r.get("gateway", "UPI"),
                        "deposit_status": r["status"],
                        "code": r.get("code"),
                        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
                        "recorded_at": r["created_at"].timestamp() if r.get("created_at") else 0,
                    }
                    for r in rows
                ]

                # Deduplicate by deposit_id
                seen_ids = set()
                results = []
                for item in wt_results + dr_results:
                    if item["deposit_id"] not in seen_ids:
                        seen_ids.add(item["deposit_id"])
                        results.append(item)

                results.sort(key=lambda x: x["recorded_at"], reverse=True)
                paginated_results = results[offset : offset + limit]
                return {"response": True, "total": len(results), "results": paginated_results}

    # ---- Activation Orders ----

    async def create_activation_order(
        self,
        telegram_id: str,
        service_name: str,
        country_name: str,
        amount: float,
        activation_id: str,
        phone_number: str,
        provider: Optional[str] = None,
        expires_in_seconds: int = 600,
    ) -> str:
        """Create a purchase order with tracking fields and return its ID."""
        pool = await self._ensure_pool()
        user_info = await self.get_or_create_user(telegram_id)
        user_uuid = user_info["id"]
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                order_uuid = str(uuid.uuid4())
                timeout_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in_seconds)
                await cur.execute(
                    "INSERT INTO purchase_orders "
                    "(id, user_id, service_name, country_name, amount, status, provider, activation_id, "
                    "phone_number, created_at, updated_at, expires_at) "
                    "VALUES (%s, %s, %s, %s, %s, 'PENDING', %s, %s, %s, NOW(), NOW(), %s) "
                    "RETURNING id",
                    (
                        order_uuid,
                        user_uuid,
                        service_name,
                        country_name,
                        Decimal(str(amount)),
                        provider,
                        activation_id,
                        phone_number,
                        timeout_at,
                    ),
                )
                res = await cur.fetchone()
                await conn.commit()
                if res is None:
                    raise RuntimeError("create_activation RETURNING clause returned no row")
                return str(res["id"])

    async def update_activation_sms(
        self,
        order_id: str,
        sms_code: Optional[str] = None,
        status: Optional[str] = None,
        raw_response: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Update SMS code, status, or raw response for an order."""
        pool = await self._ensure_pool()
        try:
            async with pool.connection() as conn:
                async with conn.cursor(row_factory=dict_row) as cur:
                    sets = []
                    vals: list[Any] = []
                    if sms_code is not None:
                        sets.append("sms_code = %s")
                        vals.append(sms_code)
                    if status is not None:
                        sets.append("status = %s")
                        vals.append(status)
                        if status == "COMPLETED":
                            sets.append("completed_at = NOW()")
                    if raw_response is not None:
                        sets.append("raw_response = %s")
                        vals.append(json.dumps(raw_response))
                    sets.append("updated_at = NOW()")
                    vals.append(order_id)
                    sql = f"UPDATE purchase_orders SET {', '.join(sets)} WHERE id = %s OR activation_id = %s RETURNING id"
                    vals.append(order_id)
                    await cur.execute(sql, tuple(vals))
                    await conn.commit()
                    return True
        except Exception as exc:
            logger.error(f"Error updating activation SMS for order {order_id}: {exc}")
            return False

    async def get_activation_order(self, order_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single order by ID or activation_id."""
        pool = await self._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT po.*, u.telegram_id FROM purchase_orders po "
                    "LEFT JOIN users u ON po.user_id = u.id WHERE po.id = %s OR po.activation_id = %s",
                    (order_id, order_id),
                )
                row = await cur.fetchone()
                if not row:
                    return None
                return {
                    "id": str(row["id"]),
                    "order_id": str(row["id"]),
                    "user_id": str(row["user_id"]),
                    "telegram_id": str(row.get("telegram_id") or ""),
                    "service_name": row["service_name"],
                    "app_name": row["service_name"],
                    "country_name": row["country_name"],
                    "amount": float(row["amount"]),
                    "order_amount": float(row["amount"]),
                    "status": row["status"],
                    "order_status": row["status"],
                    "provider": row.get("provider"),
                    "activation_id": row.get("activation_id"),
                    "phone_number": row.get("phone_number"),
                    "number": row.get("phone_number"),
                    "sms_code": row.get("sms_code"),
                    "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
                    "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
                    "expires_at": row["expires_at"].isoformat() if row.get("expires_at") else None,
                    "retry_count": row.get("retry_count", 0),
                }

    async def fetch_pending_orders_batch(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Fetch orders still awaiting SMS (used by order_tracker background loop)."""
        pool = await self._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT po.*, u.telegram_id FROM purchase_orders po "
                    "LEFT JOIN users u ON po.user_id = u.id "
                    "WHERE po.status IN ('PENDING', 'PROCESSING') "
                    "ORDER BY po.created_at ASC LIMIT %s",
                    (limit,),
                )
                rows = await cur.fetchall()
                return [
                    {
                        "id": str(r["id"]),
                        "order_id": str(r["id"]),
                        "user_id": str(r["user_id"]),
                        "telegram_id": str(r.get("telegram_id") or ""),
                        "service_name": r["service_name"],
                        "country_name": r["country_name"],
                        "amount": float(r["amount"]),
                        "status": r["status"],
                        "order_status": r["status"],
                        "provider": r.get("provider"),
                        "activation_id": r.get("activation_id"),
                        "phone_number": r.get("phone_number"),
                        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
                        "expires_at": r["expires_at"].isoformat() if r.get("expires_at") else None,
                    }
                    for r in rows
                ]

    async def search_purchase_orders(self, telegram_id: Optional[str] = None, status: Optional[Any] = None, recorded_at: Optional[Any] = None, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
        """Query purchase orders from PostgreSQL with filtering."""
        user_info = None
        if telegram_id:
            user_info = await self.get_or_create_user(telegram_id)
        pool = await self._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                where_clauses = []
                params: list[Any] = []
                if telegram_id and user_info:
                    where_clauses.append("(po.user_id = %s OR po.user_id = %s)")
                    params.extend([user_info["id"], telegram_id])
                if status:
                    if isinstance(status, list):
                        where_clauses.append("po.status = ANY(%s)")
                        params.append(status)
                    else:
                        where_clauses.append("po.status = %s")
                        params.append(status)
                if recorded_at and isinstance(recorded_at, (tuple, list)) and len(recorded_at) == 2:
                    try:
                        st = datetime.fromtimestamp(float(recorded_at[0]), tz=timezone.utc)
                        et = datetime.fromtimestamp(float(recorded_at[1]), tz=timezone.utc)
                        where_clauses.append("po.created_at >= %s AND po.created_at <= %s")
                        params.extend([st, et])
                    except Exception:
                        pass

                where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

                await cur.execute(f"SELECT COUNT(*) as total FROM purchase_orders po {where_sql}", tuple(params))
                total_row = await cur.fetchone()
                total = total_row["total"] if total_row else 0

                query_params = list(params) + [limit, offset]
                await cur.execute(
                    "SELECT po.*, u.telegram_id FROM purchase_orders po "
                    f"LEFT JOIN users u ON po.user_id = u.id {where_sql} "
                    "ORDER BY po.created_at DESC LIMIT %s OFFSET %s",
                    tuple(query_params)
                )
                rows = await cur.fetchall()
                results = [
                    {
                        "id": f"order_data:info:{r['id']}",
                        "order_id": str(r["id"]),
                        "user_id": str(r.get("telegram_id") or r["user_id"]),
                        "service_name": r.get("service_name", ""),
                        "app_name": r.get("service_name", ""),
                        "country_name": r.get("country_name", ""),
                        "country_code": r.get("country_code", ""),
                        "country_id": str(r.get("country_id", "")),
                        "app_id": str(r.get("app_id", "")),
                        "server_id": str(r.get("server_id", "")),
                        "amount": float(r["amount"]),
                        "order_amount": float(r["amount"]),
                        "status": r["status"],
                        "order_status": r["status"],
                        "provider": r.get("provider"),
                        "activation_id": r.get("activation_id"),
                        "phone_number": r.get("phone_number"),
                        "order_number": json.dumps([r.get("phone_number", ""), r.get("country_code", "")]),
                        "sms_code": r.get("sms_code"),
                        "sms_list": json.dumps([r["sms_code"]] if r.get("sms_code") else []),
                        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
                        "recorded_at": r["created_at"].timestamp() if r.get("created_at") else 0,
                    }
                    for r in rows
                ]
                return {"response": True, "total": total, "results": results}

    async def get_system_stats_pg(self, start_time: Optional[float] = None, end_time: Optional[float] = None) -> Dict[str, Any]:
        """Fetch system statistics (orders, deposits, user counts, amounts) from PostgreSQL."""
        pool = await self._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                st = datetime.fromtimestamp(start_time, tz=timezone.utc) if start_time else None
                et = datetime.fromtimestamp(end_time, tz=timezone.utc) if end_time else None

                # Orders summary
                await cur.execute(
                    "SELECT "
                    "COUNT(*) FILTER (WHERE status IN ('PENDING', 'PROCESSING')) AS pending_orders, "
                    "COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_orders, "
                    "COUNT(*) FILTER (WHERE status IN ('CANCELLED', 'FAILED')) AS cancelled_orders, "
                    "COALESCE(SUM(amount) FILTER (WHERE status = 'COMPLETED'), 0.0) AS order_amount, "
                    "COUNT(DISTINCT user_id) AS active_order_users "
                    "FROM purchase_orders "
                    "WHERE (%s::timestamptz IS NULL OR created_at >= %s::timestamptz) "
                    "AND (%s::timestamptz IS NULL OR created_at <= %s::timestamptz)",
                    (st, st, et, et),
                )
                ord_row = await cur.fetchone() or {}

                # Deposits summary
                await cur.execute(
                    "SELECT "
                    "COUNT(*) FILTER (WHERE status = 'PENDING') AS pending_deposits, "
                    "COUNT(*) FILTER (WHERE status IN ('COMPLETED', 'SUCCESS')) AS completed_deposits, "
                    "COUNT(*) FILTER (WHERE status IN ('CANCELLED', 'FAILED')) AS cancelled_deposits, "
                    "COALESCE(SUM(amount) FILTER (WHERE status IN ('COMPLETED', 'SUCCESS')), 0.0) AS deposit_amount, "
                    "COUNT(DISTINCT user_id) AS active_deposit_users "
                    "FROM deposit_requests "
                    "WHERE (%s::timestamptz IS NULL OR created_at >= %s::timestamptz) "
                    "AND (%s::timestamptz IS NULL OR created_at <= %s::timestamptz)",
                    (st, st, et, et),
                )
                dep_row = await cur.fetchone() or {}

                # Total users
                await cur.execute("SELECT COUNT(*) AS total_users FROM users")
                u_row = await cur.fetchone() or {}
                total_users = int(u_row.get("total_users", 0))

                active_users = max(
                    total_users if not start_time else 0,
                    int(ord_row.get("active_order_users") or 0) + int(dep_row.get("active_deposit_users") or 0)
                )

                return {
                    'pending_orders': int(ord_row.get("pending_orders") or 0),
                    'pending_deposits': int(dep_row.get("pending_deposits") or 0),
                    'completed_orders': int(ord_row.get("completed_orders") or 0),
                    'completed_deposits': int(dep_row.get("completed_deposits") or 0),
                    'cancelled_orders': int(ord_row.get("cancelled_orders") or 0),
                    'cancelled_deposits': int(dep_row.get("cancelled_deposits") or 0),
                    'order_amount': float(ord_row.get("order_amount") or 0.0),
                    'deposit_amount': float(dep_row.get("deposit_amount") or 0.0),
                    'active_users': active_users
                }

    # ---- Support Tickets ----

    async def create_support_ticket(
        self,
        telegram_id: str,
        message: str,
        ticket_type: str = "general",
        subject: Optional[str] = None,
    ) -> Optional[str]:
        """Create a new support ticket in PostgreSQL."""
        user_info = await self.get_or_create_user(telegram_id)
        ticket_id = str(uuid.uuid4())
        pool = await self._ensure_pool()
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "INSERT INTO support_tickets (id, user_id, ticket_type, subject, message, status) "
                        "VALUES (%s, %s, %s, %s, %s, 'OPEN') RETURNING id",
                        (ticket_id, user_info["id"], ticket_type, subject or "Support Request", message),
                    )
                    row = await cur.fetchone()
                    await conn.commit()
                    return str(row[0]) if row else ticket_id  # plain cursor, row is a tuple
        except Exception as exc:
            logger.error(f"Error creating support ticket for {telegram_id}: {exc}")
            return None

    async def get_support_ticket(self, ticket_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single support ticket by ID."""
        pool = await self._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT st.*, u.telegram_id FROM support_tickets st "
                    "LEFT JOIN users u ON st.user_id = u.id WHERE st.id::text = %s",
                    (ticket_id,),
                )
                row = await cur.fetchone()
                if not row:
                    return None
                return {
                    "id": str(row["id"]),
                    "ticket_id": str(row["id"]),
                    "user_id": str(row.get("telegram_id") or row["user_id"]),
                    "telegram_id": str(row.get("telegram_id") or ""),
                    "ticket_type": row.get("ticket_type"),
                    "subject": row.get("subject"),
                    "message": row.get("message"),
                    "status": row.get("status"),
                    "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
                }

    async def update_support_ticket_status(self, ticket_id: str, status: str) -> bool:
        """Update status of a support ticket."""
        pool = await self._ensure_pool()
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "UPDATE support_tickets SET status = %s, updated_at = NOW() WHERE id::text = %s",
                        (status, ticket_id),
                    )
                    await conn.commit()
                    return True
        except Exception as exc:
            logger.error(f"Error updating support ticket {ticket_id}: {exc}")
            return False

    async def search_support_tickets(
        self, telegram_id: Optional[str] = None, status: Optional[str] = None, limit: int = 50, offset: int = 0
    ) -> Dict[str, Any]:
        """Query support tickets with filtering."""
        pool = await self._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                where_clauses = []
                params: list[Any] = []
                if telegram_id:
                    user_info = await self.get_or_create_user(telegram_id)
                    where_clauses.append("st.user_id = %s")
                    params.append(user_info["id"])
                if status:
                    where_clauses.append("st.status = %s")
                    params.append(status)

                where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""

                await cur.execute(f"SELECT COUNT(*) as total FROM support_tickets st {where_sql}", tuple(params))
                total_row = await cur.fetchone()
                total = total_row["total"] if total_row else 0

                query_params = list(params) + [limit, offset]
                await cur.execute(
                    "SELECT st.*, u.telegram_id FROM support_tickets st "
                    f"LEFT JOIN users u ON st.user_id = u.id {where_sql} "
                    "ORDER BY st.created_at DESC LIMIT %s OFFSET %s",
                    tuple(query_params),
                )
                rows = await cur.fetchall()
                results = [
                    {
                        "id": str(r["id"]),
                        "ticket_id": str(r["id"]),
                        "user_id": str(r.get("telegram_id") or r["user_id"]),
                        "ticket_type": r.get("ticket_type"),
                        "subject": r.get("subject"),
                        "message": r.get("message"),
                        "status": r.get("status"),
                        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
                    }
                    for r in rows
                ]
                return {"response": True, "total": total, "results": results}

    # ---- Account Linking (Web App <-> Bot 1-Click Link) ----

    async def create_account_link_token(self, user_id: str, ttl_seconds: int = 600) -> str:
        """Create a 1-click account linking token for a Web App user."""
        import secrets
        token = f"LINK-{secrets.token_hex(4).upper()}"
        pool = await self._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "INSERT INTO account_link_tokens (token, user_id, expires_at) "
                    "VALUES (%s, %s, NOW() + INTERVAL '1 second' * %s) "
                    "ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, expires_at = EXCLUDED.expires_at",
                    (token, user_id, ttl_seconds),
                )
                await conn.commit()
        return token

    async def consume_account_link_token(self, token: str) -> Optional[str]:
        """Validate and consume a single-use account link token."""
        pool = await self._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT user_id FROM account_link_tokens WHERE token = %s AND expires_at > NOW()",
                    (token,),
                )
                row = await cur.fetchone()
                if not row:
                    return None
                user_id = str(row["user_id"])
                await cur.execute("DELETE FROM account_link_tokens WHERE token = %s", (token,))
                await conn.commit()
                return user_id

    async def link_telegram_account(
        self,
        web_user_id: str,
        telegram_id: str,
        first_name: str = "",
        username: str = "",
    ) -> Dict[str, Any]:
        """
        Link a Telegram ID to an existing Web App User account.
        Merges any existing bot-provisioned account wallet & history into the master Web App user.
        Locks all affected user rows in one deterministic ascending ID order to prevent deadlocks.
        Rejects relinking if the existing Telegram-linked user is another Web App account.
        Migrates wallet transactions and user_referrals conflict-safely.
        """
        target_web_id = web_user_id
        tg_id_str = telegram_id
        pool = await self._ensure_pool()

        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                # 1. Fetch candidate user IDs (target web user and existing telegram_id owner)
                await cur.execute(
                    "SELECT id FROM users WHERE id = %s OR telegram_id = %s",
                    (target_web_id, tg_id_str)
                )
                candidate_rows = await cur.fetchall()
                candidate_ids = sorted(list({str(r["id"]) for r in candidate_rows}))

                if not candidate_ids or target_web_id not in candidate_ids:
                    return {"success": False, "message": "Web App user account not found.", "error_code": "USER_NOT_FOUND"}

                # 2. Lock all affected user rows in deterministic ascending user ID order
                await cur.execute(
                    "SELECT id, telegram_id, email, password_hash, account_origin FROM users WHERE id = ANY(%s) ORDER BY id ASC FOR UPDATE",
                    (candidate_ids,)
                )
                locked_rows = await cur.fetchall()
                user_map = {str(r["id"]): r for r in locked_rows}

                web_user = user_map.get(target_web_id)
                if not web_user:
                    return {"success": False, "message": "Web App user account not found.", "error_code": "USER_NOT_FOUND"}

                # Check if another user currently holds this telegram_id
                existing_tg_user = None
                for u_id, u_data in user_map.items():
                    if str(u_data.get("telegram_id") or "") == tg_id_str:
                        existing_tg_user = u_data
                        break

                if existing_tg_user and str(existing_tg_user["id"]) != target_web_id:
                    bot_user_id = str(existing_tg_user["id"])

                    # Check if the existing Telegram user is a bot-provisioned account vs a real Web App user account
                    email = str(existing_tg_user.get("email") or "")
                    pass_hash = str(existing_tg_user.get("password_hash") or "")
                    origin = str(existing_tg_user.get("account_origin") or "web")

                    is_bot_provisioned = (
                        origin == "bot" or
                        email.startswith("tg_") or
                        "@telegram." in email or
                        "@nexnum.internal" in email or
                        pass_hash == "$2a$10$BotAutoGeneratedHashDummyKeyForTGUsers"
                    )

                    if not is_bot_provisioned:
                        # Reject operation as an account-link conflict without transferring data or deleting that user
                        return {
                            "success": False,
                            "message": "Account link conflict: Telegram ID is already linked to another Web App user account.",
                            "error_code": "ACCOUNT_LINK_CONFLICT"
                        }

                    # Lock both wallets FOR UPDATE in deterministic order
                    wallet_user_ids = sorted([bot_user_id, target_web_id])
                    await cur.execute(
                        "SELECT id, user_id, balance FROM wallets WHERE user_id = ANY(%s) ORDER BY user_id ASC FOR UPDATE",
                        (wallet_user_ids,)
                    )
                    wallet_rows = await cur.fetchall()
                    wallets_map = {str(w["user_id"]): w for w in wallet_rows}

                    bot_wallet = wallets_map.get(bot_user_id)
                    target_wallet = wallets_map.get(target_web_id)

                    bot_wallet_id = str(bot_wallet["id"]) if bot_wallet else None
                    target_wallet_id = str(target_wallet["id"]) if target_wallet else None
                    bot_bal = float(bot_wallet["balance"]) if bot_wallet and bot_wallet.get("balance") else 0.0

                    # If target user missing wallet, create one
                    if not target_wallet_id:
                        target_wallet_id = str(uuid.uuid4())
                        await cur.execute(
                            "INSERT INTO wallets (id, user_id, balance, reserved, updated_at) "
                            "VALUES (%s, %s, 0.00, 0.00, NOW()) ON CONFLICT (user_id) DO NOTHING",
                            (target_wallet_id, target_web_id)
                        )

                    # 1. Merge balance & record ledger entry if bot user has positive balance
                    if bot_bal > 0 and target_wallet_id:
                        idem_key = f"link_merge_{target_web_id}_{bot_user_id}_{int(time.time())}"
                        await cur.execute(
                            "UPDATE wallets SET balance = balance + %s, updated_at = NOW() WHERE id = %s",
                            (bot_bal, target_wallet_id),
                        )
                        await cur.execute(
                            "INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, idempotency_key, created_at) "
                            "VALUES (%s, %s, %s, 'CREDIT', 'Merged balance from bot account', %s, NOW())",
                            (str(uuid.uuid4()), target_wallet_id, bot_bal, idem_key),
                        )
                        if bot_wallet_id:
                            await cur.execute("UPDATE wallets SET balance = 0.00, updated_at = NOW() WHERE id = %s", (bot_wallet_id,))

                    # Reassign ALL wallet_transactions from bot wallet to target user's wallet (preserves full ledger history)
                    if bot_wallet_id and target_wallet_id:
                        await cur.execute(
                            "UPDATE wallet_transactions SET wallet_id = %s WHERE wallet_id = %s",
                            (target_wallet_id, bot_wallet_id)
                        )

                    # 2. Safely detach telegram_id from bot user FIRST to avoid UniqueViolation
                    await cur.execute("UPDATE users SET telegram_id = NULL WHERE id = %s", (bot_user_id,))

                    # 3. Reassign related records (purchase_orders, deposit_requests, support_tickets)
                    await cur.execute("UPDATE purchase_orders SET user_id = %s WHERE user_id = %s", (target_web_id, bot_user_id))
                    await cur.execute("UPDATE deposit_requests SET user_id = %s WHERE user_id = %s", (target_web_id, bot_user_id))
                    await cur.execute("UPDATE support_tickets SET user_id = %s WHERE user_id = %s", (target_web_id, bot_user_id))

                    # 4. Handle user_referrals conflict-safely for both user_id (outbound) and referrer_id (inbound)
                    # a) Outbound referral (user_id = bot_user_id):
                    await cur.execute("SELECT user_id FROM user_referrals WHERE user_id = %s", (target_web_id,))
                    web_has_ref = await cur.fetchone()
                    if web_has_ref:
                        # Target web user already has referral entry, delete bot user's duplicate entry
                        await cur.execute("DELETE FROM user_referrals WHERE user_id = %s", (bot_user_id,))
                    else:
                        # Reassign bot user's referral record to target web user
                        await cur.execute("UPDATE user_referrals SET user_id = %s WHERE user_id = %s", (target_web_id, bot_user_id))

                    # b) Inbound referrals (referrer_id = bot_user_id):
                    # Prevent self-referral (if target_web_id was referred by bot_user_id)
                    await cur.execute(
                        "UPDATE user_referrals SET referrer_id = NULL WHERE referrer_id = %s AND user_id = %s",
                        (bot_user_id, target_web_id)
                    )
                    # Reassign all other inbound referrals to target_web_id
                    await cur.execute("UPDATE user_referrals SET referrer_id = %s WHERE referrer_id = %s", (target_web_id, bot_user_id))

                    # 5. Delete remaining dependent records and bot user
                    await cur.execute("DELETE FROM user_sessions WHERE user_id = %s", (bot_user_id,))
                    await cur.execute("DELETE FROM user_favorites WHERE user_id = %s", (bot_user_id,))
                    await cur.execute("DELETE FROM notification_preferences WHERE user_id = %s", (bot_user_id,))
                    await cur.execute("DELETE FROM push_subscriptions WHERE user_id = %s", (bot_user_id,))
                    await cur.execute("DELETE FROM notifications WHERE user_id = %s", (bot_user_id,))
                    await cur.execute("DELETE FROM user_referrals WHERE user_id = %s", (bot_user_id,))
                    if bot_wallet_id:
                        await cur.execute("DELETE FROM wallets WHERE id = %s", (bot_wallet_id,))
                    await cur.execute("DELETE FROM users WHERE id = %s", (bot_user_id,))

                # 3. Assign telegram_id to target web user
                await cur.execute(
                    "UPDATE users SET telegram_id = %s, updated_at = NOW() WHERE id = %s",
                    (tg_id_str, target_web_id),
                )
                await conn.commit()

                # Invalidate user cache
                self._user_cache.pop(tg_id_str, None)

                await cur.execute("SELECT balance FROM wallets WHERE user_id = %s", (target_web_id,))
                w_row = await cur.fetchone()
                balance = float(w_row["balance"]) if w_row and w_row.get("balance") else 0.0

                return {
                    "success": True,
                    "user_id": target_web_id,
                    "telegram_id": tg_id_str,
                    "balance": balance,
                    "message": "Account successfully linked!"
                }

    # ---- Advisory Locks ----

    async def acquire_advisory_lock(self, lock_key: str, ttl_seconds: int = 30) -> bool:
        """Acquire a PostgreSQL advisory lock by string key."""
        import hashlib
        pool = await self._ensure_pool()
        lock_id = int(hashlib.sha256(lock_key.encode()).hexdigest()[:8], 16) % (2**31)
        try:
            async with pool.connection(timeout=5.0) as conn:
                async with conn.cursor() as cur:
                    await cur.execute("DELETE FROM operation_locks WHERE expires_at <= NOW()")
                    await cur.execute(
                        "SELECT expires_at FROM operation_locks WHERE lock_key = %s AND expires_at > NOW()",
                        (lock_key,),
                    )
                    if await cur.fetchone():
                        return False

                    await cur.execute("SELECT pg_try_advisory_lock(%s)", (lock_id,))
                    row = await cur.fetchone()
                    got = row[0] if row else False  # plain cursor, row is a tuple
                    if got:
                        await cur.execute(
                            "INSERT INTO operation_locks (lock_key, owner_id, acquired_at, expires_at) "
                            "VALUES (%s, %s, NOW(), NOW() + (%s || ' seconds')::INTERVAL) "
                            "ON CONFLICT (lock_key) DO UPDATE SET expires_at = EXCLUDED.expires_at",
                            (lock_key, f"pid:{os.getpid()}", str(ttl_seconds)),
                        )
                        await conn.commit()
                        return True
                    return False
        except Exception as exc:
            logger.error(f"Error acquiring advisory lock '{lock_key}': {exc}")
            return False

    async def release_advisory_lock(self, lock_key: str) -> bool:
        """Release a previously acquired advisory lock."""
        import hashlib
        pool = await self._ensure_pool()
        lock_id = int(hashlib.sha256(lock_key.encode()).hexdigest()[:8], 16) % (2**31)
        try:
            async with pool.connection(timeout=5.0) as conn:
                async with conn.cursor() as cur:
                    await cur.execute("SELECT pg_advisory_unlock(%s)", (lock_id,))
                    await cur.execute("DELETE FROM operation_locks WHERE lock_key = %s", (lock_key,))
                    await conn.commit()
                    return True
        except Exception as exc:
            logger.error(f"Error releasing lock '{lock_key}': {exc}")
            return False


# Compatibility wrapper for DatabaseAdapterExtensions
class DatabaseAdapterExtensions(DatabaseAdapter):
    """Backward compatibility alias for DatabaseAdapter extensions."""
    pass


# Global instance of the adapter
db_adapter = DatabaseAdapter(max_size=2)
