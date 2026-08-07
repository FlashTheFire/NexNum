# app/services/pattern_registry.py
"""
Phase 5 — Dynamic Service Pattern Registry

Stores per-service OTP sender & body patterns.
  1. Primary: Defaults loaded from `app/data/service_patterns.json`
  2. Overrides: Synced from Supabase table `sms_service_patterns` in SilentGate DB
  3. Caching: Redis (`nexsms:patterns:{service_code}`) with 5-minute TTL

Provides:
  - `match_sms_dynamic(body, sender, service_code)`: Validates incoming SMS against dynamic patterns
  - `update_pattern(service_code, pattern_dict)`: Live admin pattern updates with automatic Redis invalidation
"""

from __future__ import annotations

import os
import re
import json
import logging
import time
from typing import Dict, Any, List, Optional, Tuple

# pyrefly: ignore [missing-import]
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

REDIS_PREFIX = "nexsms"
PATTERNS_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "service_patterns.json")

# In-memory default patterns cache
_DEFAULT_PATTERNS: Dict[str, dict] = {}
_COMPILED_PATTERNS_CACHE: Dict[str, dict] = {}


def load_default_patterns() -> Dict[str, dict]:
    """Load default patterns from local JSON file."""
    global _DEFAULT_PATTERNS
    if _DEFAULT_PATTERNS:
        return _DEFAULT_PATTERNS
    
    try:
        if os.path.exists(PATTERNS_FILE_PATH):
            with open(PATTERNS_FILE_PATH, "r", encoding="utf-8") as f:
                _DEFAULT_PATTERNS = json.load(f)
                logger.info(f"[PatternRegistry] Loaded {len(_DEFAULT_PATTERNS)} default service patterns from JSON file.")
        else:
            logger.warning(f"[PatternRegistry] Patterns JSON file not found at {PATTERNS_FILE_PATH}")
    except Exception as e:
        logger.error(f"[PatternRegistry] Failed to load default patterns JSON: {e}")
    
    return _DEFAULT_PATTERNS


