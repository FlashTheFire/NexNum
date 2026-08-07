# app/middleware/rate_limit.py
"""
Redis Sliding-Window Rate Limiter Middleware Dependency.
Limits request rates per API key / IP address.
"""

from __future__ import annotations

import time
import logging
from typing import Optional
from fastapi import Request, HTTPException, status

# pyrefly: ignore [missing-import]
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

REDIS_PREFIX = "nexsms"


class SlidingWindowRateLimiter:
    """
    Sliding-Window rate limiter using Redis sorted sets (ZSET).
    """

    @classmethod
    async def check_rate_limit(
        cls,
        request: Request,
        max_requests: int = 100,
        window_seconds: int = 60
    ) -> bool:
        """
        Check if request exceeds rate limit.
        """
        try:
            from utils.redis_manager import redis_manager
        except ImportError:
            from bot_project.utils.redis_manager import redis_manager

        redis_client = await redis_manager.get_client()
        if not redis_client:
            return True  # Fail-open if Redis unavailable

        # Identifier: API key or client IP
        api_key = request.headers.get("X-API-Key") or request.query_params.get("api_key")
        client_ip = request.client.host if request.client else "unknown"
        identifier = api_key or client_ip

        now = time.time()
        key = f"{REDIS_PREFIX}:ratelimit:{request.url.path}:{identifier}"
        clear_before = now - window_seconds

        try:
            pipe = redis_client.pipeline()
            pipe.zremrangebyscore(key, 0, clear_before)
            pipe.zcard(key)
            pipe.zadd(key, {str(now): now})
            pipe.expire(key, window_seconds + 5)
            results = await pipe.execute()

            request_count = results[1]
            if request_count >= max_requests:
                logger.warning(f"[RateLimiter] Path {request.url.path} rate limit exceeded for {identifier} ({request_count}/{max_requests})")
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded ({max_requests} requests per {window_seconds}s). Please slow down.",
                    headers={"Retry-After": str(window_seconds)}
                )

            return True
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"[RateLimiter] Error during rate limit check: {e}")
            return True
