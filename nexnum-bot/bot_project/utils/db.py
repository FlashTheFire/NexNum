import sys
import os
import asyncio
import json
import logging
import uuid
from pathlib import Path
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, Dict, Any, List, Tuple
from psycopg_pool import AsyncConnectionPool
from psycopg.rows import dict_row

# Ensure bot_project root is on sys.path for type checkers and runtime
_utils_dir = Path(__file__).resolve().parent
_bot_project_dir = _utils_dir.parent
if str(_bot_project_dir) not in sys.path:
    sys.path.insert(0, str(_bot_project_dir))

from .config import DATABASE_URL

logger = logging.getLogger("db_adapter")

class DatabaseAdapter:
    """
    Async PostgreSQL Adapter for NexBots targeting NexNum's Supabase schema.
    Uses psycopg 3 with connection pooling.
    """
    def __init__(self, conninfo: str = DATABASE_URL, min_size: int = 2, max_size: int = 20):
        from .config import sanitize_db_url
        self.conninfo = sanitize_db_url(conninfo)
        self.min_size = min_size
        self.max_size = max_size
        self.pool: Optional[AsyncConnectionPool] = None
        self._user_cache: Dict[str, Tuple[str, str]] = {}  # telegram_id -> (user_uuid, wallet_uuid)

    async def init_pool(self) -> bool:
        """Initialize the async connection pool."""
        if self.pool is not None:
            return True
        try:
            self.pool = AsyncConnectionPool(
                conninfo=self.conninfo,
                min_size=self.min_size,
                max_size=self.max_size,
                open=False,
                kwargs={"row_factory": dict_row}
            )
            await self.pool.open()
            logger.info("Successfully initialized PostgreSQL connection pool.")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize PostgreSQL pool: {e}", exc_info=True)
            self.pool = None
            return False

    async def close_pool(self) -> None:
        """Close the async connection pool."""
        if self.pool is not None:
            await self.pool.close()
            self.pool = None
            logger.info("Closed PostgreSQL connection pool.")

    async def _ensure_pool(self) -> AsyncConnectionPool:
        """Helper to ensure pool is initialized and return non-null pool."""
        if self.pool is None:
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
        tg_id_str = str(telegram_id)
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
                        params.append(is_banned)
                    if not updates:
                        return True
                    updates.append("updated_at = NOW()")
                    params.append(tg_id_str)
                    sql = f"UPDATE users SET {', '.join(updates)} WHERE telegram_id = %s"
                    await cur.execute(sql, tuple(params))
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
        """Retrieve user financial metrics (balance, total deposits, total spent, order counts)."""
        tg_id_str = telegram_id
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

                return {
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

    async def consume_account_link(self, code: str, telegram_id: str, name: Optional[str] = None) -> Dict[str, Any]:
        """
        Consumes a short-lived link token (e.g. link_ABC123) and associates the Telegram ID 
        with the logged-in Web App user in PostgreSQL/Supabase.
        """
        tg_id_str = str(telegram_id)
        pool = await self._ensure_pool()

        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "CREATE TABLE IF NOT EXISTS account_links ("
                    "id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "
                    "code VARCHAR(64) UNIQUE NOT NULL, "
                    "user_id UUID REFERENCES users(id) ON DELETE CASCADE, "
                    "expires_at TIMESTAMPTZ NOT NULL, "
                    "created_at TIMESTAMPTZ DEFAULT NOW()"
                    ")"
                )
                
                await cur.execute(
                    "SELECT user_id, expires_at FROM account_links WHERE code = %s AND expires_at > NOW()",
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

                await cur.execute("DELETE FROM account_links WHERE code = %s", (code,))
                await conn.commit()

                self._user_cache.pop(tg_id_str, None)

                return {
                    "success": True,
                    "user_id": web_user_uuid,
                    "name": user_row['name'] if user_row else name,
                    "email": user_row['email'] if user_row else None
                }

# Global database adapter singleton
db_adapter = DatabaseAdapter()


# ────────────────────────────────────────────────────────────────
# Extension: Session, Referral, Deposit, and Lock DAOs
# ────────────────────────────────────────────────────────────────

class DatabaseAdapterExtensions:
    """
    Additional persistence methods that replace Redis-backed operations.
    All methods use the shared pool from the parent DatabaseAdapter instance.
    """

    # ---- User Sessions (replaces user_data:{uid}:profile:main) ----

    async def get_user_session(self, telegram_id: str) -> Dict[str, Any]:
        """Return cached session data for a user (country, service, menu state)."""
        pool = await db_adapter._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT selected_country_id, selected_service_code, menu_state, last_activity "
                    "FROM user_sessions WHERE user_id = %s",
                    (telegram_id,)
                )
                row = await cur.fetchone()
                if row:
                    return {
                        "selected_country_id": row.get("selected_country_id"),
                        "selected_service_code": row.get("selected_service_code"),
                        "menu_state": row.get("menu_state") or "main",
                        "temp_data": row.get("temp_data") or {},
                    }
                return {"menu_state": "main", "temp_data": {}}

    async def save_user_session(self, telegram_id: str, session_data: Dict[str, Any]) -> bool:
        """Persist session data into user_sessions table."""
        pool = await db_adapter._ensure_pool()
        try:
            async with pool.connection() as conn:
                async with conn.cursor(row_factory=dict_row) as cur:
                    await cur.execute(
                        "INSERT INTO user_sessions (user_id, selected_country_id, selected_service_code, "
                        "menu_state, temp_data, updated_at) VALUES (%s, %s, %s, %s, %s, NOW()) "
                        "ON CONFLICT (user_id) DO UPDATE SET "
                        "selected_country_id = EXCLUDED.selected_country_id, "
                        "selected_service_code = EXCLUDED.selected_service_code, "
                        "menu_state = EXCLUDED.menu_state, "
                        "temp_data = EXCLUDED.temp_data, "
                        "updated_at = NOW() "
                        "RETURNING user_id",
                        (
                            telegram_id,
                            session_data.get("selected_country_id"),
                            session_data.get("selected_service_code"),
                            session_data.get("menu_state", "main"),
                            json.dumps(session_data.get("temp_data", {})),
                        ),
                    )
                    await conn.commit()
                    return True
        except Exception as exc:
            logger.error(f"Error saving user session for {telegram_id}: {exc}")
            return False

    # ---- Referrals (replaces user_data:{uid}:referral) ----

    async def get_referral_info(self, telegram_id: str) -> Optional[Dict[str, Any]]:
        """Fetch referral chain info for a user."""
        pool = await db_adapter._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT ur.referrer_id, ur.referral_code, u.telegram_id AS referrer_telegram_id "
                    "FROM user_referrals ur LEFT JOIN users u ON ur.referrer_id = u.id "
                    "WHERE ur.user_id = %s",
                    (telegram_id,)
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
        pool = await db_adapter._ensure_pool()
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "INSERT INTO user_referrals (user_id, referrer_id, referral_code) VALUES (%s, %s, %s) "
                        "ON CONFLICT (user_id) DO UPDATE SET referrer_id = EXCLUDED.referrer_id, referral_code = EXCLUDED.referral_code",
                        (telegram_id, referrer_id, code),
                    )
                    await conn.commit()
                    return True
        except Exception as exc:
            logger.error(f"Error saving referral info for {telegram_id}: {exc}")
            return False

    # ---- Deposits (replaces deposit_data:{did}) ----

    async def create_deposit_request(
        self,
        telegram_id: str,
        amount: float,
        gateway: str,
        idempotency_key: str,
        currency: str = "USD",
    ) -> str:
        """Create a pending deposit request and return its UUID."""
        pool = await db_adapter._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                deposit_uuid = str(uuid.uuid4())
                await cur.execute(
                    "INSERT INTO deposit_requests (id, user_id, amount, currency, gateway, idempotency_key, status) "
                    "VALUES (%s, %s, %s, %s, %s, %s, 'PENDING') "
                    "RETURNING id",
                    (deposit_uuid, telegram_id, Decimal(str(amount)), currency, gateway, idempotency_key),
                )
                res = await cur.fetchone()
                await conn.commit()
                return str(res["id"])

    async def update_deposit_status(
        self,
        deposit_id: str,
        status: str,
        code: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Update deposit status (COMPLETED / FAILED / CANCELLED)."""
        pool = await db_adapter._ensure_pool()
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    updates = ["status = %s", "updated_at = NOW()"]
                    params: list[Any] = [status]
                    idx = 1
                    if code is not None:
                        updates.append(f"code = %s")
                        params.append(code)
                        idx += 1
                    if metadata is not None:
                        updates.append(f"metadata = %s")
                        params.append(json.dumps(metadata))
                        idx += 1
                    params.append(deposit_id)
                    sql = f"UPDATE deposit_requests SET {', '.join(updates)} WHERE id = %s"
                    await cur.execute(sql, tuple(params))
                    await conn.commit()
                    return True
        except Exception as exc:
            logger.error(f"Error updating deposit {deposit_id}: {exc}")
            return False

    async def get_deposit_request(self, deposit_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a single deposit request by ID."""
        pool = await db_adapter._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT dr.*, u.telegram_id FROM deposit_requests dr "
                    "LEFT JOIN users u ON dr.user_id = u.id WHERE dr.id = %s",
                    (deposit_id,),
                )
                row = await cur.fetchone()
                if not row:
                    return None
                return {
                    "id": str(row["id"]),
                    "user_id": str(row["user_id"]),
                    "amount": float(row["amount"]),
                    "gateway": row["gateway"],
                    "code": row.get("code"),
                    "status": row["status"],
                    "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
                }

    # ---- Activation Orders (replaces order_info:{oid} in Redis) ----

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
        """Create a purchase order with all tracking fields and return its ID."""
        pool = await db_adapter._ensure_pool()
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
                        telegram_id,
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
                return str(res["id"])

    async def update_activation_sms(
        self,
        order_id: str,
        sms_code: Optional[str] = None,
        status: Optional[str] = None,
        raw_response: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Update SMS code, status, or raw response for an order."""
        pool = await db_adapter._ensure_pool()
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
                    sql = f"UPDATE purchase_orders SET {', '.join(sets)} WHERE id = %s RETURNING id"
                    await cur.execute(sql, tuple(vals))
                    await conn.commit()
                    return True
        except Exception as exc:
            logger.error(f"Error updating activation SMS for order {order_id}: {exc}")
            return False

    async def get_activation_order(self, order_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single order by ID (used by order_tracker)."""
        pool = await db_adapter._ensure_pool()
        async with pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(
                    "SELECT po.*, u.telegram_id FROM purchase_orders po "
                    "LEFT JOIN users u ON po.user_id = u.id WHERE po.id = %s",
                    (order_id,),
                )
                row = await cur.fetchone()
                if not row:
                    return None
                return {
                    "id": str(row["id"]),
                    "user_id": str(row["user_id"]),
                    "telegram_id": str(row.get("telegram_id")),
                    "service_name": row["service_name"],
                    "country_name": row["country_name"],
                    "amount": float(row["amount"]),
                    "status": row["status"],
                    "provider": row.get("provider"),
                    "activation_id": row.get("activation_id"),
                    "phone_number": row.get("phone_number"),
                    "sms_code": row.get("sms_code"),
                    "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
                    "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
                    "expires_at": row["expires_at"].isoformat() if row.get("expires_at") else None,
                    "retry_count": row.get("retry_count", 0),
                }

    async def fetch_pending_orders_batch(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Fetch orders still awaiting SMS (used by order_tracker background loop)."""
        pool = await db_adapter._ensure_pool()
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
                        "user_id": str(r["user_id"]),
                        "telegram_id": str(r.get("telegram_id")),
                        "service_name": r["service_name"],
                        "country_name": r["country_name"],
                        "amount": float(r["amount"]),
                        "status": r["status"],
                        "provider": r.get("provider"),
                        "activation_id": r.get("activation_id"),
                        "phone_number": r.get("phone_number"),
                        "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
                        "expires_at": r["expires_at"].isoformat() if r.get("expires_at") else None,
                    }
                    for r in rows
                ]

    # ---- Advisory Locks (replaces Redis SET NX EX locks) ----

    async def acquire_advisory_lock(self, lock_key: str, ttl_seconds: int = 30) -> bool:
        """Acquire a PostgreSQL advisory lock by string key."""
        import hashlib
        pool = await db_adapter._ensure_pool()
        lock_id = int(hashlib.sha256(lock_key.encode()).hexdigest()[:8], 16) % (2**31)
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    # Try non-blocking lock
                    await cur.execute("SELECT pg_try_advisory_xact_lock(%s)", (lock_id,))
                    got = (await cur.fetchone())[0]
                    if got:
                        # Also persist for admin visibility
                        expires_at = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
                        await cur.execute(
                            "INSERT INTO operation_locks (lock_key, owner_id, acquired_at, expires_at) "
                            "VALUES (%s, %s, NOW(), %s) ON CONFLICT (lock_key) DO NOTHING",
                            (lock_key, f"pid:{os.getpid()}", expires_at),
                        )
                        await conn.commit()
                        return True
                    return False
        except Exception as exc:
            logger.error(f"Error acquiring advisory lock '{lock_key}': {exc}")
            return False

    async def release_advisory_lock(self, lock_key: str) -> bool:
        """Release a previously acquired advisory lock."""
        pool = await db_adapter._ensure_pool()
        try:
            async with pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute("DELETE FROM operation_locks WHERE lock_key = %s AND expires_at > NOW()", (lock_key,))
                    await conn.commit()
                    return True
        except Exception as exc:
            logger.error(f"Error releasing lock '{lock_key}': {exc}")
            return False

