import sys
import os
import asyncio
import logging
from pathlib import Path
from typing import Optional, Dict
from dotenv import load_dotenv

_bot_project_dir = Path(__file__).resolve().parent
while _bot_project_dir.name != "bot_project" and _bot_project_dir.parent != _bot_project_dir:
    _bot_project_dir = _bot_project_dir.parent
if str(_bot_project_dir) not in sys.path:
    sys.path.insert(0, str(_bot_project_dir))

import redis.asyncio as redis
from .config import REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_DB, ENABLE_REDIS

load_dotenv()

logger = logging.getLogger('redis_manager')

class RedisManager:
    """
    Loop-safe, thread-safe Redis connection manager.
    Maintains a separate Redis client and ConnectionPool per running asyncio event loop.
    Purges closed loops automatically. Contains ZERO cross-loop locks to guarantee
    no 'is bound to a different event loop' errors ever occur.
    """
    def __init__(self):
        self._clients: Dict[asyncio.AbstractEventLoop, redis.Redis] = {}

        # Configurable timeouts & retries
        self.MAX_RETRIES = 3              # Max attempts when connecting
        self.RETRY_DELAY = 1              # Base delay in seconds
        self.MAX_BACKOFF = 5              # Cap exponential back-off
        self.SOCKET_TIMEOUT = 5           # Per-operation timeout
        self.SOCKET_CONNECT_TIMEOUT = 5   # TCP connect timeout
        self.POOL_SIZE = 200
        self.HEALTH_CHECK_INTERVAL = 15

    def _purge_closed_loops(self):
        """Remove any event loops that have closed."""
        for loop in list(self._clients.keys()):
            if loop.is_closed():
                client = self._clients.pop(loop, None)
                if client is not None:
                    try:
                        asyncio.create_task(client.close())
                    except Exception:
                        pass

    async def connect(self) -> bool:
        """Establish connection pool for current running asyncio event loop."""
        if not ENABLE_REDIS:
            logger.info("Redis is disabled via ENABLE_REDIS=False configuration.")
            return False

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.error("redis_manager.connect() called outside of a running asyncio event loop.")
            return False

        if loop.is_closed():
            return False

        self._purge_closed_loops()

        if loop in self._clients and self._clients[loop] is not None:
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
            client = redis.Redis(
                connection_pool=pool,
                retry_on_timeout=True,
                socket_timeout=self.SOCKET_TIMEOUT,
                socket_connect_timeout=self.SOCKET_CONNECT_TIMEOUT,
                decode_responses=True
            )

            await asyncio.wait_for(client.ping(), timeout=self.SOCKET_CONNECT_TIMEOUT)
            self._clients[loop] = client
            logger.info("Successfully connected to Redis")
            return True

        except asyncio.TimeoutError:
            logger.warning("Redis ping timeout during connect()")
        except Exception as e:
            logger.warning(f"Failed to connect to Redis: {e}")

        self._clients[loop] = None
        return False

    async def ensure_connection(self) -> bool:
        """Make sure current loop has a live connection; retry with exponential backoff."""
        if not ENABLE_REDIS:
            return False

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return False

        if loop.is_closed():
            return False

        client = self._clients.get(loop)
        if client is not None:
            try:
                await client.ping()
                return True
            except Exception:
                self._clients[loop] = None

        for attempt in range(1, self.MAX_RETRIES + 1):
            if await self.connect():
                return True
            delay = min(self.RETRY_DELAY * (2 ** (attempt - 1)), self.MAX_BACKOFF)
            logger.warning(f"Redis connection attempt {attempt}/{self.MAX_RETRIES} failed. Retrying in {delay}s...")
            await asyncio.sleep(delay)

        logger.warning("Redis unavailable — system operating with PostgreSQL database fallback.")
        return False

    async def get_client(self) -> Optional[redis.Redis]:
        """Return a connected client for the CURRENT asyncio event loop, or None."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return None

        if loop.is_closed():
            return None

        if not await self.ensure_connection():
            return None
        return self._clients.get(loop)

    @property
    def redis_client(self) -> Optional[redis.Redis]:
        """Backward compatibility property — gets client for current running loop synchronously if available."""
        try:
            loop = asyncio.get_running_loop()
            if loop.is_closed():
                return None
            return self._clients.get(loop)
        except RuntimeError:
            return None

    async def close(self):
        """Close clients across all registered loops."""
        for loop, client in list(self._clients.items()):
            if client is not None:
                try:
                    await client.close()
                except Exception:
                    pass
        self._clients.clear()
        logger.info("Redis connection closed.")

redis_manager = RedisManager()