class ServicePatternRegistry:

    @classmethod
    async def get_pattern(cls, redis_client, service_code: str) -> dict:
        """
        Get pattern definition for a service code.
        Lookup chain: Redis Cache -> Supabase Overrides -> Local JSON Default
        """
        code = (service_code or "ot").lower()
        
        # 1. Check Redis Cache
        if redis_client:
            try:
                cached = await redis_client.get(f"{REDIS_PREFIX}:pattern:{code}")
                if cached:
                    return json.loads(cached)
            except Exception as e:
                logger.warning(f"[PatternRegistry] Redis error getting pattern for {code}: {e}")

        # 2. Check Supabase Overrides
        supabase_pattern = await cls._fetch_from_supabase(code)
        if supabase_pattern:
            if redis_client:
                try:
                    await redis_client.set(f"{REDIS_PREFIX}:pattern:{code}", json.dumps(supabase_pattern), ex=300)
                except Exception:
                    pass
            return supabase_pattern

        # 3. Fallback to Local JSON Defaults
        defaults = load_default_patterns()
        pattern = defaults.get(code) or defaults.get("ot") or {}
        
        if redis_client and pattern:
            try:
                await redis_client.set(f"{REDIS_PREFIX}:pattern:{code}", json.dumps(pattern), ex=300)
            except Exception:
                pass
        
        return pattern

    @classmethod
    async def _fetch_from_supabase(cls, service_code: str) -> Optional[dict]:
        """Fetch live pattern override from Supabase table `sms_service_patterns`."""
        supabase_url = getattr(settings, "SUPABASE_URL", os.environ.get("SUPABASE_URL"))
        supabase_key = getattr(settings, "SUPABASE_KEY", os.environ.get("SUPABASE_KEY"))

        if not supabase_url or not supabase_key:
            return None

        url = f"{supabase_url.rstrip('/')}/rest/v1/sms_service_patterns?code=eq.{service_code}&select=*"
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json"
        }

        try:
            import httpx
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list) and len(data) > 0:
                        row = data[0]
                        return {
                            "name": row.get("name", service_code),
                            "sender_patterns": row.get("sender_patterns", []),
                            "body_patterns": row.get("body_patterns", []),
                            "otp_regex": row.get("otp_regex")
                        }
        except Exception as e:
            logger.debug(f"[PatternRegistry] Supabase query failed for {service_code}: {e}")

        return None

    @classmethod
    async def match_sms_dynamic(cls, redis_client, body: str, sender: str, service_code: str) -> tuple[bool, Optional[str], dict]:
        """
        Validates incoming SMS against dynamic pattern for service_code.
        If service_code is 'auto', 'all', 'any', or empty, auto-detects across ALL JSON service patterns!
        Returns `(is_matched: bool, extracted_code: Optional[str], details: dict)`.
        """
        if not body:
            return False, None, {}

        req_code = (service_code or "auto").lower()

        # Build list of (code, pattern) to check
        if req_code not in ("auto", "all", "any"):
            patterns_to_check = [(req_code, await cls.get_pattern(redis_client, req_code))]
        else:
            defaults = load_default_patterns()
            patterns_to_check = []
            # Check specific services first
            for c in defaults:
                if c != "ot":
                    patterns_to_check.append((c, await cls.get_pattern(redis_client, c)))
            # Check 'ot' (Other / Fallback) last
            if "ot" in defaults:
                patterns_to_check.append(("ot", await cls.get_pattern(redis_client, "ot")))

        EXCLUDED_WORDS = {"login", "verify", "auth", "index", "home", "html", "php", "telegram", "whatsapp", "swiggy", "google", "amazon", "facebook", "instagram", "twitter"}

        for code, pattern in patterns_to_check:
            if not pattern:
                continue

            service_name = pattern.get("name", code.upper())
            sender_pats = [re.compile(p, re.I) for p in pattern.get("sender_patterns", []) if p]
            body_pats = [re.compile(p, re.I) for p in pattern.get("body_patterns", []) if p]
            custom_otp_regex = pattern.get("otp_regex")

            matched = False
            matched_sender_pattern = None
            matched_body_pattern = None

            # 1. Check sender
            for raw_p, p in zip(pattern.get("sender_patterns", []), sender_pats):
                if sender and p.search(sender):
                    matched = True
                    matched_sender_pattern = raw_p
                    break

            # 2. Check body
            for raw_p, p in zip(pattern.get("body_patterns", []), body_pats):
                if p.search(body):
                    matched = True
                    if not matched_body_pattern:
                        matched_body_pattern = raw_p
                    break

            if matched:
                # 3. Extract OTP
                extracted_code = None
                if custom_otp_regex:
                    try:
                        m = re.search(custom_otp_regex, body, re.I)
                        if m:
                            extracted_code = m.group(1) if m.groups() else m.group(0)
                    except Exception:
                        pass

                if not extracted_code:
                    # pyrefly: ignore [missing-import]
                    from app.services.sms_parser import extract_otp_code
                    extracted_code = extract_otp_code(body)

                if extracted_code:
                    extracted_code = str(extracted_code).replace("-", "").replace(" ", "").strip()
                    if not any(c.isalnum() for c in extracted_code) or extracted_code.lower() in EXCLUDED_WORDS:
                        extracted_code = None

                details = {
                    "matchedServiceCode": code,
                    "serviceName": service_name,
                    "matchedSenderPattern": matched_sender_pattern,
                    "matchedBodyPattern": matched_body_pattern,
                    "otpRegex": custom_otp_regex
                }
                return True, extracted_code, details

        # Unmatched
        defaults = load_default_patterns()
        fallback_pattern = defaults.get("ot", {})
        return False, None, {
            "matchedServiceCode": "ot",
            "serviceName": fallback_pattern.get("name", "Other / Universal Fallback"),
            "matchedSenderPattern": None,
            "matchedBodyPattern": None,
            "otpRegex": fallback_pattern.get("otp_regex")
        }

    @classmethod
    async def update_pattern(cls, redis_client, service_code: str, pattern_data: dict) -> bool:
        """
        Update pattern for a service. Writes to Supabase and invalidates Redis cache.
        """
        code = (service_code or "ot").lower()
        supabase_url = getattr(settings, "SUPABASE_URL", os.environ.get("SUPABASE_URL"))
        supabase_key = getattr(settings, "SUPABASE_KEY", os.environ.get("SUPABASE_KEY"))

        # Invalidate Redis cache immediately
        if redis_client:
            try:
                await redis_client.delete(f"{REDIS_PREFIX}:pattern:{code}")
            except Exception as e:
                logger.warning(f"[PatternRegistry] Redis delete failed for {code}: {e}")

        if not supabase_url or not supabase_key:
            logger.warning("[PatternRegistry] Supabase credentials not set — pattern updated in Redis cache only.")
            return True

        # Upsert to Supabase
        url = f"{supabase_url.rstrip('/')}/rest/v1/sms_service_patterns"
        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }
        payload = {
            "code": code,
            "name": pattern_data.get("name", code),
            "sender_patterns": pattern_data.get("sender_patterns", []),
            "body_patterns": pattern_data.get("body_patterns", []),
            "otp_regex": pattern_data.get("otp_regex"),
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }

        try:
            import httpx
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code in (200, 201):
                    logger.info(f"[PatternRegistry] Pattern for '{code}' updated in Supabase successfully.")
                    return True
                else:
                    logger.error(f"[PatternRegistry] Supabase update failed ({resp.status_code}): {resp.text}")
                    return False
        except Exception as exc:
            logger.error(f"[PatternRegistry] Error updating pattern in Supabase: {exc}")
            return False
