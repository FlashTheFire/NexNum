import sys
import os
import asyncio
import logging
from pathlib import Path
from typing import Optional
from dotenv import load_dotenv

_bot_project_dir = Path(__file__).resolve().parent
while _bot_project_dir.name != "bot_project" and _bot_project_dir.parent != _bot_project_dir:
    _bot_project_dir = _bot_project_dir.parent
if str(_bot_project_dir) not in sys.path:
    sys.path.insert(0, str(_bot_project_dir))

import redis.asyncio as redis
from .config import REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB, ENABLE_REDIS

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('application.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger('redis_manager')

class RedisManager:
    def __init__(self):
        self.redis_client = None
        self.connection_lock = asyncio.Lock()

        # Configurable timeouts & retries
        self.MAX_RETRIES = 3              # Max attempts when connecting
        self.RETRY_DELAY = 1              # Base delay in seconds
        self.MAX_BACKOFF = 5              # Cap exponential back-off
        self.SOCKET_TIMEOUT = 5           # Per-operation timeout
        self.SOCKET_CONNECT_TIMEOUT = 5   # TCP connect timeout
        self.POOL_SIZE = 20
        self.HEALTH_CHECK_INTERVAL = 15

    async def connect(self) -> bool:
        """Establish connection pool and do an initial ping (with timeout)."""
        if not ENABLE_REDIS:
            logger.info("Redis is disabled via ENABLE_REDIS=False configuration.")
            return False

        if self.redis_client:
            return True

        async with self.connection_lock:
            if self.redis_client:
                return True

            try:
                pool = redis.ConnectionPool(
                    host=REDIS_HOST,
                    port=REDIS_PORT,
                    db=REDIS_DB,
                    password=REDIS_PASSWORD if REDIS_PASSWORD else None,
                    decode_responses=True,
                    max_connections=self.POOL_SIZE,
                    socket_timeout=self.SOCKET_TIMEOUT,
                    socket_connect_timeout=self.SOCKET_CONNECT_TIMEOUT,
                    socket_keepalive=True,
                    health_check_interval=self.HEALTH_CHECK_INTERVAL
                )
                self.redis_client = redis.Redis(
                    connection_pool=pool,
                    retry_on_timeout=True,
                    socket_timeout=self.SOCKET_TIMEOUT,
                    socket_connect_timeout=self.SOCKET_CONNECT_TIMEOUT,
                    decode_responses=True
                )

                await asyncio.wait_for(self.redis_client.ping(), timeout=self.SOCKET_CONNECT_TIMEOUT)
                logger.info("Successfully connected to Redis")
                return True

            except asyncio.TimeoutError:
                logger.warning("Redis ping timeout during connect()")
            except Exception as e:
                logger.warning(f"Failed to connect to Redis: {e}")

            self.redis_client = None
            return False

    async def ensure_connection(self) -> bool:
        """Make sure we have a live connection; retry with exponential backoff."""
        if not ENABLE_REDIS:
            return False

        if self.redis_client:
            try:
                await self.redis_client.ping()
                return True
            except Exception:
                self.redis_client = None

        for attempt in range(1, self.MAX_RETRIES + 1):
            if await self.connect():
                return True
            delay = min(self.RETRY_DELAY * (2 ** (attempt - 1)), self.MAX_BACKOFF)
            logger.warning(f"Redis connection attempt {attempt}/{self.MAX_RETRIES} failed. Retrying in {delay}s...")
            await asyncio.sleep(delay)

        logger.warning("Redis unavailable — system operating with PostgreSQL database fallback.")
        return False

    async def get_client(self) -> Optional[redis.Redis]:
        """Return a connected client, or None if connection failed or Redis is disabled."""
        if not await self.ensure_connection():
            return None
        return self.redis_client

    async def close(self):
        if self.redis_client:
            await self.redis_client.close()
            self.redis_client = None
            logger.info("Redis connection closed.")

redis_manager = RedisManager()
