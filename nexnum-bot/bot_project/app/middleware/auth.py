# app/middleware/auth.py
"""
API Key Authentication Dependency & Helper for nexnum-bot endpoints.
Validates X-API-Key header or api_key query parameter against server config.
"""

from __future__ import annotations

import os
import logging
from typing import Optional
from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader, APIKeyQuery

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
api_key_query = APIKeyQuery(name="api_key", auto_error=False)


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

    if not keys and configured_key:
        keys.add(configured_key)

    return keys


async def verify_api_key(
    header_key: Optional[str] = Security(api_key_header),
    query_key: Optional[str] = Security(api_key_query)
) -> None:
    """
    FastAPI Security Dependency validating API Key from X-API-Key header or api_key query param.
    Compatible with router and endpoint level dependencies.
    """
    provided_key = header_key or query_key
    valid_keys = get_expected_api_keys()

    if not provided_key or provided_key not in valid_keys:
        logger.warning("[Auth] Unauthorized access attempt with invalid/missing API key")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key (X-API-Key header or api_key query parameter required)"
        )
