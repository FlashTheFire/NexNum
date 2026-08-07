import sys
import os
from pathlib import Path
_bot_project_dir = Path(__file__).resolve().parent
while _bot_project_dir.name != "bot_project" and _bot_project_dir.parent != _bot_project_dir:
    _bot_project_dir = _bot_project_dir.parent
if str(_bot_project_dir) not in sys.path:
    sys.path.insert(0, str(_bot_project_dir))
from utils.db import db_adapter
import asyncio
import json
import logging
import time
import uuid
import hashlib
import random
from datetime import datetime
from functools import wraps
from io import BytesIO
from termcolor import colored
import os
import re

import asyncio
import json
import logging
import time
from pathlib import Path
from utils.cache_manager import CacheManager, CachePrefix, cache_manager
from functools import wraps
from datetime import datetime, timedelta
from typing import Optional, Tuple, Dict

import aiohttp
import aiofiles
import redis.asyncio as redis

from utils.redis_manager import redis_manager
import json
import logging
import cloudinary
import cloudinary.uploader
from typing import Tuple, Dict
from redis.asyncio import Redis
import aiohttp
from PIL import Image
import numpy as np

from telebot.async_telebot import AsyncTeleBot
from telebot.types import Message, InlineKeyboardMarkup, InlineKeyboardButton

from typing import Union, Optional, Dict, Any, List, Tuple

from redis import WatchError
from redis.asyncio import Redis
from pydantic import BaseModel, ValidationError

from redis.commands.search.field import TextField, NumericField, TagField
from redis.commands.search.index_definition import IndexDefinition, IndexType
from redis.commands.search.query import Query
from redis.exceptions import RedisError
from datetime import datetime, timedelta

from forex_python.converter import CurrencyRates

from utils.config import (
    INLINE_CACHE_PREFIX, CACHE_DURATION,
    CACHE_RESULTS_PER_PAGE, CACHE_EXPIRY,
    APP_COUNT, BOT_TOKEN, CHANNEL_ID,
    COMMISSION
)
from utils.functions import small_caps, decode_barcode_id, encode_order_id, AdvancedLogger, convert_usd_to_rub, convert_rub_to_usd
from utils.redis_manager import RedisManager, redis_manager
from utils.redis_keys import RedisKeys
from handlers.manager.operation_lock import  OperationType, AsyncOperationContext, operation_lock_manager

NEXNUM_TAX = COMMISSION

# ---------------- Global Constants ----------------
ORDER_INFO_INDEX = "order_index"
USER_INFO_INDEX = "user_index"
ORDER_INFO_PREFIX = "order_data:"
USER_INFO_PREFIX = "user_data:"
DEPOSIT_INFO_INDEX = "deposit_index"
DEPOSIT_INFO_PREFIX = "deposit_data:"
user_key_profile = "user_data:{user_id}:profile:main"

ORDER_PREFIX = "987654321"

# Module-level logger for utility functions that do not carry self.logger
logger = logging.getLogger(__name__)

# ---------------- Asynchronous Logging ----------------
class AsyncHandler(logging.Handler):
    def emit(self, record):
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        msg = self.format(record)
        loop.run_in_executor(None, print, msg)

_advanced_logger: Optional[AdvancedLogger] = None

async def get_async_logger(enable_logging: bool = True) -> AdvancedLogger:
    """Get or create an AdvancedLogger instance with colored formatting."""
    global _advanced_logger
    if _advanced_logger is None:
        _advanced_logger = AdvancedLogger(where_logger="operation.py")
    return _advanced_logger

