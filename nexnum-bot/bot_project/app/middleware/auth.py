# app/middleware/auth.py
"""
API Key Authentication Dependency & Helper for nexnum-bot endpoints.
Validates X-API-Key header or api_key query parameter against server config.
"""

from __future__ import annotations

import os
import logging
from typing import Optional
from fastapi import Request, HTTPException, Security, status
from fastapi.security.api_key import APIKeyHeader, APIKeyQuery

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)
API_KEY_QUERY = APIKeyQuery(name="api_key", auto_error=False)


def get_expected_api_keys() -> set[str]:
    """Returns set of valid API keys configured in environment or settings."""
    keys = set()
    configured_key = getattr(settings, "API_KEY", None)
    if configured_key and configured_key != "your-random-secret-key":
        keys.add(configured_key)

    env_nexnum_key = os.environ.get("NEXNUM_API_KEY")
    if env_nexnum_key:
        keys.add(env_nexnum_key)

    env_admin_key = os.environ.get("ADMIN_API_KEY")
    if env_admin_key:
        keys.add(env_admin_key)

    # Fallback to configured key if no env provided
    if not keys and configured_key:
        keys.add(configured_key)

    return keys


async def verify_api_key(
    header_key: Optional[str] = Security(API_KEY_HEADER),
    query_key: Optional[str] = Security(API_KEY_QUERY),
    request: Optional[Request] = None
) -> str:
    """
    FastAPI Security Dependency that validates API key.
    Raises 401 UNAUTHORIZED if key is missing or invalid.
    """
    provided_key = header_key or query_key

    # Check query param directly from request if Security hasn't captured it
    if not provided_key and request:
        provided_key = request.query_params.get("api_key") or request.query_params.get("apiKey")

    valid_keys = get_expected_api_keys()

    if not provided_key or provided_key not in valid_keys:
        logger.warning(f"[Auth] Unauthorized access attempt to {request.url.path if request else 'endpoint'}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key (X-API-Key header or api_key parameter required)"
        )

    return provided_key
