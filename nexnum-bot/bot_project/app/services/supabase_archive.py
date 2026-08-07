# app/services/supabase_archive.py
"""
Phase 6 — Supabase Async Archive Layer

Non-blocking, fire-and-forget background worker that archives:
  1. Matched incoming SMS messages -> `public.messages`
  2. Activation completion & cancellation events -> `public.activation_logs`

Performance:
  - Uses the shared AsyncClient pool (app.core.http_pool) — avoids creating a new
    HTTP client per archive call (eliminates TCP handshake + SSL overhead per event).
  - Falls back to a one-off client if the shared pool is unavailable.
  - All archive operations are dispatched via `asyncio.create_task()` so they
    NEVER block the critical SMS matching path or gateway API response times.
"""

from __future__ import annotations

import os
import time
import logging
from typing import Optional

# pyrefly: ignore [missing-import]
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Shared headers — built once, reused for every request
def _make_headers(key: str) -> dict:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }


def _get_credentials() -> tuple[Optional[str], Optional[str]]:
    """Resolve Supabase URL and Key from settings or environment."""
    url = getattr(settings, "SUPABASE_URL", os.environ.get("SUPABASE_URL"))
    key = getattr(settings, "SUPABASE_KEY", os.environ.get("SUPABASE_KEY"))
    return url, key


async def _post_to_supabase(endpoint: str, headers: dict, payload: dict) -> None:
    """
    Execute a single HTTP POST to Supabase using the shared pool client when available.
    Falls back to a one-off httpx.AsyncClient if the pool is not yet initialized.
    """
    try:
        # pyrefly: ignore [missing-import]
        from app.core.http_pool import get_http_client
        client = await get_http_client()
        resp = await client.post(endpoint, headers=headers, json=payload, timeout=4.0)
        return resp
    except Exception:
        # Fallback: one-off client (should rarely hit this path)
        import httpx
        async with httpx.AsyncClient(timeout=4.0) as client:
            return await client.post(endpoint, headers=headers, json=payload)


class SupabaseArchiver:

    @classmethod
    async def archive_message(
        cls,
        device_id: str,
        sender: str,
        body: str,
        otp_code: Optional[str],
        service: str,
        activation_id: Optional[str] = None
    ):
        """
        Archive a matched SMS message to Supabase `public.messages` table asynchronously.
        Uses shared HTTP pool — no new TCP connection per call.
        """
        supabase_url, supabase_key = _get_credentials()
        if not supabase_url or not supabase_key:
            return

        endpoint = f"{supabase_url.rstrip('/')}/rest/v1/messages"
        headers = _make_headers(supabase_key)
        payload = {
            "device_id": device_id,
            "sender": sender,
            "body": body,
            "otp_code": otp_code,
            "service": service,
            "activation_id": activation_id,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }

        try:
            resp = await _post_to_supabase(endpoint, headers, payload)
            if resp and resp.status_code in (200, 201):
                logger.debug(f"[SupabaseArchiver] Message archived for activation {activation_id}")
            else:
                status = resp.status_code if resp else "no_response"
                logger.debug(f"[SupabaseArchiver] POST /messages returned HTTP {status}")
        except Exception as exc:
            logger.debug(f"[SupabaseArchiver] Non-blocking archive_message failed: {exc}")

    @classmethod
    async def archive_activation_log(
        cls,
        activation_id: str,
        device_id: str,
        phone_number: str,
        service: str,
        status: str,
        code_text: Optional[str] = None,
        duration_sec: float = 0.0
    ):
        """
        Archive activation status/lifecycle event to Supabase `public.activation_logs` table.
        Uses shared HTTP pool — no new TCP connection per call.
        """
        supabase_url, supabase_key = _get_credentials()
        if not supabase_url or not supabase_key:
            return

        endpoint = f"{supabase_url.rstrip('/')}/rest/v1/activation_logs"
        headers = _make_headers(supabase_key)
        payload = {
            "activation_id": activation_id,
            "device_id": device_id,
            "phone_number": phone_number,
            "service": service,
            "status": status,
            "code_text": code_text,
            "duration_sec": round(duration_sec, 2),
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }

        try:
            resp = await _post_to_supabase(endpoint, headers, payload)
            if resp and resp.status_code in (200, 201):
                logger.debug(f"[SupabaseArchiver] Activation log archived: {activation_id} → {status}")
            else:
                status_code = resp.status_code if resp else "no_response"
                logger.debug(f"[SupabaseArchiver] POST /activation_logs returned HTTP {status_code}")
        except Exception as exc:
            logger.debug(f"[SupabaseArchiver] Non-blocking archive_activation_log failed: {exc}")
