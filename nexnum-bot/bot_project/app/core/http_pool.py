# app/core/http_pool.py
from __future__ import annotations

import logging
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

_async_client: Optional[httpx.AsyncClient] = None


async def get_http_client() -> httpx.AsyncClient:
    """
    Returns a shared singleton httpx.AsyncClient with connection pooling.
    Prevents connection leaks and socket exhaustion under high load.
    """
    global _async_client
    if _async_client is None or _async_client.is_closed:
        _async_client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
            follow_redirects=True,
        )
        logger.info("[HTTPPool] Shared AsyncClient pool initialized (max=100, keepalive=20).")
    return _async_client


async def close_http_pool():
    """Close the HTTP client pool gracefully on application shutdown."""
    global _async_client
    if _async_client and not _async_client.is_closed:
        await _async_client.aclose()
        _async_client = None
        logger.info("[HTTPPool] Shared AsyncClient pool closed.")
