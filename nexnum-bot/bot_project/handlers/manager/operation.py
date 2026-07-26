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
    SERVICE_INDEX, SERVICE_PREFIX,
    INLINE_CACHE_PREFIX, CACHE_DURATION,
    CACHE_RESULTS_PER_PAGE, CACHE_EXPIRY,
    APP_COUNT, BOT_TOKEN, CHANNEL_ID,
    CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET,
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
# Configure Cloudinary
cloudinary.config(
    cloud_name=CLOUDINARY_CLOUD_NAME,
    api_key=CLOUDINARY_API_KEY,
    api_secret=CLOUDINARY_API_SECRET
)

# Module-level logger for utility functions that do not carry self.logger
logger = logging.getLogger(__name__)

# --------------- Redis Lua Scripts ---------------
# Atomically validates and applies a balance update in a single round-trip.
# KEYS[1] = user hash key, ARGV[1] = amount (string), ARGV[2] = 'credit'|'debit'
# Returns: [ok (0|1), previous_balance (string), new_balance (string)]
_BALANCE_UPDATE_LUA = """
local key = KEYS[1]
local amount = tonumber(ARGV[1])
local tx_type = ARGV[2]
-- Guard: reject zero or negative amounts before touching any state.
if not amount or amount <= 0 then
    return {0, "invalid_amount", "0"}
end
local current = tonumber(redis.call('HGET', key, 'balance')) or 0
if tx_type == 'debit' then
    if current < amount then
        return {0, tostring(current), tostring(current)}
    end
    local new_bal = current - amount
    redis.call('HSET', key, 'balance', tostring(new_bal))
    return {1, tostring(current), tostring(new_bal)}
end
local new_bal = current + amount
redis.call('HSET', key, 'balance', tostring(new_bal))
return {1, tostring(current), tostring(new_bal)}
"""

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
    """Manage order operations with Redis asynchronously."""
    
    def __init__(self, redis_manager: RedisManager, enable_logging: bool = True):
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
        """Ensure Redis keys are initialized asynchronously."""
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
        """Ensure Redis connection is established asynchronously."""
        await self.ensure_initialized()
        return await self.redis_manager.get_client()

    @handle_redis_exceptions
    async def _init_search_indexes(self):
        """Initialize Redis search indexes for orders asynchronously."""
        await self._init_logger()
        redis_client = await self.ensure_connection()
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
        base_order_id = await self.redis_manager.redis_client.incr("main_data:order_id")
        timestamp = int(time.time())
        combined = f"{user_id}-{base_order_id}-{timestamp}"
        order_id = int(hashlib.sha256(combined.encode()).hexdigest(), 16) % (10**16)
        return {'response': True, 'result': order_id} if order_id else {'response': False, 'error': 'Failed to generate order ID'}

    @handle_redis_exceptions
    async def add_order_data(self, order_id: str, user_id: str, data: dict) -> dict:
        """Add new order with search indexing in Redis and persistent storage in PostgreSQL."""
        await self._init_logger()
        redis_client = await self.ensure_connection()
        
        order_info_key = f"{ORDER_INFO_PREFIX}info:{order_id}"
        
        current_time = time.time()
        data.setdefault('recorded_at', current_time)
        data['search_tags'] = " ".join(filter(None, [
            data.get('app_name', ''),
            data.get('order_status', ''),
            data.get('country_code', ''),
            str(data.get('server_id', '')),
            str(order_id),
            str(user_id)
        ]))
        async with redis_client.pipeline(transaction=True) as pipe:
            await pipe.hset(order_info_key, mapping=data)
            await pipe.execute()

        # Persist order to PostgreSQL so history is never lost
        try:
            amount = float(data.get('order_amount', 0.0) or 0.0)
            service_name = str(data.get('app_name', 'N/A'))
            country_name = str(data.get('country_code', 'N/A'))
            status = str(data.get('order_status', 'PENDING'))
            provider = str(data.get('server_id', '1'))
            await db_adapter.create_purchase_order(
                telegram_id=str(user_id),
                service_name=service_name,
                country_name=country_name,
                amount=amount,
                status=status,
                provider=provider,
                activation_id=str(order_id)
            )
        except Exception as e:
            await self.logger.warning(f"Failed to persist purchase order {order_id} to PostgreSQL: {e}")

        return {'response': True, 'message': "ORDER-ADDED", 'order_id': order_id}

    @handle_redis_exceptions
    async def get_order_data(self, order_id: str) -> dict:
        """Get order details asynchronously."""
        await self._init_logger()
        key = f"{ORDER_INFO_PREFIX}info:{order_id}"
        order_data = await self.redis_manager.redis_client.hgetall(key)
        if order_data:
            order_data['id'] = key
            return {'response': True, 'result': order_data}
        else:
            return {'response': False, 'error': 'ORDER-NOT-FOUND'}

    @handle_redis_exceptions
    async def update_order_status(self, order_id: str, status: str) -> dict:
        """Update order status with validation in Redis and PostgreSQL."""
        await self._init_logger()
        valid_statuses = {'PENDING', 'COMPLETED', 'CANCELLED', 'FAILED', 'TIMEOUT', 'PROCESSING'}
        if status not in valid_statuses:
            return {'response': False, 'error': 'Invalid status'}

        order_data = await self.get_order_data(order_id)
        if not order_data.get('response'):
            return {'response': False, 'error': 'Order not found'}

        order_info_key = f"{ORDER_INFO_PREFIX}info:{order_id}"
        update_data = {'order_status': status}
        
        await self.redis_manager.redis_client.hset(order_info_key, mapping=update_data)

        # Update in PostgreSQL
        try:
            await db_adapter.update_purchase_order_status(str(order_id), status)
        except Exception as e:
            await self.logger.warning(f"Failed to update purchase order status for {order_id} in PostgreSQL: {e}")

        return {'response': True, 'message': f'Order status updated to {status}'}

    @handle_redis_exceptions
    async def update_order_fields(self, order_id: str, fields: dict) -> dict:
        """Update specific fields of an order asynchronously."""
        await self._init_logger()
        order_data = await self.get_order_data(order_id)
        if not order_data.get('response'):
            return {'response': False, 'error': 'Order not found'}

        order_info_key = f"{ORDER_INFO_PREFIX}info:{order_id}"
        await self.redis_manager.redis_client.hset(order_info_key, mapping=fields)
        return {'response': True, 'message': 'Order fields updated successfully'}

    @handle_redis_exceptions
    async def update_order_success(self, order_id: str, sms: str, timeout: float, order_status: str, refund_status: str) -> dict:
        """Update success of an order using Redis pipeline asynchronously."""
        await self._init_logger()
        redis_client = await self.ensure_connection()
        order_info_key = f"{ORDER_INFO_PREFIX}info:{order_id}"
        
        order_data = await self.get_order_data(order_id)
        if not order_data.get('response'):
            return {'response': False, 'error': 'Order not found'}
        
        order_info = order_data.get('result', {})
        try:
            current_sms_list = json.loads(order_info.get('sms_list', '[]'))
        except Exception:
            current_sms_list = []
            await self.logger.warning(f'Invalid sms_list format: {order_info.get("sms_list", "[]")}')
        try:
            current_history = json.loads(order_info.get('order_history', '[]'))
        except Exception:
            current_history = []
            await self.logger.warning(f'Invalid order_history format: {order_info.get("order_history", "[]")}')

        if not isinstance(current_sms_list, list):
            await self.logger.warning(f'current_sms_list is not a list: {current_sms_list}')
            current_sms_list = []
        if not isinstance(current_history, list):
            await self.logger.warning(f'current_history is not a list: {current_history}')
            current_history = []
        
        sms_list = current_sms_list + [sms]
        current_history.append({
            "timestamp": time.time(),
            "action": "SMS_RECEIVED",
            "sms": sms
        })
        
        updates = {
            'last_sms': sms,
            'sms_list': json.dumps(sms_list),
            'sms_count': len(sms_list),
            'order_history': json.dumps(current_history),
            'refund_status': refund_status,
            'order_status': order_status,
            'timeout': timeout
        }
        
        await redis_client.hset(order_info_key, mapping=updates)
        return {'response': True, 'message': 'Order updated successfully'}

    @handle_redis_exceptions
    async def cancel_order(self, order_id: str, user_id: str, status: str = 'CANCELLED') -> dict:
        """Cancel an order and process refund asynchronously."""
        await self._init_logger()
        await self.logger.info(f"Attempting to cancel order {order_id} for user {user_id}")
        
        order_data = await self.get_order_data(order_id)
        if not order_data.get('response'):
            await self.logger.warning(f"Order {order_id} not found during cancellation")
            return {'response': False, 'error': 'Order not found'}

        order_info = order_data.get('result', {})
        if order_info.get('order_status') in ['CANCELLED', 'TIMEOUT']:
            await self.logger.info(f"Order {order_id} was already {status}")
            return {'response': False, 'error': f'Order already {status}'}

        order_info_key = f"{ORDER_INFO_PREFIX}info:{order_id}"
        
        await self.logger.info(f"Updating order status to {status.lower()} for order {order_id}")
        
        if order_info.get('refund_status') == 'true':
            return {'response': False, 'error': 'Order is already refunded'}
        if order_info.get('order_status') == 'PROCESSING':
            return {'response': False, 'error': 'Order status is PROCESSING'}
        if order_info.get('sms_list', '[]') != '[]':
            return {'response': False, 'error': 'Order has SMS'}
        if order_info.get('last_sms'):
            return {'response': False, 'error': 'Order has SMS'}

        try:
            history = json.loads(order_info.get('order_history', '[]'))
        except Exception:
            await self.logger.warning("Failed to load order_history, initializing new history list")
            history = []
        history.append({
            "timestamp": time.time(),
            "action": f"ORDER_{status}"
        })

        updates = {
            'order_status': status,
            'refund_status': 'true',
            'cancelled_at': datetime.utcnow().isoformat(),
            'order_history': json.dumps(history)
        }
        
        async with self.redis_manager.redis_client.pipeline(transaction=True) as pipe:
            await pipe.hset(order_info_key, mapping=updates)
            await pipe.execute()

        await self.logger.info(f"Successfully {status.lower()} order {order_id} with refund")
        return {'response': True, 'message': f'Order {status} and refunded successfully'}

    @handle_redis_exceptions
    async def search_orders_advanced(self, filters: dict, sort_by: str = None, sort_asc: bool = True, offset: int = 0, limit: int = 10) -> dict:
        """Search orders with advanced filtering."""
        await self._init_logger()
        redis_client = await self.ensure_connection()
        query_str = await self.build_query(filters)
        
        await self.logger.info(f"Searching orders with query: {query_str}")
        query = Query(query_str).paging(offset, limit)
        if sort_by:
            query.sort_by(sort_by, asc=sort_asc)

        results = await redis_client.ft(ORDER_INFO_INDEX).search(query)
        orders = await asyncio.gather(*[self.process_doc(doc) for doc in results.docs])
        return {'response': True, 'total_orders': results.total, 'results': orders}

    @handle_redis_exceptions
    async def search_current_orders(self, query_str: str = "*", sort_by: str = None, sort_asc: bool = True, limit: int = 10, offset: int = 0) -> dict:
        """Search current orders with advanced filtering."""
        await self._init_logger()
        redis_client = await self.ensure_connection()
        
        base_query = "(@order_status:(PENDING|PROCESSING))"
        if query_str != "*":
            base_query += f" ({query_str})"
        
        query = Query(base_query).paging(offset, limit)
        if sort_by:
            query.sort_by(sort_by, asc=sort_asc)
        
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
        Ultra-fast order aggregation using RediSearch.

        Returns:
            {
                "total_amount": float,
                "count": int,
                "order_ids": List[[float order_amount,
                                   float recorded_at,
                                   str order_number]]
            }
        """
        return_ids = filters.pop("_return_ids", False)
        sort_specs = filters.pop("sort", [])

        try:
            # 1) Build query
            query_str = await self.build_query(filters)

            # 2) Aggregation command
            agg_cmd = [
                "FT.AGGREGATE",
                ORDER_INFO_INDEX,
                query_str,
                "GROUPBY", "0",
                "REDUCE", "SUM", "1", "@order_amount", "AS", "total_amount",
                "REDUCE", "COUNT", "0", "AS", "count"
            ]

            # 3) Optional: build ID fetch command using FT.AGGREGATE
            id_cmd: Optional[List[Any]] = None
            if return_ids:
                id_cmd = [
                    "FT.AGGREGATE",
                    ORDER_INFO_INDEX,
                    query_str,
                    "LOAD", "3", "__key", "order_amount", "recorded_at"
                ]

                if sort_specs:
                    id_cmd += ["SORTBY", str(len(sort_specs) * 2)]
                    for spec in sort_specs:
                        redis_field = self.FIELD_MAP[spec["field"]]
                        id_cmd += [f"@{redis_field}", spec["direction"]]

                if limit is not None:
                    id_cmd += ["LIMIT", "0", str(limit)]

            # 4) Pipeline both commands
            pipe = self.redis_manager.redis_client.pipeline(transaction=False)
            pipe.execute_command(*agg_cmd)
            if id_cmd:
                pipe.execute_command(*id_cmd)

            results = await pipe.execute()

            # 5) Parse aggregation result
            output = {"total_amount": 0.0, "count": 0}
            if results[0] and len(results[0]) > 1:
                row = results[0][1]
                data = {row[i]: row[i+1] for i in range(0, len(row), 2)}
                output["total_amount"] = float(data.get("total_amount", 0))
                output["count"] = int(data.get("count", 0))

            # 6) Add order IDs if requested
            if return_ids and len(results) > 1:
                _, *rows = results[1]
                order_rows = []
                for row in rows:
                    row_dict = {row[i]: row[i+1] for i in range(0, len(row), 2)}
                    raw_key = row_dict.get("__key")
                    if raw_key:
                        order_number = await self.extract_order_number(raw_key)
                        order_rows.append([
                            float(row_dict.get("order_amount", 0)),
                            float(row_dict.get("recorded_at", 0)),
                            order_number
                        ])

                output["order_ids"] = order_rows

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
        Reserve: pick a random free number with HRANDFIELD, mark it reserved
        Add:    embed the SMS code into that number via its order_id
        Status: look up status by stripping prefix→num
        Cancel: same, but reset that field
        """
        numbers_key = f"free_numbers:{country_id}:{server_id}:{app_id}:{operator}"
        logger.debug("manage_number_order key: %s", numbers_key)
        # helper to decode a single hash-field:
        async def get_data(num: str) -> Dict[str, Any]:
            raw = await redis_client.hget(numbers_key, num)
            return json.loads(raw) if raw else {}

        # helper to write back a single field
        async def set_data(num: str, data: Dict[str, Any]):
            await redis_client.hset(numbers_key, num, json.dumps(data))

        # ────────────── RESERVE ──────────────
        if action == "reserve":
            now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

            # try up to N times to find a free number
            for _ in range(1000):  
                num = await redis_client.hrandfield(numbers_key)
                if not num:
                    return {"status": False, "message": "NO_NUMBERS"}

                # Redis returns bytes if decode_responses=False; normalize:
                if isinstance(num, bytes):
                    num = num.decode()

                logger.debug("manage_number_order: attempting to reserve %s", num)
                data = await get_data(num)
                logger.debug("manage_number_order: data for %s: %s", num, data)
                # skip if already used
                if data.get("sms_received"):
                    logger.debug("manage_number_order: %s already has SMS, skipping", num)
                    continue
                logger.debug("manage_number_order: checking user_id=%s against %s", user_id, num)
                if int(user_id) in data.get("user_ids", []):
                    logger.debug("manage_number_order: %s already reserved by user %s, skipping", num, user_id)
                    continue

                # now reserve this `num`
                new_order = order_id or f"{ORDER_PREFIX}{num}"
                logger.info("manage_number_order: reserved %s → %s", num, new_order)
                data.update({
                    "order_id":    new_order,
                    "sms_received": True,
                    "sms_waiting":  "STATUS_WAIT_CODE",
                    "reserved_at":  now_iso,
                    # track multiple reservers if you want:
                    "user_ids":    data.get("user_ids", []) + ([user_id] if user_id else [])
                })
                await self.add_candidates(num)
                await set_data(num, data)

                return {
                    "status":   True,
                    "number":   num,
                    "order_id": new_order,
                    "details":  data
                }

            return {"status": False, "message": "NO_NUMBERS"}

        # For add/status/cancel we reconstruct the number from the order_id:
        if not order_id or not order_id.startswith(ORDER_PREFIX):
            return {"status": False, "message": "INVALID_ORDER_ID"}

        num = order_id[len(ORDER_PREFIX):]  # strip prefix to get the phone

        data = await get_data(num)
        if not data:
            return {"status": False, "message": "STATUS_WAIT_CODE"}

        # ────────────── ADD SMS CODE ──────────────
        if action == "add":
            if not sms_code:
                return {"status": False, "message": "NO_SMS_CODE"}
    
            data["sms_waiting"] = f"STATUS_OK:{sms_code}"
            await set_data(num, data)

            return {
                "status":      True,
                "number":      num,
                "order_id":    order_id,
                "sms_waiting": data["sms_waiting"]
            }

        # ────────────── STATUS ──────────────
        if action == "status":
            sms_waiting = data.get("sms_waiting", "STATUS_WAIT_CODE")
            reserved_at = data.get("reserved_at")

            # auto-cancel after 10 minutes
            if reserved_at:
                try:
                    then = datetime.strptime(reserved_at, "%Y-%m-%dT%H:%M:%SZ")
                    if sms_waiting == "STATUS_WAIT_CODE" and datetime.utcnow() - then > timedelta(minutes=10):
                        data["sms_waiting"] = "STATUS_CANCEL"
                        await set_data(num, data)
                        sms_waiting = "STATUS_CANCEL"
                except ValueError:
                    pass

            return {
                "status":      True,
                "order_id":    order_id,
                "number":      num,
                "sms_waiting": sms_waiting
            }

        # ────────────── CANCEL ──────────────
        if action == "cancel":
            if data.get("sms_waiting") != "STATUS_WAIT_CODE":
                return {"status": False, "message": "STATUS_CANCEL"}

            data.update({
                "order_id":     "",
                "sms_received": False,
                "sms_waiting":  "",
                "reserved_at":  "",
                "user_ids":     []
            })
            await set_data(num, data)

            return {
                "status":  True,
                "message": "Number canceled successfully",
                "number":  num
            }

        return {"status": False, "message": "INVALID_ACTION"}
    
    async def get_candidates(self) -> List[str]:
        """
        Fetches the JSON‐encoded list of candidate numbers from Redis.
        Returns an empty list if key is missing or invalid.
        """
        raw = await self.redis_manager.redis_client.get(self.CANDIDATES_KEY)
        if not raw:
            return []
        # raw might be bytes or str
        if isinstance(raw, (bytes, bytearray)):
            raw = raw.decode("utf-8", errors="ignore")
        try:
            data = json.loads(raw)
            # ensure it's a list of strings
            if isinstance(data, list):
                return [str(item) for item in data]
        except json.JSONDecodeError:
            pass
        return []

    async def add_candidates(self, new: Union[str, List[str]]) -> None:
        """
        Adds one or more new candidate numbers to the Redis list,
        avoiding duplicates, and re‐saves as JSON.
        """
        # normalize to a flat list of strings
        if isinstance(new, str):
            to_add = [new]
        else:
            to_add = [str(x) for x in new]

        current = await self.get_candidates()
        # union while preserving order
        updated = current[:]
        for num in to_add:
            if num not in updated:
                updated.append(num)

        # save back to Redis
        await self.redis_manager.redis_client.set(
            self.CANDIDATES_KEY,
            json.dumps(updated)
        )

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
            # Assume financial_summary_mgr is defined elsewhere
            data = await financial_mgr.get_user(user_id)
            if not data or not data.get('response'):
                await self.logger.error("User data response indicated failure.")
                return None

            if forum_id is None:
                profile_key = f"user_data:{user_id}:profile:main"
                forum_id = await self.redis_manager.redis_client.hget(profile_key, "forum_id")

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
                    profile_key = f"user_data:{user_id}:profile:main"
                    forum_message_id = await self.redis_manager.redis_client.hget(profile_key, "forum_message_id")
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
            
            profile_key = f"user_data:{user_id}:profile:main"
            forum_id = await self.redis_manager.redis_client.hget(profile_key, "forum_id")
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
                    profile_key = f"{ORDER_INFO_PREFIX}info:{order_id}"
                    forum_message_id = await self.redis_manager.redis_client.hget(profile_key, "forum_message_id")
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
                    order_info_key = f"{ORDER_INFO_PREFIX}info:{order_id}"
                    await self.logger.info(f"Storing message_id: {message_id} for order: {order_id}")
                    await self.redis_manager.redis_client.hset(order_info_key, "forum_message_id", message_id)

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
            profile_key = f"user_data:{user_id}:profile:main"
            await self.redis_manager.redis_client.hset(profile_key, "forum_id", forum_data.get("message_thread_id"))
            return forum_data
        return None

    async def update_forum_topic(self, user_id: str, new_name: Optional[str] = None, new_icon_color: Optional[str] = None) -> Optional[dict]:
        await self._init_logger()
        profile_key = f"user_data:{user_id}:profile:main"
        forum_id = await self.redis_manager.redis_client.hget(profile_key, "forum_id")
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
        pattern = "user_data:*:profile:main"
        keys = await self.redis_manager.redis_client.keys(pattern)
        topics = {}
        for key in keys:
            forum_id = await self.redis_manager.redis_client.hget(key, "forum_id")
            if forum_id:
                topics[key] = {"forum_id": forum_id}
        return topics

    async def archive_forum_topic(self, user_id: str) -> Optional[dict]:
        await self._init_logger()
        profile_key = f"user_data:{user_id}:profile:main"
        forum_id = await self.redis_manager.redis_client.hget(profile_key, "forum_id")
        if not forum_id:
            return None
        
        payload = {"chat_id": self.channel_id, "message_thread_id": forum_id}
        result = await self._send_telegram_request('closeForumTopic', payload)
        
        if result and result.get("ok"):
            await self.redis_manager.redis_client.hset(profile_key, "forum_archived", "true")
            return result.get("result")
        return None

    async def reopen_forum_topic(self, user_id: str) -> Optional[dict]:
        await self._init_logger()
        profile_key = f"user_data:{user_id}:profile:main"
        forum_id = await self.redis_manager.redis_client.hget(profile_key, "forum_id")
        if not forum_id:
            return None
        
        payload = {"chat_id": self.channel_id, "message_thread_id": forum_id}
        result = await self._send_telegram_request('reopenForumTopic', payload)
        
        if result and result.get("ok"):
            await self.redis_manager.redis_client.hset(profile_key, "forum_archived", "false")
            return result.get("result")
        return None

    async def get_forum_topic_details(self, user_id: str) -> dict:
        await self._init_logger()
        profile_key = f"user_data:{user_id}:profile:main"
        forum_id = await self.redis_manager.redis_client.hget(profile_key, "forum_id")
        return {"forum_id": forum_id}
    
    # -------------- User Management Async Methods --------------
    @handle_redis_exceptions
    async def _init_search_indexes(self):
        """Creates RediSearch indexes with the defined schemas."""
        await self._init_logger()
        redis_client = await self.ensure_connection()

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

        service_schema = [
            TextField("record_id", sortable=True),
            TextField("search_tags", weight=1.0),
            TextField("is_show_server", weight=1.0),
            TextField("is_show_app", weight=1.0),
            TextField("is_show_country", weight=1.0),
            TextField("country_name", sortable=True),
            TextField("country_code", sortable=True),
            TextField("country_id"),
            TextField("server_name", sortable=True),
            TextField("server_id", sortable=True),
            TextField("app_id"),
            TextField("app_name", weight=5.0),
            TextField("app_code"),
            NumericField("app_price", sortable=True),
            NumericField("app_count", sortable=True)
        ]

        try:
            # Try USER_INFO_INDEX
            try:
                await redis_client.ft(USER_INFO_INDEX).info()
            except Exception as e:
                await self.logger.warning(f"USER_INFO_INDEX did not exist or could not be dropped: {e}")
                await create_index(USER_INFO_INDEX, user_schema, USER_INFO_PREFIX)
                

            # Try SERVICE_INDEX
            try:
                await redis_client.ft(SERVICE_INDEX).info()
            except Exception as e:
                await self.logger.warning(f"SERVICE_INDEX did not exist or could not be dropped: {e}")
                await create_index(SERVICE_INDEX, service_schema, SERVICE_PREFIX)
                

            await self.logger.info("UserManagement and Service indexes verified/created successfully")

        except RedisError as e:
            await self.logger.error(f"Redis error while creating indexes: {e}")
            raise


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
                user_id=db_user["id"],
                session_data={
                    "username": str(user_data.get("username", "") or ""),
                    "first_name": str(user_data.get("first_name", db_user.get("name", "")) or ""),
                    "last_name": str(user_data.get("last_name", "") or ""),
                    "language_code": str(user_data.get("language_code", "en") or "en"),
                    "status": "BANNED" if db_user.get("is_banned") else "ACTIVE",
                    "registration_date": datetime.utcnow().isoformat(),
                },
            )
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

            session = await db_adapter.get_user_session(db_user["id"]) or {}

            profile_dict = {
                "user_id": db_user["telegram_id"],
                "first_name": db_user.get("name") or session.get("first_name") or "",
                "status": "BANNED" if db_user.get("is_banned") else "ACTIVE",
                "balance": str(db_user.get("balance", 0.0)),
                "registration_date": session.get("registration_date") or datetime.utcnow().isoformat(),
                "username": session.get("username") or "",
                "last_name": session.get("last_name") or "",
                "language_code": session.get("language_code") or "en",
            }
            return {"response": True, "result": profile_dict}
        except Exception as e:
            await self.logger.error(f"Error fetching user data for {user_id}: {e}")
            return {"response": False, "error": str(e)}

    @handle_redis_exceptions
    async def update_user_status(self, user_id: str, new_status: str) -> dict:
        """Update user status in PostgreSQL only, preserving bot board metadata from user_sessions."""
        await self._init_logger()
        if new_status not in ["ACTIVE", "BANNED", "SUSPENDED", "INACTIVE"]:
            return {'response': False, 'error': 'Invalid status'}

        user_key = f"user_data:{user_id}:profile:main"
        try:
            session = await db_adapter.get_user_session(user_id) or {}
            is_banned = new_status in ["BANNED", "SUSPENDED"]
            await db_adapter.pool.connection() as conn:
                async with conn.cursor(row_factory=dict_row) as cur:
                    await cur.execute(
                        "UPDATE users SET is_banned = %s, updated_at = NOW() WHERE telegram_id = %s",
                        (is_banned, str(user_id)),
                    )
                    await cur.execute(
                        "UPDATE user_sessions SET menu_state = COALESCE(menu_state, '{}'::jsonb), "
                        "last_activity = NOW(), updated_at = NOW() WHERE user_id = %s",
                        (user_id,),
                    )
                    await conn.commit()

            board_id = session.get("forum_id")
            topic_id = session.get("forum_message_id")
            archive_flag = session.get("forum_archived", False)
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
        """Search users with advanced filtering."""
        await self._init_logger()
        try:
            redis_client = await self.ensure_connection()
            query = Query(query_str).paging(0, limit)
            if sort_by:
                query.sort_by(sort_by, asc=sort_asc)
            results = await redis_client.ft(USER_INFO_INDEX).search(query)
            users = [{k: v for k, v in doc.__dict__.items() if not k.startswith('__')} for doc in results.docs]
            return {'response': True, 'total': results.total, 'results': users}
        except Exception as e:
            await self.logger.error(f"Error searching users: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def get_user_value(self, user_id: str, field: str) -> dict:
        """Get a specific user field."""
        await self._init_logger()
        user_key = f"user_data:{user_id}:profile:main"
        try:
            redis_client = await self.ensure_connection()
            value = await redis_client.hget(user_key, field)
            return {'response': True, 'result': value}
        except Exception as e:
            await self.logger.error(f"Error getting user value for {user_id}: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def set_user_value(self, user_id: str, field: str, value) -> dict:
        """Set a specific user field in Redis and sync with PostgreSQL if applicable."""
        await self._init_logger()
        user_key = f"user_data:{user_id}:profile:main"
        try:
            redis_client = await self.ensure_connection()
            await redis_client.hset(user_key, field, value)

            if field in ["first_name", "name"]:
                await db_adapter.update_user(telegram_id=str(user_id), name=str(value))
            elif field == "status":
                is_banned = True if str(value) in ["BANNED", "SUSPENDED"] else False
                await db_adapter.update_user(telegram_id=str(user_id), is_banned=is_banned)

            return {'response': True, 'result': True}
        except Exception as e:
            await self.logger.error(f"Error setting user value for {user_id}: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def update_user_data(self, user_id: str, user_data: dict) -> dict:
        """Update user data in Redis and PostgreSQL with enhanced validation."""
        async with AsyncOperationContext(operation_lock_manager, OperationType.PROFILE_UPDATE, user_id):
            await self._init_logger()
            user_key = f"user_data:{user_id}:profile:main"
            try:
                redis_client = await self.ensure_connection()
                async with redis_client.pipeline(transaction=True) as pipe:
                    await pipe.hset(user_key, mapping=user_data)
                    await pipe.hset(user_key, "last_updated", str(time.time()))
                    await pipe.execute()

                name = user_data.get("first_name") or user_data.get("name")
                status = user_data.get("status")
                is_banned = (True if status in ["BANNED", "SUSPENDED"] else False) if status else None
                if name or is_banned is not None:
                    await db_adapter.update_user(telegram_id=str(user_id), name=name, is_banned=is_banned)

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
            response = await self.redis_manager.redis_client.execute_command(*cmd_ext)
            if not isinstance(response, list) or len(response) != 2:
                raise RuntimeError(f"Unexpected Redis response format: {response}")
            results, cursor = response
        except RedisError as e:
            print("Aggregation init failed:", e)
            raise RuntimeError("Redis aggregation initialization error") from e

        # First page
        if isinstance(results, list) and len(results) > 1:
            all_rows.extend(results[1:])

        # Paginated cursor reads
        while cursor:
            try:
                page = await self.redis_manager.redis_client.execute_command(
                    "FT.CURSOR", "READ", index, cursor
                )
                if not isinstance(page, list) or len(page) != 2:
                    raise RuntimeError(f"Unexpected cursor page format: {page}")
                rows, cursor = page
                if len(rows) > 1:
                    all_rows.extend(rows[1:])
            except RedisError as e:
                print("Cursor read failed:", e)
                raise RuntimeError("Redis cursor read error") from e

        await cache_manager.set(cache_key, all_rows, prefix=CachePrefix.TEMP)
        return all_rows

# ---------------- DepositManagement Class ----------------
class DepositManagement:
    """Manage deposit operations with Redis asynchronously."""
    
    def __init__(self, redis_manager: RedisManager, enable_logging: bool = True):
        """
        Initialize with a redis_manager instance.
        
        Args:
            redis_manager: An instance that provides an asynchronous Redis client.
        """
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
        """
        Build a structured query string from a dictionary of filters asynchronously.
        """
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
        """Ensure that a Redis connection is established asynchronously."""
        await self.ensure_initialized()
        return await self.redis_manager.get_client()

    @handle_redis_exceptions
    async def _init_search_indexes(self) -> None:
        """Initialize Redis search indexes for deposits asynchronously."""
        await self._init_logger()
        try:
            redis_client = await self.ensure_connection()
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
        """Generate a unique deposit ID asynchronously."""
        redis_client = await self.ensure_connection()
        base_deposit_id = await redis_client.incr("main_data:deposit_id")
        timestamp = int(time.time())
        combined = f"{user_id}-{base_deposit_id}-{timestamp}"
        deposit_id = int(hashlib.sha256(combined.encode()).hexdigest(), 16) % (10**16)
        return {'response': True, 'result': deposit_id} if deposit_id else {'response': False, 'error': 'Failed to generate deposit ID'}

    @handle_redis_exceptions
    async def add_deposit_data(self, deposit_id: str, user_id: str, data: Dict[str, Any]) -> dict:
        """Add a new deposit record with search indexing."""
        try:
            redis_client = await self.ensure_connection()
            deposit_info_key = f"{DEPOSIT_INFO_PREFIX}info:{deposit_id}"

            data.setdefault('recorded_at', time.time())
            data['search_tags'] = " ".join(filter(None, [
                data.get('deposit_status', ''),
                str(data.get('amount', '')),
                str(deposit_id),
                str(user_id)
            ]))

            async with redis_client.pipeline() as pipe:
                await pipe.hset(deposit_info_key, mapping=data)
                await pipe.execute()

            return {'response': True, 'message': "DEPOSIT-ADDED", 'deposit_id': deposit_id, 'user_id': user_id, 'result': data}
        except Exception as e:
            await self.logger.error(f"Error adding deposit data: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def get_deposit_data(self, deposit_id: str) -> dict:
        """Retrieve deposit details asynchronously."""
        await self._init_logger()
        try:
            redis_client = await self.ensure_connection()
            deposit_data = await redis_client.hgetall(f"{DEPOSIT_INFO_PREFIX}info:{deposit_id}")
            if deposit_data:
                await self.logger.info(f"Successfully retrieved deposit data for ID: {deposit_id}")
                return {'response': True, 'result': deposit_data}
            else:
                await self.logger.warning(f"Deposit not found for ID: {deposit_id}")
                return {'response': False, 'error': 'DEPOSIT-NOT-FOUND'}
        except Exception as e:
            await self.logger.error(f"Error retrieving deposit data for ID {deposit_id}: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def update_deposit_status(self, deposit_id: str, status: str) -> dict:
        """Update the status of a deposit after validating the new status."""
        try:
            valid_statuses = ['PENDING', 'COMPLETED', 'CANCELLED', 'FAILED', 'TIMEOUT']
            if status not in valid_statuses:
                return {'response': False, 'error': 'Invalid status'}

            deposit_data = await self.get_deposit_data(deposit_id)
            if not deposit_data['response']:
                return {'response': False, 'error': 'Deposit not found'}

            deposit_info_key = f"{DEPOSIT_INFO_PREFIX}info:{deposit_id}"
            redis_client = await self.ensure_connection()
            await redis_client.hset(deposit_info_key, 'deposit_status', status)

            return {'response': True, 'message': f'Deposit status updated to {status}'}
        except Exception as e:
            await self.logger.error(f"Error updating deposit status: {str(e)}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def update_deposit_fields(self, deposit_id: str, fields: Dict[str, Any]) -> dict:
        """Update specific fields of a deposit record."""
        try:
            deposit_data = await self.get_deposit_data(deposit_id)
            if not deposit_data['response']:
                return {'response': False, 'error': 'Deposit not found'}

            deposit_info_key = f"{DEPOSIT_INFO_PREFIX}info:{deposit_id}"
            redis_client = await self.ensure_connection()
            await redis_client.hset(deposit_info_key, mapping=fields)

            return {'response': True, 'message': 'Deposit fields updated successfully'}
        except Exception as e:
            await self.logger.error(f"Error updating deposit fields: {str(e)}")
            return {'response': False, 'error': str(e)}



    @handle_redis_exceptions
    async def update_deposit_success(self, bot, deposit_id: str, deposit_amount: str, timeout: float, api_status: Dict, deposit_status: str, valid_until: str) -> dict:
        """Update deposit success details (when deposit is confirmed)."""
        try:
            await self.logger.info(f"Dᴇᴘᴏsɪᴛ: Updating deposit success for deposit_id {deposit_id}")
            redis_client = await self.ensure_connection()
            deposit_info_key = f"{DEPOSIT_INFO_PREFIX}info:{deposit_id}"

            deposit_data = await self.get_deposit_data(deposit_id)
            if not deposit_data.get('response'):
                await self.logger.error(f"Dᴇᴘᴏsɪᴛ: Deposit not found for deposit_id {deposit_id}")
                return {'response': False, 'error': 'Deposit not found'}

            deposit_info = deposit_data.get('result', {})
            user_id = deposit_info.get('user_id')

            if not user_id:
                await self.logger.error(f"Dᴇᴘᴏsɪᴛ: User ID missing in deposit info for deposit_id {deposit_id}")
                return {'response': False, 'error': 'User ID missing in deposit info'}

            await self.logger.debug(f"Dᴇᴘᴏsɪᴛ: Handling deposit history for deposit_id {deposit_id}")
            try:
                current_history = json.loads(deposit_info.get('deposit_history', '[]'))
            except json.JSONDecodeError:
                await self.logger.warning(f"Dᴇᴘᴏsɪᴛ: Invalid JSON in deposit history for deposit_id {deposit_id}")
                current_history = []

            current_history.append({
                "timestamp": time.time(),
                "action": "DEPOSIT_CONFIRMED"
            })

            updates = {
                'deposit_amount': deposit_amount,
                'deposit_status': deposit_status,
                'timeout': str(timeout),
                'refund_status': 'false',
                'user_id': user_id,
                'api_status': json.dumps(api_status),
                'deposit_history': json.dumps(current_history)
            }

            await self.logger.info(f"Dᴇᴘᴏsɪᴛ: Updating Redis with new deposit info for deposit_id {deposit_id}")
            await redis_client.hset(deposit_info_key, mapping=updates)

            await self.logger.info(f"Dᴇᴘᴏsɪᴛ: Sending deposit notification for deposit_id {deposit_id}")
            await self.send_deposit_notification(
                bot,
                user_id,
                deposit_amount,
                deposit_id,
                api_status.get('gateway_name', 'N/A'),
                api_status.get('payment_mode', 'N/A'),
                valid_until
            )

            await self.logger.info(f"Dᴇᴘᴏsɪᴛ: Successfully updated deposit for deposit_id {deposit_id}")
            return {'response': True, 'message': 'Deposit updated successfully'}
        except Exception as e:
            await self.logger.error(f"Dᴇᴘᴏsɪᴛ: Error updating deposit for deposit_id {deposit_id}: {str(e)}", exc_info=True)
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def send_deposit_notification(self, bot: AsyncTeleBot, user_id: str, amount: float, deposit_id: str, paid_from: str, paid_type: str, valid_until: str) -> None:
        """Send a deposit notification message to both the user and the update channel."""
        try:
            await self.logger.info(f"Sending deposit notification for user {user_id}")
            
            data = await financial_mgr.get_user(user_id)
            if not isinstance(data, dict) or not data.get('response'):
                await self.logger.error(f"Failed to retrieve user data for user {user_id}")
                return

            metrics = data.get("metrics", {})
            user_name = data.get("user_profile", {})
            
            if metrics.get("deposits", {}).get("count", 0) == 1:
                forum_topic = await user_mgr.create_forum_topic(user_id, f"❯ {user_name} [{user_id}]")
                if forum_topic:
                    await self.logger.info(f"Created forum topic for first-time depositor: {forum_topic}")
            else:
                forum_topic = False

            profile_key = f"user_data:{user_id}:profile:main"
            forum_id = await self.redis_manager.redis_client.hget(profile_key, "forum_id")
    
            if forum_id:
                if not forum_topic:
                    message_id = await user_mgr.user_metrics_report(bot, 'edit_message_text', user_id, CHANNEL_ID)
                elif forum_topic:
                    from handlers.main.show_wallet import wallet_manager
                    message_id, _ = await asyncio.gather(
                        user_mgr.user_metrics_report(bot, 'sendMessage', user_id, CHANNEL_ID, forum_id),
                        wallet_manager.process_wallet_update(user_id),
                    )
                    message_id = await self.redis_manager.redis_client.hset(profile_key, "forum_message_id", str(message_id))
                    
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
                    msg = await bot.send_message(
                        chat_id=CHANNEL_ID,
                        text=admin_text,
                        reply_markup=admin_keyboard,
                        message_thread_id=int(forum_id),
                        parse_mode='HTML'
                    )
                except Exception as e:
                    await self.logger.error(f"Failed to send admin notification: {e}", exc_info=True)
                    return
    
                if msg:
                    message_id = msg.message_id
                    chat_id = msg.chat.id
                    if str(chat_id).startswith('-100'):
                        chat_id = 'c/' + str(chat_id)[4:]
    
                    link = f'https://t.me/{chat_id}/{forum_id}/{message_id}'
                    admin_keyboard.keyboard[0][1].url = link
    
                text = f'<b>💎 #Uᴘɪ_Cᴀʀᴅ_Dᴇᴘᴏsɪᴛ ❯</b>\n[<code>{paid_type}</code>][<code>{user_id}</code>][<code>{amount}</code>]'
    
                try:
                    await bot.send_message(
                        chat_id=CHANNEL_ID,
                        text=text,
                        reply_markup=admin_keyboard,
                        parse_mode='HTML'
                    )
                except Exception as e:
                    await self.logger.error(f"Failed to send final notification: {str(e)}")
        except Exception as e:
            await self.logger.error(f"Error sending deposit notification: {str(e)}")
        await self.logger.info("Deposit notification process completed")

    @handle_redis_exceptions
    async def aggregate_deposits(self, filters: Dict[str, Any]) -> Dict[str, float]:
        """
        Perform a RediSearch aggregation query to compute total deposit amount and count asynchronously.
        """
        await self._init_logger()
        try:
            query_str = await self.build_query(filters)
            await self.logger.info(f"Aggregation query: {query_str}")

            aggregation_query = [
                "FT.AGGREGATE", DEPOSIT_INFO_INDEX, query_str,
                "GROUPBY", "0",
                "REDUCE", "SUM", "1", "@deposit_amount", "AS", "total_amount",
                "REDUCE", "COUNT", "0", "AS", "count"
            ]

            result = await self.redis_manager.redis_client.execute_command(*aggregation_query)
            if not result or len(result) < 2:
                return {"total_amount": 0.0, "count": 0}

            total_amount = float(result[1][1]) if result[1][1] else 0.0
            count = int(result[1][3]) if result[1][3] else 0

            return {"total_amount": total_amount, "count": count}
        except Exception as e:
            await self.logger.error(f"Error aggregating deposits: {e}")
            return {"total_amount": 0.0, "count": 0}

    @handle_redis_exceptions
    async def cancel_deposit(self, deposit_id: str, user_id: str, status: str = 'CANCELLED') -> dict:
        """
        Cancel a deposit asynchronously (and process any refund logic if applicable).
        """
        await self._init_logger()
        await self.logger.info(f"Attempting to cancel deposit {deposit_id} for user {user_id}")

        deposit_data = await self.get_deposit_data(deposit_id)
        if not deposit_data.get('response'):
            await self.logger.warning(f"Deposit {deposit_id} not found during cancellation")
            return {'response': False, 'error': 'Deposit not found'}

        deposit_info = deposit_data.get('result', {})
        if deposit_info.get('deposit_status') in ['CANCELLED', 'TIMEOUT']:
            await self.logger.info(f"Deposit {deposit_id} was already {status}")
            return {'response': False, 'error': f'Deposit already {status}'}

        deposit_info_key = f"{DEPOSIT_INFO_PREFIX}info:{deposit_id}"
        await self.logger.info(f"Updating deposit status to {status.lower()} for deposit {deposit_id}")

        try:
            history = json.loads(deposit_info.get('deposit_history', '[]'))
        except Exception:
            await self.logger.warning("Failed to load deposit history, initializing new history list")
            history = []
        history.append({
            "timestamp": time.time(),
            "action": f"DEPOSIT_{status}"
        })

        updates = {
            'deposit_status': status,
            'cancelled_at': datetime.utcnow().isoformat(),
            'deposit_history': json.dumps(history)
        }

        redis_client = await self.ensure_connection()
        async with redis_client.pipeline(transaction=True) as pipe:
            await pipe.hset(deposit_info_key, mapping=updates)
            await pipe.execute()

        await self.logger.info(f"Successfully {status.lower()} deposit {deposit_id}")
        return {'response': True, 'message': f'Deposit {status} successfully'}

    @handle_redis_exceptions
    async def search_deposits_advanced(self, filters: dict, sort_by: str = None, sort_asc: bool = True, offset: int = 0, limit: int = 10) -> dict:
        """Search deposits with advanced filtering asynchronously."""
        await self._init_logger()
        try:
            redis_client = await self.ensure_connection()
            query_str = await self.build_query(filters)
            await self.logger.info(f"Searching deposits with query: {query_str}")

            query = Query(query_str).paging(offset, limit)
            if sort_by:
                query.sort_by(sort_by, asc=sort_asc)

            results = await redis_client.ft(DEPOSIT_INFO_INDEX).search(query)
            deposits = await asyncio.gather(*[
                asyncio.create_task(self.process_deposit_doc(doc))
                for doc in results.docs
            ])
            return {'response': True, 'total_deposits': results.total, 'results': deposits}
        except Exception as e:
            await self.logger.error(f"Error searching deposits: {e}")
            return {'response': False, 'error': str(e)}

    @handle_redis_exceptions
    async def search_current_deposits(self, query_str: str = "*", sort_by: str = None, sort_asc: bool = True, limit: int = 10, offset: int = 0) -> dict:
        """
        Search for current deposits using advanced filtering asynchronously.
        """
        await self._init_logger()
        try:
            redis_client = await self.ensure_connection()
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
        """Asynchronously retrieve financial summary via Redis user profile."""
        await self._init_logger()
        user_id_str = str(user_id)
        try:
            r = await redis_manager.get_client()
            profile_key = f"user_data:{user_id_str}:profile:main"
            profile = await r.hgetall(profile_key)
            if not profile:
                await self.user_mgr.create_user({"user_id": user_id_str})
                profile = await r.hgetall(profile_key)

            profile_dict = {
                (k.decode() if isinstance(k, bytes) else str(k)):
                (v.decode() if isinstance(v, bytes) else str(v))
                for k, v in profile.items()
            } if profile else {}

            balance = float(profile_dict.get("balance", 0.0) or 0.0)
            spend_balance = float(profile_dict.get("spend_balance", 0.0) or 0.0)
            total_deposited = float(profile_dict.get("total_deposited", 0.0) or 0.0)
            deposit_count = int(profile_dict.get("deposit_count", 0) or 0)
            total_orders = int(profile_dict.get("total_orders", 0) or 0)
            total_order_value = float(profile_dict.get("total_order_value", spend_balance) or spend_balance)

            first_name = profile_dict.get("first_name", "User") or "User"
            username = profile_dict.get("username", first_name) or first_name

            metrics = {
                "current_balance": balance,
                "spend_balance": spend_balance,
                "deposits": {
                    "total_amount": total_deposited,
                    "count": deposit_count
                },
                "orders": {
                    "total_amount": total_order_value,
                    "count": total_orders
                }
            }

            return {
                "response": True,
                "user_profile": username,
                "metrics": metrics,
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
        if not os.getenv("CLOUDINARY_API_KEY"):
            return svg_url
        try:
            result = cloudinary.uploader.upload(svg_url, resource_type="image", overwrite=True)
            return cloudinary.CloudinaryImage(result["public_id"]).build_url(format="png")
        except Exception as e:
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
            svg_url = f"https://hatscripts.github.io/circle-flags/flags/{country_code}.svg"
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
        Fetches the complete pricing matrix via get_prices() for auto_updater sync.
        """
        return await self.get_prices()

# Singleton instance & backwards-compatibility alias
nexnum_mgr = NexNumManager()
unified_sms_mgr = nexnum_mgr
UnifiedSmsManager = NexNumManager