# ---------------- Exception Decorator ----------------
def handle_redis_exceptions(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        self_obj = args[0]  # assume first arg is 'self'
        try:
            return await func(*args, **kwargs)
        except RedisError as e:
            if not self_obj.logger:
                self_obj.logger = await get_async_logger()
            await self_obj.logger.error(f"Redis operation error in {func.__name__}: {e}")
            return {'response': False, 'error': str(e)}
        except Exception as e:
            if not self_obj.logger:
                self_obj.logger = await get_async_logger()
            await self_obj.logger.error(f"Error in {func.__name__}: {e}")
            return {'response': False, 'error': str(e)}
    return wrapper

# ---------------- Data Serialization Utilities ----------------
async def serialize_data(data: Any) -> str:
    return await asyncio.get_running_loop().run_in_executor(None, json.dumps, data)
async def deserialize_data(data: Optional[str]) -> Optional[Dict]:
    if not data:
        return None
    try:
        return await asyncio.get_running_loop().run_in_executor(None, json.loads, data)
    except json.JSONDecodeError:
        logger = await get_async_logger()
        await logger.error("Error deserializing data")
        return None

# ---------------- OrderManagement Class ----------------
class OrderManagement:
    """Manage order operations with PostgreSQL asynchronously."""
    
    def __init__(self, redis_manager: Optional[RedisManager] = None, enable_logging: bool = True):
        self.redis_manager = redis_manager
        self.redis_keys = None
        self._initialized = False

        self.logger: Optional[AdvancedLogger] = None
        self.enable_logging = enable_logging
        self.CANDIDATES_KEY = "free_numbers:list"
        self.FIELD_MAP = {
            "PRICE": "order_amount",
            "DATE":  "recorded_at"
        }

    async def _init_logger(self):
        if not self.logger:
            self.logger = await get_async_logger(self.enable_logging)

    async def ensure_initialized(self):
        """Ensure keys/loggers are initialized asynchronously."""
        if not self._initialized:
            self.redis_keys = RedisKeys()
            self._initialized = True

    async def build_query(self, filters: dict) -> str:
        """Build a structured query string from a dictionary of filters."""
        query_parts = []
        for field, value in filters.items():
            if value is None:
                continue
            if isinstance(value, (list, tuple)):
                if isinstance(value, list) and value:
                    options = ' | '.join(map(str, value))
                    query_parts.append(f"@{field}:({options})")
                elif isinstance(value, tuple) and len(value) == 2:
                    start, end = value
                    query_parts.append(f"@{field}:[{start} {end}]")
            else:
                query_parts.append(f"@{field}:{value}")
        return ' '.join(query_parts) if query_parts else '*'
    
    async def extract_order_number(self, order_id: str) -> str:
        """
        Extracts the numeric part of the order_id string
        """
        match = re.search(r'\d+', order_id)
        return match.group() if match else ""

    @handle_redis_exceptions
    async def ensure_connection(self):
        """Ensure Redis connection is established asynchronously if Redis is configured."""
        await self.ensure_initialized()
        if self.redis_manager:
            return await self.redis_manager.get_client()
        return None

    @handle_redis_exceptions
    async def _init_search_indexes(self):
        """Initialize Redis search indexes for orders if Redis is available."""
        await self._init_logger()
        if not self.redis_manager:
            return
        redis_client = await self.ensure_connection()
        if not redis_client:
            return
        try:
            try:
                await redis_client.ft(ORDER_INFO_INDEX).dropindex()
            except RedisError:
                pass

            schema = (
                TextField("order_id", sortable=True),
                TextField("message_id", sortable=True),
                TextField("user_id", sortable=True),
                TextField("server_id", sortable=True),
                TextField("country_id", sortable=True),
                TextField("country_code", sortable=True),
                TextField("app_id", sortable=True),
                TextField("app_name", weight=5.0),
                NumericField("order_amount", sortable=True),
                TextField("order_number"),
                TextField("order_status"),
                TextField("refund_status"),
                TextField("sms_list"),
                TextField("order_history"),
                TextField("search_tags", weight=1.0),
                NumericField("recorded_at", sortable=True)
            )

            await redis_client.ft(ORDER_INFO_INDEX).create_index(
                schema,
                definition=IndexDefinition(
                    prefix=[ORDER_INFO_PREFIX],
                    language="english"
                )
            )

            await self.logger.info("OrderManagement indexes created successfully")
        except Exception as e:
            await self.logger.error(f"Error creating search indexes: {e}")

    @handle_redis_exceptions
    async def create_order_id(self, user_id: str) -> dict:
        """Generate unique order ID asynchronously."""
        try:
            if self.redis_manager:
                redis_client = await self.ensure_connection()
                if redis_client:
                    base_order_id = await redis_client.incr("main_data:order_id")
                else:
                    base_order_id = random.randint(100000, 999999)
            else:
                base_order_id = random.randint(100000, 999999)
        except Exception:
            base_order_id = random.randint(100000, 999999)
        timestamp = int(time.time())
        combined = f"{user_id}-{base_order_id}-{timestamp}"
        order_id = int(hashlib.sha256(combined.encode()).hexdigest(), 16) % (10**16)
        return {'response': True, 'result': order_id} if order_id else {'response': False, 'error': 'Failed to generate order ID'}

    @handle_redis_exceptions
    async def add_order_data(self, order_id: str, user_id: str, data: dict) -> dict:
        """Add new order in PostgreSQL and optional search index in Redis."""
        await self._init_logger()
        amount = float(data.get('order_amount', 0.0) or data.get('app_price', 0.0) or 0.0)
        service_name = str(data.get('app_name', 'N/A'))
        country_name = str(data.get('country_name', data.get('country_code', 'N/A')))
        status = str(data.get('order_status', 'PENDING'))
        provider = str(data.get('server_id', '1'))
        phone_number = str(data.get('number', data.get('phone_number', '')))

        try:
            await db_adapter.create_activation_order(
                telegram_id=str(user_id),
                service_name=service_name,
                country_name=country_name,
                amount=amount,
                activation_id=str(order_id),
                phone_number=phone_number,
                provider=provider,
            )
        except Exception as e:
            await self.logger.error(f"Failed to persist purchase order {order_id} to PostgreSQL: {e}")
            return {'response': False, 'error': str(e)}

        if self.redis_manager:
            try:
                redis_client = await self.ensure_connection()
                if redis_client:
                    order_info_key = f"{ORDER_INFO_PREFIX}info:{order_id}"
                    current_time = time.time()
                    data.setdefault('recorded_at', current_time)
                    data['search_tags'] = " ".join(filter(None, [
                        service_name, status, country_name, str(provider), str(order_id), str(user_id)
                    ]))
                    mapping_data = {k: str(v) for k, v in data.items() if v is not None}
                    await redis_client.hset(order_info_key, mapping=mapping_data)
            except Exception as e:
                await self.logger.warning(f"Optional Redis cache write for order {order_id} failed: {e}")

        return {'response': True, 'message': "ORDER-ADDED", 'order_id': order_id}

    @handle_redis_exceptions
    async def get_order_data(self, order_id: str) -> dict:
        """Get order details from PostgreSQL."""
        await self._init_logger()
        try:
            po = await db_adapter.get_activation_order(str(order_id))
            if po:
                return {'response': True, 'result': po}
        except Exception as e:
            await self.logger.warning(f"Error fetching order {order_id} from PostgreSQL: {e}")

        if self.redis_manager:
            try:
                redis_client = await self.ensure_connection()
                if redis_client:
                    key = f"{ORDER_INFO_PREFIX}info:{order_id}"
                    order_data = await redis_client.hgetall(key)
                    if order_data:
                        order_data['id'] = key
                        return {'response': True, 'result': order_data}
            except Exception:
                pass
        return {'response': False, 'error': 'ORDER-NOT-FOUND'}

    @handle_redis_exceptions
    async def update_order_status(self, order_id: str, status: str) -> dict:
        """Update order status in PostgreSQL and Redis."""
        await self._init_logger()
        valid_statuses = {'PENDING', 'COMPLETED', 'CANCELLED', 'FAILED', 'TIMEOUT', 'PROCESSING'}
        if status not in valid_statuses:
            return {'response': False, 'error': 'Invalid status'}

        try:
            await db_adapter.update_purchase_order_status(str(order_id), status)
        except Exception as e:
            await self.logger.warning(f"Failed to update purchase order status for {order_id} in PostgreSQL: {e}")

        if self.redis_manager:
            try:
                redis_client = await self.ensure_connection()
                if redis_client:
                    order_info_key = f"{ORDER_INFO_PREFIX}info:{order_id}"
                    await redis_client.hset(order_info_key, 'order_status', status)
            except Exception:
                pass

        return {'response': True, 'message': f'Order status updated to {status}'}

    @handle_redis_exceptions
    async def update_order_fields(self, order_id: str, fields: dict) -> dict:
        """Update specific fields of an order in PostgreSQL and Redis."""
        await self._init_logger()
        sms_code = fields.get('last_sms') or fields.get('sms_code')
        status = fields.get('order_status') or fields.get('status')
        try:
            await db_adapter.update_activation_sms(str(order_id), sms_code=sms_code, status=status, raw_response=fields)
        except Exception as e:
            await self.logger.warning(f"Failed to update order fields for {order_id} in PostgreSQL: {e}")

        if self.redis_manager:
            try:
                redis_client = await self.ensure_connection()
                if redis_client:
                    order_info_key = f"{ORDER_INFO_PREFIX}info:{order_id}"
                    await redis_client.hset(order_info_key, mapping={k: str(v) for k, v in fields.items()})
            except Exception:
                pass
        return {'response': True, 'message': 'Order fields updated successfully'}

    @handle_redis_exceptions
    async def update_order_success(self, order_id: str, sms: str, timeout: float, order_status: str, refund_status: str) -> dict:
        """Update success of an order in PostgreSQL."""
        await self._init_logger()
        try:
            await db_adapter.update_activation_sms(
                str(order_id),
                sms_code=sms,
                status=order_status,
                raw_response={"timeout": timeout, "refund_status": refund_status}
            )
        except Exception as e:
            await self.logger.warning(f"Failed to update order success for {order_id} in PostgreSQL: {e}")

        if self.redis_manager:
            try:
                redis_client = await self.ensure_connection()
                if redis_client:
                    order_info_key = f"{ORDER_INFO_PREFIX}info:{order_id}"
                    await redis_client.hset(order_info_key, mapping={
                        'last_sms': sms,
                        'refund_status': refund_status,
                        'order_status': order_status,
                        'timeout': str(timeout)
                    })
            except Exception:
                pass
        return {'response': True, 'message': 'Order updated successfully'}

    @handle_redis_exceptions
    async def cancel_order(self, order_id: str, user_id: str, status: str = 'CANCELLED') -> dict:
        """Cancel an order and process refund in PostgreSQL."""
        await self._init_logger()
        try:
            order_res = await self.get_order_data(order_id)
            if not order_res.get('response'):
                return {'response': False, 'error': 'Order not found'}
            
            await db_adapter.update_purchase_order_status(str(order_id), status)
            return {'response': True, 'message': f'Order {status} and refunded successfully'}
        except Exception as e:
            await self.logger.error(f"Error cancelling order {order_id}: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def search_orders_advanced(self, filters: dict, sort_by: str = None, sort_asc: bool = True, offset: int = 0, limit: int = 10) -> dict:
        """Search orders with advanced filtering using PostgreSQL."""
        await self._init_logger()
        try:
            user_id = filters.get("user_id")
            status = filters.get("order_status")
            recorded_at = filters.get("recorded_at")
            res = await db_adapter.search_purchase_orders(telegram_id=user_id, status=status, recorded_at=recorded_at, limit=limit, offset=offset)
            return {'response': True, 'total_orders': res.get('total', 0), 'results': res.get('results', [])}
        except Exception as e:
            await self.logger.error(f"Error searching orders: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def search_current_orders(self, query_str: str = "*", sort_by: str = None, sort_asc: bool = True, limit: int = 10, offset: int = 0) -> dict:
        """Search current orders using PostgreSQL."""
        await self._init_logger()
        try:
            res = await db_adapter.search_purchase_orders(status="PENDING", limit=limit, offset=offset)
            return {'response': True, 'total': res.get('total', 0), 'results': res.get('results', [])}
        except Exception as e:
            await self.logger.error(f"Error searching current orders: {e}")
            return {'response': False, 'error': str(e)}
        
        results = await redis_client.ft(ORDER_INFO_INDEX).search(query)
        orders = await asyncio.gather(*[self.process_doc(doc) for doc in results.docs])
        return {'response': True, 'total': results.total, 'results': orders}

    async def process_doc(self, doc) -> dict:
        """Process individual document from search results."""
        return {k: v for k, v in doc.__dict__.items() if not k.startswith('__')}

    async def aggregate_orders(
        self,
        filters: Dict[str, Any],
        limit: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Aggregates order metrics using PostgreSQL (with fallback to RediSearch if active).
        """
        return_ids = filters.pop("_return_ids", False)
        sort_specs = filters.pop("sort", [])

        try:
            user_id = filters.get("user_id") or filters.get("user_number")
            status = filters.get("status") or filters.get("order_status")
            
            sql = "SELECT COUNT(*) as count, COALESCE(SUM(amount), 0.0) as total_amount FROM purchase_orders WHERE 1=1"
            params: list[Any] = []
            if user_id:
                sql += " AND (user_id = %s OR user_id IN (SELECT id FROM users WHERE telegram_id = %s))"
                params.extend([str(user_id), str(user_id)])
            if status:
                sql += " AND status = %s"
                params.append(str(status))
                
            pool = await db_adapter._ensure_pool()
            async with pool.connection() as conn:
                async with conn.cursor(row_factory=dict_row) as cur:
                    await cur.execute(sql, tuple(params))
                    res = await cur.fetchone()
                    
            output = {
                "total_amount": float(res["total_amount"]) if res else 0.0,
                "count": int(res["count"]) if res else 0
            }
            if return_ids:
                output["order_ids"] = []
            return output
        except Exception as e:
            logger.error("aggregate_orders: %s", e, exc_info=True)
            return {
                "total_amount": 0.0,
                "count": 0,
                "order_ids": [] if return_ids else None,
            }

    async def manage_number_order(self,
        redis_client: Redis = None,
        country_id: int = None,
        server_id: int = None,
        app_id: str = None,
        operator: str = None,
        order_id: Optional[str] = None,
        action: str = "reserve",   # reserve | add | status | cancel
        user_id: Optional[int] = None,
        sms_code: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Manages virtual number orders across PostgreSQL (purchase_orders) with optional Redis cache.
        """
        active_redis = redis_client or (self.redis_manager.redis_client if self.redis_manager else None)
        numbers_key = f"free_numbers:{country_id}:{server_id}:{app_id}:{operator}"
        logger.debug("manage_number_order key: %s, action: %s", numbers_key, action)

        async def get_data(num: str) -> Dict[str, Any]:
            if active_redis:
                try:
                    raw = await active_redis.hget(numbers_key, num)
                    if raw:
                        return json.loads(raw)
                except Exception:
                    pass
            ord_res = await db_adapter.get_activation_order(f"{ORDER_PREFIX}{num}")
            if ord_res:
                return {
                    "order_id": ord_res["activation_id"],
                    "sms_received": bool(ord_res.get("sms_code")),
                    "sms_waiting": f"STATUS_OK:{ord_res['sms_code']}" if ord_res.get("sms_code") else "STATUS_WAIT_CODE",
                    "reserved_at": ord_res.get("created_at") or "",
                    "user_ids": [user_id] if user_id else []
                }
            return {}

        async def set_data(num: str, data: Dict[str, Any]):
            if active_redis:
                try:
                    await active_redis.hset(numbers_key, num, json.dumps(data))
                except Exception:
                    pass

        # ────────────── RESERVE ──────────────
        if action == "reserve":
            now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

            num = None
            if active_redis:
                try:
                    for _ in range(100):
                        candidate_num = await active_redis.hrandfield(numbers_key)
                        if candidate_num:
                            if isinstance(candidate_num, bytes):
                                candidate_num = candidate_num.decode()
                            data = await get_data(candidate_num)
                            if data.get("sms_received"):
                                continue
                            if user_id and int(user_id) in data.get("user_ids", []):
                                continue
                            num = candidate_num
                            break
                except Exception:
                    pass

            if not num:
                num = f"987654321{random.randint(1000, 9999)}"

            new_order = order_id or f"{ORDER_PREFIX}{num}"
            logger.info("manage_number_order: reserved %s → %s", num, new_order)
            data = await get_data(num)
            data.update({
                "order_id": new_order,
                "sms_received": True,
                "sms_waiting": "STATUS_WAIT_CODE",
                "reserved_at": now_iso,
                "user_ids": data.get("user_ids", []) + ([user_id] if user_id else [])
            })

            if user_id:
                await db_adapter.create_activation_order(
                    telegram_id=str(user_id),
                    service_name=app_id or "free",
                    country_name=str(country_id or 1),
                    amount=0.0,
                    activation_id=new_order,
                    phone_number=num,
                    provider=operator or "free"
                )

            await self.add_candidates(num)
            await set_data(num, data)

            return {
                "status": True,
                "number": num,
                "order_id": new_order,
                "details": data
            }

        # Reconstruct number from order_id for add/status/cancel
        if not order_id or not order_id.startswith(ORDER_PREFIX):
            return {"status": False, "message": "INVALID_ORDER_ID"}

        num = order_id[len(ORDER_PREFIX):]
        data = await get_data(num)

        # ────────────── ADD SMS CODE ──────────────
        if action == "add":
            if not sms_code:
                return {"status": False, "message": "NO_SMS_CODE"}

            data["sms_waiting"] = f"STATUS_OK:{sms_code}"
            await set_data(num, data)
            await db_adapter.update_activation_sms(order_id, sms_code=sms_code, status="COMPLETED")

            return {
                "status": True,
                "number": num,
                "order_id": order_id,
                "sms_waiting": data["sms_waiting"]
            }

        # ────────────── STATUS ──────────────
        if action == "status":
            sms_waiting = data.get("sms_waiting", "STATUS_WAIT_CODE")
            ord_res = await db_adapter.get_activation_order(order_id)
            if ord_res and ord_res.get("sms_code"):
                sms_waiting = f"STATUS_OK:{ord_res['sms_code']}"

            return {
                "status": True,
                "order_id": order_id,
                "number": num,
                "sms_waiting": sms_waiting
            }

        # ────────────── CANCEL ──────────────
        if action == "cancel":
            data.update({
                "order_id": "",
                "sms_received": False,
                "sms_waiting": "",
                "reserved_at": "",
                "user_ids": []
            })
            await set_data(num, data)
            await db_adapter.update_activation_sms(order_id, status="CANCELLED")

            return {
                "status": True,
                "message": "Number canceled successfully",
                "number": num
            }

        return {"status": False, "message": "INVALID_ACTION"}

    async def get_candidates(self) -> List[str]:
        """
        Fetches list of candidate numbers from Redis or PostgreSQL.
        """
        if self.redis_manager and self.redis_manager.redis_client:
            try:
                raw = await self.redis_manager.redis_client.get(self.CANDIDATES_KEY)
                if raw:
                    if isinstance(raw, (bytes, bytearray)):
                        raw = raw.decode("utf-8", errors="ignore")
                    data = json.loads(raw)
                    if isinstance(data, list):
                        return [str(item) for item in data]
            except Exception:
                pass
        
        try:
            orders = await db_adapter.fetch_pending_orders_batch(limit=100)
            return [o["phone_number"] for o in orders if o.get("phone_number")]
        except Exception:
            return []

    async def add_candidates(self, new: Union[str, List[str]]) -> None:
        """
        Adds candidate numbers to candidate list.
        """
        if isinstance(new, str):
            to_add = [new]
        else:
            to_add = [str(x) for x in new]

        current = await self.get_candidates()
        updated = current[:]
        for num in to_add:
            if num not in updated:
                updated.append(num)

        if self.redis_manager and self.redis_manager.redis_client:
            try:
                await self.redis_manager.redis_client.set(
                    self.CANDIDATES_KEY,
                    json.dumps(updated)
                )
            except Exception:
                pass

class UserManagement:
    """Manage user operations with Redis asynchronously."""
    
    def __init__(self, redis_manager: RedisManager, bot_token: Optional[str] = None, channel_id: Optional[str] = None, enable_logging: bool = True):
        self.redis_manager = redis_manager
        self.redis_keys = None
        self._initialized = False
        self.bot_token = bot_token
        self.channel_id = channel_id
        self.logger: Optional[AdvancedLogger] = None
        self.enable_logging = enable_logging
        self.lock_manager = operation_lock_manager

    async def ensure_connection(self):
        """Ensure Redis connection is established asynchronously."""
        await self.ensure_initialized()
        return await self.redis_manager.get_client()

    async def _init_logger(self):
        if not self.logger:
            self.logger = await get_async_logger(self.enable_logging)

    async def ensure_initialized(self):
        """Ensure Redis keys are initialized asynchronously."""
        if not self._initialized:
            self.redis_keys = RedisKeys()
            self._initialized = True

    async def _send_telegram_request(self, method: str, payload: dict) -> Optional[dict]:
        url = f'https://api.telegram.org/bot{self.bot_token}/{method}'
        headers = {'Content-Type': 'application/json'}
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as response:
                if response.status == 200:
                    return await response.json()
        return None

    async def get_random_safe_emoji_id(self):
        url = f"https://api.telegram.org/bot{self.bot_token}/getForumTopicIconStickers"
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status != 200:
                    return None
                data = await response.json()

        if not data.get("ok"):
            return None

        restricted_emojis = ["🍆", "🍑", "🔞", "🥃", "🍺", "🍷", "🍸", "🚬"]
        safe_stickers = [sticker for sticker in data.get("result", [])
                         if sticker.get("emoji") not in restricted_emojis]
        
        return random.choice(safe_stickers).get("custom_emoji_id") if safe_stickers else None

    async def user_metrics_report(self, bot: AsyncTeleBot, method: str, user_id: str, channel_id: str, forum_id: Optional[str] = None) -> Optional[int]:
        await self._init_logger()
        try:
            data = await financial_mgr.get_user(user_id)
            if not data or not data.get('response'):
                await self.logger.error("User data response indicated failure.")
                return None

            if forum_id is None:
                session = await db_adapter.get_user_session(user_id) or {}
                forum_id = session.get("forum_id")
                if not forum_id and self.redis_manager:
                    try:
                        profile_key = f"user_data:{user_id}:profile:main"
                        forum_id = await self.redis_manager.redis_client.hget(profile_key, "forum_id")
                    except Exception:
                        pass

            username = data['user_profile'][:15]
            metrics = data['metrics']
            balance = metrics['current_balance']
            total_spend = metrics['spend_balance']
            total_deposited = metrics['deposits']['total_amount']
            deposit_count = metrics['deposits']['count']
            total_orders = metrics['orders']['count']
            total_order_value = metrics['orders']['total_amount']
            message = (
                f" 👤 <b>Usᴇʀ:</b> <code>{username}</code> <b>||</b> <code>{user_id}</code>\n\n"
                "<b>╭─────────────────────╮</b>\n"
                "<code>│</code><b>     📊 Usᴇʀ Mᴇᴛʀɪᴄs Rᴇᴘᴏʀᴛ         </b><code>│</code>\n"
                "<b>╰─────────────────────╯</b>\n\n"
                "<b>╭─────────────────────╮</b>\n"
                "<b>│ 💰 Bᴀʟᴀɴᴄᴇ Sᴜᴍᴍᴀʀʏ!                 │</b>\n"
                "<b>├─────────────────────┤</b>\n"
                f"<b>│ 💵 Bᴀʟᴀɴᴄᴇ:</b> <code>{balance:.2f}</code> Pᴏɪɴᴛ{'s' if balance != 1 else ''}\n"
                f"<b>│ 💸 Tᴏᴛᴀʟ Sᴘᴇɴᴅ:</b> <code>{total_spend:.2f}</code> Pᴏɪɴᴛ{'s' if total_spend != 1 else ''}\n"
                "<b>╰─────────────────────╯</b>\n\n"
                "<b>╭─────────────────────╮</b>\n"
                "<b>│ 📥 Dᴇᴘᴏsɪᴛ Sᴜᴍᴍᴀʀʏ!                  │</b>\n"
                "<b>├─────────────────────┤</b>\n"
                f"<b>│ 💰 Tᴏᴛᴀʟ Dᴇᴘᴏsɪᴛᴇᴅ:</b> <code>{total_deposited:.2f}</code> 💎\n"
                f"<b>│ 🔄 Dᴇᴘᴏsɪᴛ Cᴏᴜɴᴛ:</b> <code>{deposit_count}</code> Tɪᴍᴇ{'s' if deposit_count != 1 else ''}\n"
                "<b>╰─────────────────────╯</b>\n\n"
                "<b>╭─────────────────────╮</b>\n"
                "<b>│ 🛒 Oʀᴅᴇʀ Sᴜᴍᴍᴀʀʏ!                     │</b>\n"
                "<b>├─────────────────────┤</b>\n"
                f"<b>│ 🛍 Tᴏᴛᴀʟ Oʀᴅᴇʀs:</b> <code>{total_orders}</code> Oʀᴅᴇʀ{'s' if total_orders != 1 else ''}\n"
                f"<b>│ 🏷 Tᴏᴛᴀʟ Oʀᴅᴇʀ :</b> <code>{total_order_value:.2f}</code> Pᴏɪɴᴛ{'s' if total_order_value != 1 else ''}\n"
                "<b>╰─────────────────────╯</b>\n\n"
                f" ✅ <code>{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</code>"
            )
            admin_keyboard = InlineKeyboardMarkup([
                [
                    InlineKeyboardButton('↻ Rᴇғʀᴇsʜ', callback_data=f'#RᴇғʀᴇsʜMᴇᴛʀɪᴄs:{user_id}'),
                    InlineKeyboardButton('🔗 Usᴇʀ', url=f'tg://openmessage?user_id={user_id}')
                ]
            ])
            
            try:
                if method == 'edit_message_text':
                    session = await db_adapter.get_user_session(user_id) or {}
                    forum_message_id = session.get("forum_message_id")
                    if forum_message_id is None and self.redis_manager:
                        try:
                            profile_key = f"user_data:{user_id}:profile:main"
                            forum_message_id = await self.redis_manager.redis_client.hget(profile_key, "forum_message_id")
                        except Exception:
                            pass
                    if forum_message_id is None:
                        await self.logger.error("Forum message ID is None.")
                        return None
                    result = await bot.edit_message_text(
                        chat_id=channel_id,
                        message_id=int(forum_message_id),
                        text=message,
                        reply_markup=admin_keyboard,                
                        parse_mode='HTML'
                    )
                else:
                    result = await bot.send_message(
                        chat_id=channel_id,
                        text=message,
                        reply_markup=admin_keyboard,           
                        message_thread_id=forum_id,
                        parse_mode='HTML'
                    )
                    if result:
                        try:
                            await bot.pin_chat_message(
                                chat_id=channel_id,
                                message_id=result.message_id,
                                disable_notification=True
                            )
                        except Exception as e:
                            print(f"Error pinning message: {str(e)}")
                        await db_adapter.save_user_session(user_id, {"forum_message_id": result.message_id})
                return result.message_id if result else None
            except Exception as e:
                print(f"Error in user_metrics_report: {str(e)}")
                return None
        except Exception as e:
            print(f"Error in user_metrics_report: {str(e)}")
            return None

    async def send_order_report(self, bot: AsyncTeleBot, method: str, order_id: str, user_id: str, channel_id: str, details: dict, is_api: bool = False) -> Optional[int]:
        await self._init_logger()
        try:
            await self.logger.info(f"Sending order report for order_id: {order_id}, user_id: {user_id}")
            
            session = await db_adapter.get_user_session(user_id) or {}
            forum_id = session.get("forum_id")
            if not forum_id and self.redis_manager:
                try:
                    profile_key = f"user_data:{user_id}:profile:main"
                    forum_id = await self.redis_manager.redis_client.hget(profile_key, "forum_id")
                except Exception:
                    pass
            await self.logger.info(f"Retrieved forum_id: {forum_id}")

            message = "<b>#Usᴇʀ_Oʀᴅᴇʀ_Dᴇᴛᴀɪʟs ❯</b>\n\n<b>Tʀᴀɴsᴀᴄᴛɪᴏɴ Dᴇᴛᴀɪʟs »</b>\n" if int(details.get('msg_id')) != int("0") else "<b>#Aᴘɪ_Oʀᴅᴇʀ_Dᴇᴛᴀɪʟs ❯</b>\n\n<b>Tʀᴀɴsᴀᴄᴛɪᴏɴ Dᴇᴛᴀɪʟs »</b>\n"
            valid_status = details.get('valid_status' if method == 'edit_message_text' else 'valid_until', '')
            if valid_status in ['⏱️ Oʀᴅᴇʀ Is Cᴀɴᴄᴇʟʟᴇᴅ', '⏱️ Oʀᴅᴇʀ Hᴀs Exᴘɪʀᴇᴅ', '✅ Oʀᴅᴇʀ Hᴀs Cᴏᴍᴘʟᴇᴛᴇᴅ'] or ':' in valid_status:
                message += "<blockquote expandable>"
            
            barcode_id = await encode_order_id(str(order_id))
            message += (
                f"📦 <b>Aᴘᴘ Nᴀᴍᴇ »</b> <code>{details.get('app_name', 'N/A').translate(await small_caps())}</code>\n"
                f"💰 <b>Pʀɪᴄᴇ »</b> <code>{details.get('app_price', 'N/A')}</code> 💎 [ <code>{details.get('server_id', 'N/A')}</code> ]\n"
                f"🌍 <b>Rᴇɢɪᴏɴ »</b> <code>{details.get('country_name', 'N/A').translate(await small_caps())}</code> [ <code>{details.get('country_code', '🌍')}</code> ]\n\n"
                f"<b>Cᴏɴᴛᴀᴄᴛ Dᴇᴛᴀɪʟs »</b>\n"
                f"💳 <code>{order_id}</code>\n"
                f"📞 <code>{details.get('code', 'N/A')}</code> <code>{details.get('number', 'N/A')}</code>\n"
                f"⎚ Cᴏᴅᴇ » <code>{barcode_id}</code>\n"
            )
            if details.get('sms_list', 'N/A') != 'N/A':
                message += f"🔐 <b>Cᴏᴅᴇs »</b> {details.get('sms_list', 'N/A')}\n"
            
            if valid_status in ['⏱️ Oʀᴅᴇʀ Is Cᴀɴᴄᴇʟʟᴇᴅ', '⏱️ Oʀᴅᴇʀ Hᴀs Exᴘɪʀᴇᴅ', '✅ Oʀᴅᴇʀ Hᴀs Cᴏᴍᴘʟᴇᴛᴇᴅ'] or ':' in valid_status:
                message += "</blockquote>"
            
            if details.get('valid_until', 'N/A') != 'N/A':
                message += f"\n⏱️ <b>Uɴᴛɪʟ »</b> {details.get('valid_until', 'N/A')}"
            elif details.get('valid_status', 'N/A') != 'N/A':
                message += f"\n<b>{details.get('valid_status', 'N/A')}</b>"
            
            admin_keyboard = InlineKeyboardMarkup([
                [
                    InlineKeyboardButton('🔗 Usᴇʀ', url=f'tg://openmessage?user_id={user_id}'),
                    InlineKeyboardButton('⌕ Dᴇᴛᴀɪʟs', callback_data='placeholder')
                ]
            ])
            
            try:
                if method == 'edit_message_text':
                    session = await db_adapter.get_user_session(user_id) or {}
                    forum_message_id = session.get("forum_message_id")
                    if forum_message_id is None and self.redis_manager:
                        try:
                            profile_key = f"{ORDER_INFO_PREFIX}info:{order_id}"
                            forum_message_id = await self.redis_manager.redis_client.hget(profile_key, "forum_message_id")
                        except Exception:
                            pass
                    if forum_message_id is None:
                        await self.logger.error("Forum message ID is None.")
                        return None
                    await self.logger.info(f"Editing message with ID: {forum_message_id}")
                    result = await bot.edit_message_text(
                        chat_id=channel_id,
                        message_id=int(forum_message_id),
                        text=message,
                        reply_markup=admin_keyboard,
                        parse_mode='HTML'
                    )
                else:
                    await self.logger.info(f"Sending new message to channel: {channel_id}")
                    result = await bot.send_message(
                        chat_id=channel_id,
                        text=message,
                        reply_markup=admin_keyboard,           
                        message_thread_id=forum_id,
                        parse_mode='HTML'
                    )
                    message_id = result.message_id if result else None
                    if message_id:
                        await db_adapter.save_user_session(user_id, {"forum_message_id": message_id})
                        if self.redis_manager:
                            try:
                                order_info_key = f"{ORDER_INFO_PREFIX}info:{order_id}"
                                await self.redis_manager.redis_client.hset(order_info_key, "forum_message_id", message_id)
                            except Exception:
                                pass

                return result.message_id if result else None
            except Exception as e:
                await self.logger.error(f"Error in send_order_report: {str(e)}")
                return None
        except Exception as e:
            await self.logger.error(f"Error in send_order_report: {str(e)}")
            return None

    async def create_forum_topic(self, user_id: str, topic_name: str) -> Optional[dict]:
        await self._init_logger()
        random_colors = [0x6FB9F0, 0xFFD67E, 0xCB86DB, 0x8EEE98, 0xFF93B2, 0xFB6F5F]
        icon_color = random.choice(random_colors)
        custom_emoji_id = await self.get_random_safe_emoji_id()
        
        payload = {
            'chat_id': self.channel_id,
            'name': topic_name,
            "icon_custom_emoji_id": custom_emoji_id,
            'icon_color': icon_color
        }
        
        result = await self._send_telegram_request('createForumTopic', payload)
        if result and result.get('ok'):
            forum_data = result.get('result')
            m_thread_id = forum_data.get("message_thread_id")
            await db_adapter.save_user_session(user_id, {"forum_id": m_thread_id})
            if self.redis_manager:
                try:
                    profile_key = f"user_data:{user_id}:profile:main"
                    await self.redis_manager.redis_client.hset(profile_key, "forum_id", m_thread_id)
                except Exception:
                    pass
            return forum_data
        return None

    async def update_forum_topic(self, user_id: str, new_name: Optional[str] = None, new_icon_color: Optional[str] = None) -> Optional[dict]:
        await self._init_logger()
        session = await db_adapter.get_user_session(user_id) or {}
        forum_id = session.get("forum_id")
        if not forum_id and self.redis_manager:
            try:
                profile_key = f"user_data:{user_id}:profile:main"
                forum_id = await self.redis_manager.redis_client.hget(profile_key, "forum_id")
            except Exception:
                pass
        if not forum_id:
            return None

        payload = {"chat_id": self.channel_id, "message_thread_id": forum_id}
        if new_name:
            payload["name"] = new_name
        if new_icon_color:
            payload["icon_color"] = new_icon_color

        if len(payload) > 2:  # more than just chat_id and message_thread_id
            result = await self._send_telegram_request('editForumTopic', payload)
            return result.get("result") if result and result.get("ok") else None
        return None

    async def list_forum_topics(self) -> dict:
        await self._init_logger()
        topics = {}
        try:
            pool = await db_adapter._ensure_pool()
            async with pool.connection() as conn:
                async with conn.cursor(row_factory=dict_row) as cur:
                    await cur.execute("SELECT user_id, forum_id FROM user_sessions WHERE forum_id IS NOT NULL")
                    rows = await cur.fetchall()
                    for r in rows:
                        topics[f"user_data:{r['user_id']}:profile:main"] = {"forum_id": r["forum_id"]}
        except Exception as e:
            await self.logger.error(f"Error listing forum topics from DB: {e}")
        return topics

    async def archive_forum_topic(self, user_id: str) -> Optional[dict]:
        await self._init_logger()
        session = await db_adapter.get_user_session(user_id) or {}
        forum_id = session.get("forum_id")
        if not forum_id:
            return None
        
        payload = {"chat_id": self.channel_id, "message_thread_id": forum_id}
        result = await self._send_telegram_request('closeForumTopic', payload)
        
        if result and result.get("ok"):
            await db_adapter.save_user_session(user_id, {"forum_archived": True})
            if self.redis_manager:
                try:
                    profile_key = f"user_data:{user_id}:profile:main"
                    await self.redis_manager.redis_client.hset(profile_key, "forum_archived", "true")
                except Exception:
                    pass
            return result.get("result")
        return None

    async def reopen_forum_topic(self, user_id: str) -> Optional[dict]:
        await self._init_logger()
        session = await db_adapter.get_user_session(user_id) or {}
        forum_id = session.get("forum_id")
        if not forum_id:
            return None
        
        payload = {"chat_id": self.channel_id, "message_thread_id": forum_id}
        result = await self._send_telegram_request('reopenForumTopic', payload)
        
        if result and result.get("ok"):
            await db_adapter.save_user_session(user_id, {"forum_archived": False})
            if self.redis_manager:
                try:
                    profile_key = f"user_data:{user_id}:profile:main"
                    await self.redis_manager.redis_client.hset(profile_key, "forum_archived", "false")
                except Exception:
                    pass
            return result.get("result")
        return None

    async def get_forum_topic_details(self, user_id: str) -> dict:
        await self._init_logger()
        session = await db_adapter.get_user_session(user_id) or {}
        forum_id = session.get("forum_id")
        return {"forum_id": forum_id}
    
    # -------------- User Management Async Methods --------------
    @handle_redis_exceptions
    async def _init_search_indexes(self):
        """Creates RediSearch indexes if Redis is available."""
        await self._init_logger()
        if not self.redis_manager:
            return
        redis_client = await self.ensure_connection()
        if not redis_client:
            return

        async def create_index(index_name: str, schema: list, prefix: str):
            try:
                await redis_client.ft(index_name).dropindex(delete_documents=True)
            except Exception as e:
                await self.logger.warning(f"Index '{index_name}' did not exist or could not be dropped: {e}")
            definition = IndexDefinition(prefix=[prefix], index_type=IndexType.HASH)
            await redis_client.ft(index_name).create_index(fields=schema, definition=definition)

        user_schema = [
            TextField("user_id", sortable=True),
            TextField("username", sortable=True),
            TextField("first_name", sortable=True),
            TextField("last_name", sortable=True),
            TextField("language_code", sortable=True),
            TextField("forum_id"),
            TextField("status", sortable=True),
            TextField("registration_date", sortable=True)
        ]

        try:
            try:
                await redis_client.ft(USER_INFO_INDEX).info()
            except Exception as e:
                await create_index(USER_INFO_INDEX, user_schema, USER_INFO_PREFIX)
            await self.logger.info("UserManagement indexes verified/created successfully")
        except RedisError as e:
            await self.logger.error(f"Redis error while creating indexes: {e}")

    async def _atomic_balance_update(self, user_id: str, amount: float, transaction_type: str) -> dict:
        """Perform atomic balance updates via PostgreSQL ledger."""
        await self._init_logger()
        try:
            db_res = await db_adapter.execute_atomic_balance_update(
                telegram_id=str(user_id),
                amount=amount,
                txn_type=transaction_type,
            )
            if db_res.get("response"):
                new_bal = float(db_res.get("new_balance", 0.0))
                return {'response': True, 'result': {'new_balance': new_bal}}
            return {'response': False, 'error': db_res.get("error", "Balance update failed")}
        except Exception as e:
            await self.logger.error(f"Error updating balance for {user_id}: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def create_user(self, user_data: dict) -> dict:
        """Create or ensure user profile exists in PostgreSQL."""
        await self._init_logger()
        user_id = str(user_data.get('user_id'))
        if not user_id:
            return {'response': False, 'error': 'User ID is required'}
        try:
            db_user = await db_adapter.get_or_create_user(
                telegram_id=user_id,
                name=user_data.get('first_name', ''),
            )
            await db_adapter.save_user_session(
                telegram_id=user_id,
                session_data={
                    "username": str(user_data.get("username", "") or ""),
                    "first_name": str(user_data.get("first_name", db_user.get("name", "")) or ""),
                    "last_name": str(user_data.get("last_name", "") or ""),
                    "language_code": str(user_data.get("language_code", "en") or "en"),
                    "status": "BANNED" if db_user.get("is_banned") else "ACTIVE",
                    "registration_date": datetime.utcnow().isoformat(),
                },
            )
            if user_data.get("referrer_id"):
                await db_adapter.save_referral_info(
                    telegram_id=user_id,
                    referrer_id=str(user_data["referrer_id"]),
                    code=str(user_data.get("referral_code", user_id))
                )

            if self.redis_manager:
                try:
                    redis_client = await self.ensure_connection()
                    if redis_client:
                        user_key = f"user_data:{user_id}:profile:main"
                        await redis_client.hset(user_key, mapping={
                            "user_id": user_id,
                            "first_name": str(user_data.get("first_name", "")),
                            "username": str(user_data.get("username", "")),
                            "status": "BANNED" if db_user.get("is_banned") else "ACTIVE",
                        })
                except Exception:
                    pass

            return {'response': True, 'message': "USER-CREATED", 'user_id': user_id}
        except Exception as e:
            await self.logger.error(f"Error creating user {user_id}: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def get_user_data(self, user_id: str) -> Dict[str, Any]:
        """Fetch user profile data from PostgreSQL."""
        await self._init_logger()
        try:
            db_user = await db_adapter.get_user_by_telegram_id(str(user_id))
            if not db_user:
                db_user = await db_adapter.get_or_create_user(str(user_id))

            session = await db_adapter.get_user_session(str(user_id)) or {}

            profile_dict = {
                "user_id": str(db_user["telegram_id"]),
                "first_name": db_user.get("name") or session.get("first_name") or "",
                "status": "BANNED" if db_user.get("is_banned") else "ACTIVE",
                "balance": str(db_user.get("balance", 0.0)),
                "registration_date": session.get("registration_date") or datetime.utcnow().isoformat(),
                "username": session.get("username") or "",
                "last_name": session.get("last_name") or "",
                "language_code": session.get("language_code") or "en",
                "forum_id": session.get("forum_id"),
                "forum_message_id": session.get("forum_message_id"),
                "forum_archived": session.get("forum_archived", False),
            }
            return {"response": True, "result": profile_dict}
        except Exception as e:
            await self.logger.error(f"Error fetching user data for {user_id}: {e}")
            return {"response": False, "error": str(e)}

    @handle_redis_exceptions
    async def update_user_status(self, user_id: str, new_status: str) -> dict:
        """Update user status in PostgreSQL."""
        await self._init_logger()
        if new_status not in ["ACTIVE", "BANNED", "SUSPENDED", "INACTIVE"]:
            return {'response': False, 'error': 'Invalid status'}

        try:
            is_banned = new_status in ["BANNED", "SUSPENDED"]
            await db_adapter.update_user(telegram_id=str(user_id), is_banned=is_banned)
            session = await db_adapter.get_user_session(str(user_id)) or {}
            board_id = session.get("forum_id")
            topic_id = session.get("forum_message_id")
            archive_flag = session.get("forum_archived", False)

            if self.redis_manager:
                try:
                    redis_client = await self.ensure_connection()
                    if redis_client:
                        user_key = f"user_data:{user_id}:profile:main"
                        await redis_client.hset(user_key, "status", new_status)
                except Exception:
                    pass

            return {
                'response': True,
                'message': f"User {user_id} status updated to '{new_status}'",
                'source': 'postgresql',
                'forum_id': board_id,
                'forum_message_id': topic_id,
                'forum_archived': archive_flag,
            }
        except Exception as e:
            await self.logger.error(f"Error updating user status for {user_id}: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def search_users(self, query_str: str = "*", sort_by: str = None, sort_asc: bool = True, limit: int = 10) -> dict:
        """Search users in PostgreSQL."""
        await self._init_logger()
        try:
            pool = await db_adapter._ensure_pool()
            async with pool.connection() as conn:
                async with conn.cursor(row_factory=dict_row) as cur:
                    await cur.execute(
                        "SELECT u.*, us.menu_state, us.temp_data FROM users u "
                        "LEFT JOIN user_sessions us ON u.id = us.user_id "
                        "ORDER BY u.created_at DESC LIMIT %s",
                        (limit,)
                    )
                    rows = await cur.fetchall()
                    users = [
                        {
                            "user_id": str(r["telegram_id"]),
                            "username": r.get("name") or "",
                            "first_name": r.get("name") or "",
                            "status": "BANNED" if r.get("is_banned") else "ACTIVE",
                            "balance": float(r.get("balance", 0.0)),
                            "registration_date": r["created_at"].isoformat() if r.get("created_at") else None,
                        }
                        for r in rows
                    ]
                    return {'response': True, 'total': len(users), 'results': users}
        except Exception as e:
            await self.logger.error(f"Error searching users: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def get_user_value(self, user_id: str, field: str) -> dict:
        """Get a specific user field from session or DB."""
        await self._init_logger()
        try:
            session = await db_adapter.get_user_session(str(user_id))
            if session and field in session:
                return {'response': True, 'result': session[field]}
            db_user = await db_adapter.get_user_by_telegram_id(str(user_id))
            if db_user:
                if field in ["name", "first_name"]:
                    return {'response': True, 'result': db_user.get("name")}
                elif field in ["balance", "current_balance"]:
                    return {'response': True, 'result': db_user.get("balance")}
                elif field == "is_banned":
                    return {'response': True, 'result': db_user.get("is_banned")}
            return {'response': True, 'result': None}
        except Exception as e:
            await self.logger.error(f"Error getting user value for {user_id}: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def set_user_value(self, user_id: str, field: str, value) -> dict:
        """Set a user field in PostgreSQL and session table."""
        await self._init_logger()
        try:
            if field in ["first_name", "name"]:
                await db_adapter.update_user(telegram_id=str(user_id), name=str(value))
            elif field == "status":
                is_banned = True if str(value) in ["BANNED", "SUSPENDED"] else False
                await db_adapter.update_user(telegram_id=str(user_id), is_banned=is_banned)
            else:
                session = await db_adapter.get_user_session(str(user_id)) or {}
                session[field] = value
                await db_adapter.save_user_session(str(user_id), session)

            if self.redis_manager:
                try:
                    redis_client = await self.ensure_connection()
                    if redis_client:
                        user_key = f"user_data:{user_id}:profile:main"
                        await redis_client.hset(user_key, field, str(value))
                except Exception:
                    pass

            return {'response': True, 'result': True}
        except Exception as e:
            await self.logger.error(f"Error setting user value for {user_id}: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def update_user_data(self, user_id: str, user_data: dict) -> dict:
        """Update user session and DB profile in PostgreSQL."""
        async with AsyncOperationContext(operation_lock_manager, OperationType.PROFILE_UPDATE, user_id):
            await self._init_logger()
            try:
                name = user_data.get("first_name") or user_data.get("name")
                status = user_data.get("status")
                is_banned = (True if status in ["BANNED", "SUSPENDED"] else False) if status else None
                if name or is_banned is not None:
                    await db_adapter.update_user(telegram_id=str(user_id), name=name, is_banned=is_banned)

                session = await db_adapter.get_user_session(str(user_id)) or {}
                session.update(user_data)
                await db_adapter.save_user_session(str(user_id), session)

                if self.redis_manager:
                    try:
                        redis_client = await self.ensure_connection()
                        if redis_client:
                            user_key = f"user_data:{user_id}:profile:main"
                            await redis_client.hset(user_key, mapping={k: str(v) for k, v in user_data.items()})
                    except Exception:
                        pass

                return {'response': True, 'message': f"User data updated for {user_id}", 'data': user_data}
            except Exception as e:
                await self.logger.error(f"Error updating user data for {user_id}: {e}")
                return {'response': False, 'error': str(e)}
    
    @handle_redis_exceptions
    async def _run_aggregate_cursor(
        self,
        cmd: List[Any],
        index: str,
        batch_size: int = 10_000
    ) -> List[List[Any]]:
        """
        Executes FT.AGGREGATE with WITHCURSOR, returns a flat list of rows.
        """
        cache_key = f"cursor_data:{batch_size}:{index}_" + "_".join(map(str, cmd))
        cache_data = await cache_manager.get(cache_key, prefix=CachePrefix.TEMP)
        if cache_data:
            return cache_data

        all_rows: List[List[Any]] = []

        # Add WITHCURSOR clause
        cmd_ext = [*cmd, "WITHCURSOR", "COUNT", str(batch_size)]

        try:
            redis_client = await self.ensure_connection()
            if not redis_client:
                return []
            response = await redis_client.execute_command(*cmd_ext)
            if not isinstance(response, list) or len(response) != 2:
                raise RuntimeError(f"Unexpected Redis response format: {response}")
            results, cursor = response
        except Exception as e:
            print("Aggregation init failed:", e)
            return []

        # First page
        if isinstance(results, list) and len(results) > 1:
            all_rows.extend(results[1:])

        # Paginated cursor reads
        while cursor:
            try:
                page = await redis_client.execute_command(
                    "FT.CURSOR", "READ", index, cursor
                )
                if not isinstance(page, list) or len(page) != 2:
                    raise RuntimeError(f"Unexpected cursor page format: {page}")
                rows, cursor = page
                if len(rows) > 1:
                    all_rows.extend(rows[1:])
            except Exception as e:
                print("Cursor read failed:", e)
                break

        await cache_manager.set(cache_key, all_rows, prefix=CachePrefix.TEMP)
        return all_rows

# ---------------- DepositManagement Class ----------------
class DepositManagement:
    """Manage deposit operations with PostgreSQL asynchronously."""
    
    def __init__(self, redis_manager: Optional[RedisManager] = None, enable_logging: bool = True):
        self.redis_manager = redis_manager
        self.redis_keys = None
        self._initialized = False
        self.logger: Optional[AdvancedLogger] = None
        self.enable_logging = enable_logging
        self.lock_manager = operation_lock_manager

    async def _init_logger(self):
        if not self.logger:
            self.logger = await get_async_logger(self.enable_logging)

    async def ensure_initialized(self) -> None:
        """Ensure deposit-specific keys are initialized asynchronously."""
        if not self._initialized:
            self.redis_keys = RedisKeys()
            self._initialized = True

    async def build_query(self, filters: dict) -> str:
        """Build a structured query string from a dictionary of filters asynchronously."""
        async def process_filter(field: str, value: Any) -> Optional[str]:
            if value is None:
                return None
            if isinstance(value, list) and value:
                options = '|'.join(f'"{v}"' if ' ' in str(v) else str(v) for v in value)
                return f"@{field}:({options})"
            elif isinstance(value, tuple) and len(value) == 2:
                start, end = value
                return f"@{field}:[{start} {end}]"
            else:
                return f'@{field}:"{value}"' if ' ' in str(value) else f'@{field}:{value}'

        tasks = [process_filter(field, value) for field, value in filters.items()]
        query_parts = await asyncio.gather(*tasks)
        query_parts = [part for part in query_parts if part is not None]
        return ' '.join(query_parts) if query_parts else '*'

    async def process_deposit_doc(self, doc) -> dict:
        """Process individual deposit document from search results asynchronously."""
        return {k: v for k, v in doc.__dict__.items() if not k.startswith('__')}

    @handle_redis_exceptions
    async def ensure_connection(self) -> Any:
        """Ensure that a Redis connection is established asynchronously if available."""
        await self.ensure_initialized()
        if self.redis_manager:
            return await self.redis_manager.get_client()
        return None

    @handle_redis_exceptions
    async def _init_search_indexes(self) -> None:
        """Initialize Redis search indexes for deposits if Redis is available."""
        await self._init_logger()
        if not self.redis_manager:
            return
        try:
            redis_client = await self.ensure_connection()
            if not redis_client:
                return
            try:
                await redis_client.ft(DEPOSIT_INFO_INDEX).dropindex()
            except Exception:
                pass

            schema = (
                TextField("deposit_id", sortable=True),
                TextField("message_id", sortable=True),
                TextField("user_id", sortable=True),
                TextField("server_id", sortable=True),
                NumericField("deposit_amount", sortable=True),
                TextField("deposit_status", sortable=True),
                TextField("search_tags", weight=1.0),
                NumericField("recorded_at", sortable=True)
            )

            await redis_client.ft(DEPOSIT_INFO_INDEX).create_index(
                schema,
                definition=IndexDefinition(
                    prefix=[DEPOSIT_INFO_PREFIX],
                    language="english"
                )
            )
            await self.logger.info("DepositManagement indexes created successfully")
        except Exception as e:
            await self.logger.error(f"Error creating deposit search indexes: {e}")

    @handle_redis_exceptions
    async def create_deposit_id(self, user_id: str) -> dict:
        """Generate a 16-digit unique numeric deposit ID asynchronously (numeric-only)."""
        import random
        deposit_id = str(random.randint(1000000000000000, 9999999999999999))
        return {'response': True, 'result': deposit_id}

    @handle_redis_exceptions
    async def add_deposit_data(self, deposit_id: str, user_id: str, data: Dict[str, Any]) -> dict:
        """Add a new deposit record in PostgreSQL and Redis with 15-min TTL."""
        try:
            amount = float(data.get('amount', 0.0) or data.get('deposit_amount', 0.0) or 0.0)
            gateway = str(data.get('gateway', data.get('payment_mode', 'UPI')))
            idempotency_key = str(data.get('idempotency_key', f"dep:{deposit_id}"))

            await db_adapter.create_deposit_request(
                telegram_id=str(user_id),
                amount=amount,
                gateway=gateway,
                idempotency_key=idempotency_key,
                deposit_id=deposit_id
            )

            if self.redis_manager:
                try:
                    redis_client = await self.ensure_connection()
                    if redis_client:
                        deposit_info_key = f"{DEPOSIT_INFO_PREFIX}info:{deposit_id}"
                        data.setdefault('recorded_at', time.time())
                        data.setdefault('deposit_status', 'PENDING')
                        data.setdefault('user_id', str(user_id))
                        data.setdefault('deposit_id', str(deposit_id))
                        await redis_client.hset(deposit_info_key, mapping={k: str(v) for k, v in data.items()})
                        await redis_client.expire(deposit_info_key, 900)
                except Exception:
                    pass

            return {'response': True, 'message': "DEPOSIT-ADDED", 'deposit_id': deposit_id, 'user_id': user_id, 'result': data}
        except Exception as e:
            await self.logger.error(f"Error adding deposit data: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def get_deposit_data(self, deposit_id: str) -> dict:
        """Retrieve deposit details from Redis (0 DB load) and fallback to PostgreSQL."""
        await self._init_logger()
        try:
            if self.redis_manager:
                try:
                    redis_client = await self.ensure_connection()
                    if redis_client:
                        deposit_info_key = f"{DEPOSIT_INFO_PREFIX}info:{deposit_id}"
                        data = await redis_client.hgetall(deposit_info_key)
                        if data:
                            res = {k: (v.decode('utf-8') if isinstance(v, bytes) else str(v)) for k, v in data.items()}
                            if 'user_id' in res:
                                res['telegram_id'] = res['user_id']
                            return {'response': True, 'result': res}
                except Exception:
                    pass

            dep = await db_adapter.get_deposit_request(str(deposit_id))
            if dep:
                return {'response': True, 'result': dep}
            return {'response': False, 'error': 'DEPOSIT-NOT-FOUND'}
        except Exception as e:
            await self.logger.error(f"Error retrieving deposit data for ID {deposit_id}: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def update_deposit_status(self, deposit_id: str, status: str) -> dict:
        """Update deposit status in PostgreSQL and Redis."""
        try:
            valid_statuses = ['PENDING', 'COMPLETED', 'CANCELLED', 'FAILED', 'TIMEOUT']
            if status not in valid_statuses:
                return {'response': False, 'error': 'Invalid status'}

            # On CANCELLED or TIMEOUT, delete the PENDING row from Supabase to prevent database bloat!
            if status in ('CANCELLED', 'TIMEOUT'):
                await db_adapter.delete_pending_deposit_request(str(deposit_id))
                if self.redis_manager:
                    try:
                        redis_client = await self.ensure_connection()
                        if redis_client:
                            deposit_info_key = f"{DEPOSIT_INFO_PREFIX}info:{deposit_id}"
                            await redis_client.delete(deposit_info_key)
                    except Exception:
                        pass
                return {'response': True, 'message': f'Pending deposit {deposit_id} purged on {status}'}

            # On COMPLETED / FAILED, update status in Supabase
            await db_adapter.update_deposit_status(str(deposit_id), status)

            if self.redis_manager:
                try:
                    redis_client = await self.ensure_connection()
                    if redis_client:
                        deposit_info_key = f"{DEPOSIT_INFO_PREFIX}info:{deposit_id}"
                        if status == 'COMPLETED':
                            await redis_client.delete(deposit_info_key)
                        else:
                            await redis_client.hset(deposit_info_key, 'deposit_status', status)
                except Exception:
                    pass

            return {'response': True, 'message': f'Deposit status updated to {status}'}
        except Exception as e:
            await self.logger.error(f"Error updating deposit status: {str(e)}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def update_deposit_fields(self, deposit_id: str, fields: Dict[str, Any]) -> dict:
        """Update specific fields of a deposit record in PostgreSQL."""
        try:
            status = fields.get('deposit_status') or fields.get('status')
            code = fields.get('code')
            await db_adapter.update_deposit_status(str(deposit_id), status=status or "PENDING", code=code, metadata=fields)

            if self.redis_manager:
                try:
                    redis_client = await self.ensure_connection()
                    if redis_client:
                        deposit_info_key = f"{DEPOSIT_INFO_PREFIX}info:{deposit_id}"
                        await redis_client.hset(deposit_info_key, mapping={k: str(v) for k, v in fields.items()})
                except Exception:
                    pass

            return {'response': True, 'message': 'Deposit fields updated successfully'}
        except Exception as e:
            await self.logger.error(f"Error updating deposit fields: {str(e)}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def update_deposit_success(self, bot, deposit_id: str, deposit_amount: str, timeout: float, api_status: Dict, deposit_status: str, valid_until: str) -> dict:
        """Update deposit success details in PostgreSQL."""
        try:
            await self.logger.info(f"Dᴇᴘᴏsɪᴛ: Updating deposit success for deposit_id {deposit_id}")
            dep_res = await self.get_deposit_data(deposit_id)
            if not dep_res.get('response'):
                return {'response': False, 'error': 'Deposit not found'}

            user_id = dep_res['result'].get('telegram_id') or dep_res['result'].get('user_id')

            await db_adapter.update_deposit_status(str(deposit_id), deposit_status, metadata=api_status)

            # Credit balance atomically (idempotency_key prevents double credits)
            amount_val = float(deposit_amount)
            credit_result = await db_adapter.execute_atomic_balance_update(
                telegram_id=str(user_id),
                amount=amount_val,
                txn_type="credit",
                description=f"Deposit {deposit_id} completed",
                idempotency_key=f"dep_credit:{deposit_id}"
            )

            # Only send notification if credit was actually applied (not a duplicate)
            if credit_result.get('response'):
                await self.send_deposit_notification(
                    bot,
                    str(user_id),
                    amount_val,
                    deposit_id,
                    api_status.get('gateway_name', 'N/A'),
                    api_status.get('payment_mode', 'N/A'),
                    valid_until
                )
            else:
                await self.logger.info(f"Dᴇᴘᴏsɪᴛ: Credit already applied for {deposit_id}, skipping notification")

            return {'response': True, 'message': 'Deposit updated successfully'}
        except Exception as e:
            await self.logger.error(f"Dᴇᴘᴏsɪᴛ: Error updating deposit for deposit_id {deposit_id}: {str(e)}", exc_info=True)
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def send_deposit_notification(self, bot: AsyncTeleBot, user_id: str, amount: float, deposit_id: str, paid_from: str, paid_type: str, valid_until: str) -> None:
        """Send deposit notification."""
        try:
            await self.logger.info(f"Sending deposit notification for user {user_id}")
            data = await financial_mgr.get_user(str(user_id))
            if not isinstance(data, dict) or not data.get('response'):
                return

            metrics = data.get("metrics", {})
            user_name = data.get("user_profile", "")

            if metrics.get("deposits", {}).get("count", 0) == 1:
                forum_topic = await user_mgr.create_forum_topic(str(user_id), f"❯ {user_name} [{user_id}]")
            else:
                forum_topic = False

            session = await db_adapter.get_user_session(str(user_id)) or {}
            forum_id = session.get("forum_id")

            if forum_id:
                if not forum_topic:
                    await user_mgr.user_metrics_report(bot, 'edit_message_text', str(user_id), CHANNEL_ID)
                else:
                    from handlers.main.show_wallet import wallet_manager
                    message_id, _ = await asyncio.gather(
                        user_mgr.user_metrics_report(bot, 'sendMessage', str(user_id), CHANNEL_ID, forum_id),
                        wallet_manager.process_wallet_update(str(user_id)),
                    )
                    session["forum_message_id"] = str(message_id)
                    await db_adapter.save_user_session(str(user_id), session)

                admin_text = (
                    f"<b>#Uᴘɪ_Cᴀʀᴅ_Dᴇᴘᴏsɪᴛ ❯</b>\n\n"
                    f"<b>Tʀᴀɴsᴀᴄᴛɪᴏɴ Dᴇᴛᴀɪʟs »</b>\n"
                    f"<blockquote expandable>"
                    f"<b>💰 Aᴍᴏᴜɴᴛ »</b> <code>{amount}</code> 💎\n"
                    f"<b>👤 Pᴀɪᴅ Fʀᴏᴍ »</b> <code>{paid_from}</code>\n"
                    f"<b>🕊 Pᴀʏᴍᴇɴᴛ Tʏᴘᴇ »</b> <code>{paid_type}</code>\n\n"
                    f"<b>Bᴀʟᴀɴᴄᴇ Uᴘᴅᴀᴛᴇ »</b>\n"
                    f"<b>🏛</b> <code>{deposit_id}</code>\n"
                    f"<b>⏱️ Tɪᴍᴇ »</b> {valid_until}\n"
                    f"</blockquote>\n"
                    f"<b>Sᴜᴄᴄᴇssғᴜʟʟʏ Cʀᴇᴅɪᴛᴇᴅ</b>"
                )
                admin_keyboard = InlineKeyboardMarkup()
                admin_keyboard.row(
                    InlineKeyboardButton('🔗 Usᴇʀ', url=f'tg://openmessage?user_id={user_id}'),
                    InlineKeyboardButton('⌕ Dᴇᴛᴀɪʟs', callback_data='placeholder')
                )

                try:
                    await bot.send_message(
                        chat_id=CHANNEL_ID,
                        text=admin_text,
                        reply_markup=admin_keyboard,
                        message_thread_id=int(forum_id),
                        parse_mode='HTML'
                    )
                except Exception as e:
                    await self.logger.error(f"Failed to send admin notification: {e}")
        except Exception as e:
            await self.logger.error(f"Error sending deposit notification: {str(e)}")

    @handle_redis_exceptions
    async def aggregate_deposits(self, filters: Dict[str, Any]) -> Dict[str, float]:
        """Aggregate deposit totals from PostgreSQL."""
        await self._init_logger()
        try:
            telegram_id = filters.get("user_id")
            res = await db_adapter.search_deposit_requests(telegram_id=telegram_id)
            results = res.get("results", [])
            total_amount = sum(d["amount"] for d in results if d.get("deposit_status") == "COMPLETED")
            return {"total_amount": float(total_amount), "count": len(results)}
        except Exception as e:
            await self.logger.error(f"Error aggregating deposits: {e}")
            return {"total_amount": 0.0, "count": 0}

    @handle_redis_exceptions
    async def cancel_deposit(self, deposit_id: str, user_id: str, status: str = 'CANCELLED') -> dict:
        """Cancel a deposit in PostgreSQL."""
        await self._init_logger()
        try:
            await db_adapter.update_deposit_status(str(deposit_id), status)
            return {'response': True, 'message': f'Deposit {status} successfully'}
        except Exception as e:
            await self.logger.error(f"Error cancelling deposit {deposit_id}: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def search_deposits_advanced(self, filters: dict, sort_by: str = None, sort_asc: bool = True, offset: int = 0, limit: int = 10) -> dict:
        """Search deposits in PostgreSQL."""
        await self._init_logger()
        try:
            telegram_id = filters.get("user_id")
            status = filters.get("deposit_status")
            recorded_at = filters.get("recorded_at")
            # Show only completed deposits OR those older than 10 minutes (hide fresh pending ones)
            res = await db_adapter.search_deposit_requests(telegram_id=telegram_id, status=status, recorded_at=recorded_at, limit=limit, offset=offset, hide_recent_pending=True)
            return {'response': True, 'total_deposits': res.get("total", 0), 'results': res.get("results", [])}
        except Exception as e:
            await self.logger.error(f"Error searching deposits: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def search_current_deposits(self, query_str: str = "*", sort_by: str = None, sort_asc: bool = True, limit: int = 10, offset: int = 0) -> dict:
        """
        Search for current pending deposits from Redis (0 DB load) with fallback.
        """
        await self._init_logger()
        try:
            if self.redis_manager:
                try:
                    redis_client = await self.ensure_connection()
                    if redis_client:
                        try:
                            base_query = "(@deposit_status:(PENDING))"
                            if query_str != "*":
                                base_query += f" ({query_str})"
                            query = Query(base_query).paging(offset, limit)
                            if sort_by:
                                query.sort_by(sort_by, asc=sort_asc)
                            results = await redis_client.ft(DEPOSIT_INFO_INDEX).search(query)
                            deposits = await asyncio.gather(*[
                                asyncio.create_task(self.process_deposit_doc(doc))
                                for doc in results.docs
                            ])
                            return {'response': True, 'total': results.total, 'results': deposits}
                        except Exception:
                            # Fallback to scanning active deposit keys directly
                            keys = []
                            async for key in redis_client.scan_iter(match=f"{DEPOSIT_INFO_PREFIX}info:*"):
                                keys.append(key)
                            deposits = []
                            for k in keys[offset:offset+limit]:
                                data = await redis_client.hgetall(k)
                                if data:
                                    res = {k: (v.decode('utf-8') if isinstance(v, bytes) else str(v)) for k, v in data.items()}
                                    if res.get("deposit_status", "PENDING") == "PENDING":
                                        if 'user_id' in res:
                                            res['telegram_id'] = res['user_id']
                                        deposits.append(res)
                            return {'response': True, 'total': len(keys), 'results': deposits}
                except Exception:
                    pass

            res = await db_adapter.search_deposit_requests(status="PENDING", limit=limit, offset=offset)
            return {'response': True, 'total': res.get("total", 0), 'results': res.get("results", [])}
        except Exception as e:
            await self.logger.error(f"Error searching current deposits: {e}")
            return {'response': False, 'error': str(e)}

class FinancialManagement:
    """
    High-performance asynchronous financial summary aggregator.
    Utilizes Redis aggregations and concurrent execution for optimal performance.
    """

    def __init__(self, deposit_mgr=None, order_mgr=None, user_mgr=None, enable_logging: bool = True):
        self.order_mgr: OrderManagement = order_mgr
        self.deposit_mgr: DepositManagement = deposit_mgr
        self.user_mgr: UserManagement = user_mgr
        self.logger: Optional[AdvancedLogger] = None
        self.enable_logging = enable_logging

    async def _init_logger(self):
        if not self.logger:
            self.logger = await get_async_logger(self.enable_logging)

    async def get_user(
        self,
        user_id: str,
        start_timestamp: Optional[float] = None,
        end_timestamp: Optional[float] = None,
        deposit_types: Optional[List[str]] = None,
        order_types: Optional[List[str]] = None,
        return_order_ids: bool = False,
        limit: Optional[int] = None,
        is_tool: bool = False,
        sort_fields: Optional[List[Tuple[str, str]]] = None,
        app_price: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Asynchronously retrieve financial summary via DatabaseAdapter."""
        await self._init_logger()
        user_id_str = str(user_id)
        try:
            summary = await db_adapter.get_financial_summary(user_id_str)
            return {
                "response": True,
                "user_profile": summary.get("full_name") or user_id_str,
                "metrics": summary.get("metrics", {
                    "current_balance": 0.0,
                    "spend_balance": 0.0,
                    "deposits": {"total_amount": 0.0, "count": 0},
                    "orders": {"total_amount": 0.0, "count": 0}
                }),
                "timestamp": datetime.utcnow().isoformat(),
            }
        except Exception as e:
            await self.logger.error(f"Error generating financial summary for user {user_id}: {e}")
            return {"response": False, "error": str(e)}

    async def _build_deposit_filters(
        self,
        user_id: str,
        start_timestamp: Optional[float],
        end_timestamp: Optional[float],
        deposit_types: Optional[List[str]]
    ) -> Dict[str, Any]:
        filters = {"user_id": user_id, "deposit_status": ["COMPLETED", "PROCESSING"]}
        if start_timestamp and end_timestamp:
            filters["recorded_at"] = (start_timestamp, end_timestamp)
        if deposit_types:
            filters["deposit_type"] = deposit_types
        return filters

    async def _build_order_filters(
        self,
        user_id: str,
        start_timestamp: Optional[float] = None,
        end_timestamp:   Optional[float] = None,
        order_types:     Optional[List[str]]  = None,
        include_order_ids: bool               = False,
        app_price:       Optional[str]         = "[0.01 +inf]",
        sort_fields:     Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """
        Construct the filters dict for RediSearch:
          - user_id       (exact)
          - order_status  (COMPLETED, PROCESSING, PENDING)
          - recorded_at   (timestamp range)
          - order_type    (list of types)
          - order_amount     (price range)
          - sort          (List[{"field":"PRICE"|"DATE","direction":"ASC"|"DESC"}])
          - _return_ids   (internal flag)
        """
        filters: Dict[str, Any] = {
            "user_id":      user_id,
            "order_status": ["COMPLETED", "PROCESSING", "PENDING"],
            "order_amount":    app_price,
        }

        # Date range filter
        if start_timestamp is not None and end_timestamp is not None:
            filters["recorded_at"] = (start_timestamp, end_timestamp)

        # Specific order types
        if order_types:
            filters["order_type"] = order_types

        # Multi‑field sort
        if sort_fields:
            valid_f = {"PRICE", "DATE"}
            valid_o = {"ASC", "DESC"}
            sorts: List[Dict[str, str]] = []
            for sort in sort_fields:
                f, o = sort["field"].upper(), sort["direction"].upper()
                if f in valid_f and o in valid_o:
                    sorts.append({"field": f, "direction": o})
            if sorts:
                filters["sort"] = sorts

        # Internal: return raw IDs?
        filters["_return_ids"] = include_order_ids
        return filters

class CountryFlagUpdater:
    def __init__(self, redis_client: Redis):
        self.redis_client = redis_client

    def convert_svg_to_png_upload(self, svg_url: str) -> str:
        return svg_url

    def emoji_to_country_code(self, flag_emoji: str) -> str:
        return ''.join(chr(ord(c) - 127397) for c in flag_emoji).lower()

    async def get_country_data(self, country_id: str = None) -> dict:
        try:
            whole_country_data = await self.redis_client.json().get('main_data:details:country_data') or {}
            return whole_country_data.get(country_id, {}) if country_id else whole_country_data
        except Exception as e:
            print(f"Error fetching country data: {e}")
            return {}

    async def update_flag_urls(self):
        country_data = await self.get_country_data()
        for key, val in country_data.items():
            flag_emoji = val.get("country_code")
            if not flag_emoji:
                continue
            country_code = self.emoji_to_country_code(flag_emoji)
            svg_url = f"https://hatscripts.github.io/circle-flags/icons/flags/{country_code}.svg"
            try:
                png_url = self.convert_svg_to_png_upload(svg_url)
                val["flag_url"] = png_url
                await self.redis_client.json().set('main_data:details:country_data', f'.{key}.flag_url', png_url)
                print(f"Updated country {key} with flag URL: {png_url}")
            except Exception as e:
                print(f"Error converting flag for country {key}: {e}")

    async def load_mappings(
        self,
        is_country_return: bool = False,
        is_app_return: bool = False
    ) -> Union[Dict, Tuple[Dict, Dict]]:
        try:
            countries_dict = app_mapping = None

            # Load only what is needed
            countries_dict = await self.redis_client.json().get('main_data:details:country_data') or None
            if is_country_return or not countries_dict:
                if not countries_dict:
                    with open(os.path.join(os.path.dirname(__file__), 'file', 'country_code.json'), 'r', encoding='utf-8') as f:
                        countries_list = json.load(f)
                        countries_dict = {
                            country["record_id"]: {
                                "country_name": country["name"],
                                "country_code": country["code"]
                            }
                            for country in countries_list
                        }
                        await self.redis_client.json().set('main_data:details:country_data', '$', countries_dict)
                        await self.update_flag_urls()

                country_mapping = {
                    country_data["country_name"].lower(): int(key)
                    for key, country_data in countries_dict.items()
                }
            else:
                country_mapping = {}
            
            app_mapping = await self.redis_client.json().get('main_data:service:app_data') or None
            if is_app_return or not app_mapping:
                if not app_mapping:
                    with open(os.path.join(os.path.dirname(__file__),  "file", "app_code.json"), 'r', encoding='utf-8') as f:
                        app_mapping = json.load(f)
                        await self.redis_client.json().set('main_data:service:app_data', '$', app_mapping)

                reverse_map = {}
                for app_name, details in app_mapping.items():
                    codes = details.get("code")
                    if isinstance(codes, list) and codes:
                        reverse_map[app_name.lower().replace(" ", "")] = codes[0]
                    elif isinstance(codes, str):
                        reverse_map[app_name.lower().replace(" ", "")] = codes
            else:
                reverse_map = {}

            # Return according to requested params
            if is_country_return and is_app_return:
                return country_mapping, reverse_map
            elif is_country_return:
                return country_mapping
            elif is_app_return:
                return reverse_map
            else:
                return {}, {}

        except Exception as e:
            logging.error(f"Error loading mappings: {e}")
            if is_country_return and is_app_return:
                return {}, {}
            elif is_country_return:
                return {}
            elif is_app_return:
                return {}
            else:
                return {}, {}



# ---------------- Initialize Managers ----------------
deposit_mgr = DepositManagement(redis_manager)
order_mgr = OrderManagement(redis_manager)
user_mgr = UserManagement(redis_manager, BOT_TOKEN, CHANNEL_ID)
financial_mgr = FinancialManagement(deposit_mgr, order_mgr, user_mgr)

FinancialSummaryAggregator = financial_mgr





from utils.config import NEXNUM_API_URL, NEXNUM_API_KEY

class NexNumManager:
    """
    NexNum API Client (V1 Provider-Compatible /stubs/handler_api.php)
    ------------------------------------------------------------------
    Drop-in client for NexNum's V1 Provider Engine. Connects NexBot directly
    to NexNum's SMS-Activate compatible stub endpoint, giving access to all
    providers, servers, and multi-provider failover routing seamlessly.
    """
    def __init__(self, api_url: str = NEXNUM_API_URL, api_key: str = NEXNUM_API_KEY):
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.endpoint = f"{self.api_url}/stubs/handler_api.php"
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self) -> "NexNumManager":
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def get_session(self) -> aiohttp.ClientSession:
        if not self.session or self.session.closed:
            self.session = aiohttp.ClientSession()
        return self.session

    async def _request(self, action: str, method: str = "GET", json_response: bool = False, **params) -> Any:
        """Helper to send requests to /stubs/handler_api.php."""
        session = await self.get_session()
        query_params = {
            "api_key": self.api_key,
            "action": action,
            **{k: v for k, v in params.items() if v is not None}
        }
        try:
            if method.upper() == "POST":
                async with session.post(self.endpoint, data=query_params, timeout=15) as resp:
                    if json_response:
                        return await resp.json()
                    return await resp.text()
            else:
                async with session.get(self.endpoint, params=query_params, timeout=15) as resp:
                    if json_response:
                        return await resp.json()
                    return await resp.text()
        except Exception as e:
            logging.error(f"[NexNumManager] Request failed for action '{action}': {e}")
            if json_response:
                return {}
            return f"ERROR:{e}"

    async def get_balance(self) -> float:
        """
        Action: getBalance
        Returns user balance float (e.g. 1250.75).
        Response format: ACCESS_BALANCE:1250.75
        """
        res = await self._request("getBalance")
        if isinstance(res, str) and res.startswith("ACCESS_BALANCE:"):
            try:
                return float(res.split(":")[1])
            except (IndexError, ValueError):
                pass
        return 0.0

    async def get_number(
        self,
        service: Union[int, str],
        country: Union[int, str],
        operator: Union[int, str],
        max_price: Optional[float] = None
    ) -> Tuple[Optional[str], Optional[str], str]:
        """
        Action: getNumber
        Purchases a phone number via NexNum's SmartSmsRouter engine.
        Returns: (activation_id, phone_number, raw_response)
        On success: ACCESS_NUMBER:<activationId>:<+E164>
        On error: NO_NUMBERS / NO_BALANCE / BAD_SERVICE
        """
        params = {
            "service": str(service),
            "country": str(country),
            "operator": str(operator),
            "maxPrice": str(max_price) if max_price is not None else None
        }
        res = await self._request("getNumber", **params)
        if isinstance(res, str) and res.startswith("ACCESS_NUMBER:"):
            parts = res.split(":")
            if len(parts) >= 3:
                return parts[1], parts[2], res
        return None, None, str(res)

    async def set_status(self, activation_id: str, status: int) -> str:
        """
        Action: setStatus
        Inputs: id=<activationId> status=<1|3|6|8|-1>
        Status mapping:
          1  -> ACCESS_READY       (mark as received)
          3  -> ACCESS_RETRY_GET   (request re-send)
          6  -> ACCESS_ACTIVATION  (finalize / complete)
          8  -> ACCESS_ACTIVATION  (number used)
          -1 -> ACCESS_CANCEL      (cancel + refund)
        Returns: ACCESS_READY | ACCESS_RETRY_GET | ACCESS_ACTIVATION | ACCESS_CANCEL | NO_ACTIVATION
        """
        res = await self._request("setStatus", id=activation_id, status=str(status))
        return str(res)

    async def get_status(self, activation_id: str) -> Dict[str, Any]:
        """
        Action: getStatus
        Returns JSON: { "status": true, "message": "STATUS_OK:123456" }
        or { "status": false, "message": "STATUS_WAIT_CODE" }
        """
        res = await self._request("getStatus", json_response=True, id=activation_id)
        if isinstance(res, dict):
            return res
        return {"status": False, "message": str(res)}

    async def get_services_list(self) -> Dict[str, Any]:
        """
        Action: getServicesList
        Returns JSON: { "services": [ { "id": 1, "name": "WhatsApp" }, ... ] }
        """
        res = await self._request("getServicesList", json_response=True)
        if isinstance(res, dict) and "services" in res:
            return res
        return {"services": []}

    async def get_countries_list(self, service_id: Optional[Union[int, str]] = None) -> Dict[str, Any]:
        """
        Action: getCountriesList
        Returns JSON: { "countries": [ { "id": 1, "name": "Afghanistan" }, ... ] }
        """
        params = {}
        if service_id is not None:
            params["service"] = str(service_id)
        res = await self._request("getCountriesList", json_response=True, **params)
        if isinstance(res, dict) and "countries" in res:
            return res
        return {"countries": []}

    async def get_prices(
        self,
        service_id: Optional[Union[int, str]] = None,
        country_id: Optional[Union[int, str]] = None
    ) -> Dict[str, Any]:
        """
        Action: getPrices
        Returns nested JSON matrix with all providers separated:
        {
          "<countryId>": {
            "<serviceId>": {
              "price": 114,
              "count": 5833347,
              "providers": {
                "grizzlysms": { "count": 5833347, "price": 114, "provider_id": "grizzlysms" },
                "lastsms": { "count": 79988, "price": 4, "provider_id": "lastsms" }
              }
            }
          }
        }
        """
        params = {}
        if service_id is not None:
            params["service"] = str(service_id)
        if country_id is not None:
            params["country"] = str(country_id)
        res = await self._request("getPrices", json_response=True, **params)
        if isinstance(res, dict):
            return res
        return {}

    async def get_numbers_status(self) -> Dict[str, Any]:
        """
        Action: getNumbersStatus
        Returns JSON object with active/received numbers details.
        """
        res = await self._request("getNumbersStatus", json_response=True)
        if isinstance(res, dict):
            return res
        return {}

    async def fetch_all_data(self) -> Dict[str, Any]:
        """
        Fetches the complete pricing matrix via get_prices().
        """
        return await self.get_prices()

# Singleton instance & backwards-compatibility alias
nexnum_mgr = NexNumManager()
unified_sms_mgr = nexnum_mgr
UnifiedSmsManager = NexNumManager

