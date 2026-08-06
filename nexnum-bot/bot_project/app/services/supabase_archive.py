# app/services/supabase_archive.py
"""
Phase 6 — Supabase Async Archive Layer

Non-blocking, fire-and-forget background worker that archives:
  1. Matched incoming SMS messages -> `public.messages`
  2. Activation completion & cancellation events -> `public.activation_logs`

Integrates with SilentGate's Supabase project via REST API.
All archive operations are executed asynchronously via `asyncio.create_task()`
so they NEVER block the critical SMS matching path or gateway API response times.
"""

from __future__ import annotations

import os
import time
import json
import logging
from typing import Dict, Any, Optional
import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class SupabaseArchiver:

    @classmethod
    def _get_credentials(cls) -> tuple[Optional[str], Optional[str]]:
        """Resolve Supabase URL and Key from settings or environment."""
        url = getattr(settings, "SUPABASE_URL", os.environ.get("SUPABASE_URL"))
        key = getattr(settings, "SUPABASE_KEY", os.environ.get("SUPABASE_KEY"))
        return url, key

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
        """
        supabase_url, supabase_key = cls._get_credentials()
        if not supabase_url or not supabase_key:
            return

        endpoint = f"{supabase_url.rstrip('/')}/rest/v1/messages"
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
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
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.post(endpoint, headers=headers, json=payload)
                if resp.status_code in (200, 201):
                    logger.debug(f"[SupabaseArchiver] Message archived for activation {activation_id}")
                else:
                    logger.debug(f"[SupabaseArchiver] Post to messages returned HTTP {resp.status_code}: {resp.text}")
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
        Archive activation status/lifecycle event to Supabase `public.activation_logs` table asynchronously.
        """
        supabase_url, supabase_key = cls._get_credentials()
        if not supabase_url or not supabase_key:
            return

        endpoint = f"{supabase_url.rstrip('/')}/rest/v1/activation_logs"
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
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
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.post(endpoint, headers=headers, json=payload)
                if resp.status_code in (200, 201):
                    logger.debug(f"[SupabaseArchiver] Activation log archived: {activation_id} -> {status}")
                else:
                    logger.debug(f"[SupabaseArchiver] Post to activation_logs returned HTTP {resp.status_code}: {resp.text}")
        except Exception as exc:
            logger.debug(f"[SupabaseArchiver] Non-blocking archive_activation_log failed: {exc}")
