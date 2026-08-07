# app/core/http_pool.py
from __future__ import annotations

import logging
from typing import Optional, Dict
import httpx
import asyncio

# Silence verbose httpx & httpcore HTTP GET/PATCH request logs (log only WARNING/ERROR)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

logger = logging.getLogger(__name__)

_async_clients: Dict[asyncio.AbstractEventLoop, httpx.AsyncClient] = {}


async def get_http_client() -> httpx.AsyncClient:
    """
    Returns a shared singleton httpx.AsyncClient with connection pooling per event loop.
    Prevents connection leaks and socket exhaustion under high load across event loops.
    """
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if current_loop is None:
        raise RuntimeError("get_http_client() must be called from within a running event loop")

    client = _async_clients.get(current_loop)

    if client is None or client.is_closed:
        # Cleanup closed loops/clients to prevent memory leaks in multi-loop environments
        closed_loops = []
        for loop, c in _async_clients.items():
            if c.is_closed or (hasattr(loop, 'is_closed') and loop.is_closed()):
                closed_loops.append(loop)

        for loop in closed_loops:
            _async_clients.pop(loop, None)

        client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
            follow_redirects=True,
        )
        _async_clients[current_loop] = client
        logger.info(f"[HTTPPool] Shared AsyncClient pool initialized for loop {id(current_loop)}.")

    return client


async def close_http_pool():
    """Close the HTTP client pool gracefully on application shutdown."""
    closed_count = 0
    for loop, client in list(_async_clients.items()):
        if client and not client.is_closed:
            try:
                await client.aclose()
                closed_count += 1
            except Exception:
                pass
    _async_clients.clear()
    if closed_count > 0:
        logger.info(f"[HTTPPool] {closed_count} Shared AsyncClient pool(s) closed.")
