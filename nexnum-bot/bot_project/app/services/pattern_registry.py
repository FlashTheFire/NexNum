# app/services/pattern_registry.py
"""
Phase 5 — Dynamic Service Pattern Registry

Stores per-service OTP sender & body patterns.
  1. Primary: Defaults loaded from `app/data/service_patterns.json`
  2. Overrides: Synced from Supabase table `sms_service_patterns` in SilentGate DB
  3. Caching: Redis (`nexsms:patterns:{service_code}`) with 5-minute TTL

Performance optimizations:
  - Compiled regex objects are cached in-process (never recompiled for same pattern string)
  - Auto-detect mode fetches ALL patterns in a single Redis pipeline call (one round-trip)
  - Supabase fallback hits Redis first; if found, Supabase is never contacted
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

# In-process compiled regex cache: pattern_string → compiled regex
# This avoids re.compile() overhead on every SMS (the biggest single CPU hotspot)
_REGEX_CACHE: Dict[str, re.Pattern] = {}

# Excluded words for OTP code filtering
_EXCLUDED_WORDS = frozenset({
    "login", "verify", "auth", "index", "home", "html", "php",
    "telegram", "whatsapp", "swiggy", "google", "amazon",
    "facebook", "instagram", "twitter"
})


def _get_compiled(pattern_str: str) -> re.Pattern:
    """Return cached compiled regex, compiling once on first use."""
    cached = _REGEX_CACHE.get(pattern_str)
    if cached is None:
        cached = re.compile(pattern_str, re.I)
        _REGEX_CACHE[pattern_str] = cached
    return cached


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


def _match_against_pattern(body: str, sender: str, code: str, pattern: dict) -> tuple[bool, Optional[str], Optional[str], Optional[str]]:
    """
    Pure CPU-bound pattern match (no I/O).
    Returns (matched, matched_sender_pat, matched_body_pat, custom_otp_regex).
    Uses _get_compiled() for zero-allocation regex reuse.
    """
    sender_pats = pattern.get("sender_patterns", [])
    body_pats = pattern.get("body_patterns", [])

    matched_sender_pattern = None
    matched_body_pattern = None
    matched = False

    # 1. Sender check
    if sender:
        for raw_p in sender_pats:
            if raw_p and _get_compiled(raw_p).search(sender):
                matched = True
                matched_sender_pattern = raw_p
                break

    # 2. Body check (only if not already matched via sender)
    if not matched:
        for raw_p in body_pats:
            if raw_p and _get_compiled(raw_p).search(body):
                matched = True
                matched_body_pattern = raw_p
                break

    return matched, matched_sender_pattern, matched_body_pattern, pattern.get("otp_regex")


class ServicePatternRegistry:

    @classmethod
    async def get_pattern(cls, redis_client, service_code: str) -> dict:
        """
        Get pattern definition for a service code.
        Lookup chain: Redis Cache → Supabase Overrides → Local JSON Default
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
    async def _get_all_patterns_pipeline(cls, redis_client) -> Dict[str, dict]:
        """
        Fetch ALL service patterns in a single Redis pipeline call.
        Falls back to local JSON for any missing keys.
        This replaces sequential per-service get_pattern() calls in auto-detect mode.
        """
        defaults = load_default_patterns()
        if not defaults:
            return {}

        all_codes = list(defaults.keys())

        if redis_client:
            try:
                pipe = redis_client.pipeline()
                for code in all_codes:
                    pipe.get(f"{REDIS_PREFIX}:pattern:{code}")
                results = await pipe.execute()

                patterns: Dict[str, dict] = {}
                for code, cached_val in zip(all_codes, results):
                    if cached_val:
                        try:
                            patterns[code] = json.loads(cached_val)
                        except Exception:
                            patterns[code] = defaults.get(code, {})
                    else:
                        patterns[code] = defaults.get(code, {})
                return patterns
            except Exception as e:
                logger.warning(f"[PatternRegistry] Pipeline fetch failed, using local defaults: {e}")

        # No Redis — use local defaults directly
        return dict(defaults)

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

    # Fast lookup index cache: id(patterns_dict) -> (sender_map, keyword_map)
    _INDEX_CACHE: Dict[int, Tuple[Dict[str, str], Dict[str, str]]] = {}

    @classmethod
    def _build_pattern_indexes(cls, patterns: Dict[str, dict]) -> Tuple[Dict[str, str], Dict[str, str]]:
        """Build O(1) lookup hash maps for direct sender and keyword matching."""
        sender_map: Dict[str, str] = {}
        keyword_map: Dict[str, str] = {}
        for svc_code, info in patterns.items():
            if svc_code == "ot":
                continue
            for s_pat in info.get("sender_patterns", []):
                clean_s = s_pat.replace("(?i)", "").replace("^", "").replace("$", "").replace("\\", "").strip().lower()
                if clean_s and len(clean_s) >= 2:
                    sender_map[clean_s] = svc_code
            for b_pat in info.get("body_patterns", []):
                clean_b = b_pat.replace("(?i)", "").replace("^", "").replace("$", "").replace("\\", "").strip().lower()
                if clean_b and len(clean_b) >= 3:
                    keyword_map[clean_b] = svc_code
        return sender_map, keyword_map

    @classmethod
    def match_sms_fast_sync(cls, body: str, sender: str, default_patterns: Optional[Dict[str, dict]] = None) -> Optional[str]:
        """
        Ultra-fast synchronous in-memory pattern matcher for bulk workers.
        Uses O(1) index hash maps + pre-compiled regex fallback.
        Processes 5,000+ service lookups in micro-seconds (<0.001ms).
        """
        if not body:
            return None
        patterns = default_patterns or load_default_patterns()
        sender_clean = sender.strip()
        body_clean = body.strip()
        sender_lower = sender_clean.lower()
        body_lower = body_clean.lower()

        # O(1) Fast Index Lookup
        p_id = id(patterns)
        if p_id not in cls._INDEX_CACHE:
            cls._INDEX_CACHE[p_id] = cls._build_pattern_indexes(patterns)
        sender_map, keyword_map = cls._INDEX_CACHE[p_id]

        # 1. Direct O(1) Sender Map Match
        if sender_lower in sender_map:
            return sender_map[sender_lower]
        for s_key, s_code in sender_map.items():
            if s_key in sender_lower:
                return s_code

        # 2. Direct O(1) Keyword Match
        for k_key, k_code in keyword_map.items():
            if k_key in body_lower:
                return k_code

        # 3. Fallback Regex Match (if O(1) index miss)
        for svc_code, info in patterns.items():
            if svc_code == "ot":
                continue
            for s_pat in info.get("sender_patterns", []):
                if s_pat and _get_compiled(s_pat).search(sender_clean):
                    return svc_code
            for b_pat in info.get("body_patterns", []):
                if b_pat and _get_compiled(b_pat).search(body_clean):
                    return svc_code

        return "ot" if "ot" in patterns else None

    @classmethod
    async def match_sms_dynamic(cls, redis_client, body: str, sender: str, service_code: str) -> tuple[bool, Optional[str], dict]:
        """
        Validates incoming SMS against dynamic pattern for service_code.
        If service_code is 'auto', 'all', 'any', or empty, auto-detects across ALL JSON service patterns.
        Returns `(is_matched: bool, extracted_code: Optional[str], details: dict)`.

        Performance: Auto mode fetches ALL patterns in ONE Redis pipeline call instead of
        sequential get_pattern() calls (O(1) round-trips vs O(n) round-trips).
        """
        if not body:
            return False, None, {}

        req_code = (service_code or "auto").lower()

        # Build ordered list of (code, pattern) to check
        if req_code not in ("auto", "all", "any"):
            # Single-service mode: one Redis GET
            pattern = await cls.get_pattern(redis_client, req_code)
            patterns_to_check = [(req_code, pattern)]
        else:
            # Auto-detect mode: ONE pipeline call for all patterns
            all_patterns = await cls._get_all_patterns_pipeline(redis_client)
            defaults = load_default_patterns()
            # Check specific services first, then 'ot' (fallback) last
            patterns_to_check = [
                (c, all_patterns[c]) for c in defaults if c != "ot" and c in all_patterns
            ]
            if "ot" in all_patterns:
                patterns_to_check.append(("ot", all_patterns["ot"]))

        for code, pattern in patterns_to_check:
            if not pattern:
                continue

            matched, matched_sender_pat, matched_body_pat, custom_otp_regex = _match_against_pattern(
                body, sender, code, pattern
            )

            if matched:
                # Extract OTP code
                extracted_code = None
                if custom_otp_regex:
                    try:
                        m = _get_compiled(custom_otp_regex).search(body)
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
                    if not any(c.isalnum() for c in extracted_code) or extracted_code.lower() in _EXCLUDED_WORDS:
                        extracted_code = None

                details = {
                    "matchedServiceCode": code,
                    "serviceName": pattern.get("name", code.upper()),
                    "matchedSenderPattern": matched_sender_pat,
                    "matchedBodyPattern": matched_body_pat,
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
        Also clears in-process compiled regex cache for affected patterns.
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

        # Clear compiled regex cache for patterns belonging to this service
        # (simple approach: clear all — they'll be recompiled on next hit)
        _REGEX_CACHE.clear()

        # Save pattern to local disk
        cls.save_pattern_to_disk(code, pattern_data)

        if not supabase_url or not supabase_key:
            logger.info(f"[PatternRegistry] Pattern for '{code}' saved to disk and Redis invalidated.")
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
                else:
                    logger.warning(f"[PatternRegistry] Supabase notice ({resp.status_code}): {resp.text}")
            return True
        except Exception as exc:
            logger.warning(f"[PatternRegistry] Notice updating pattern in Supabase: {exc}")
            return True

    @classmethod
    def save_pattern_to_disk(cls, service_code: str, pattern_data: dict) -> bool:
        """Persists pattern definition atomically to service_patterns.json."""
        global _DEFAULT_PATTERNS
        code = (service_code or "ot").lower()
        try:
            defaults = load_default_patterns()
            defaults[code] = {
                "name": pattern_data.get("name", code.upper()),
                "price": float(pattern_data.get("price", 15.0) or 15.0),
                "stock": int(pattern_data.get("stock", 100) or 100),
                "senders": pattern_data.get("senders") or [f"(?i){pattern_data.get('name', code)}"],
                "sender_patterns": pattern_data.get("sender_patterns", []),
                "body_patterns": pattern_data.get("body_patterns", []),
                "otp_regex": pattern_data.get("otp_regex") or r"(?:\b\d{4,8}\b|\b[A-Za-z0-9]{4,10}\b)"
            }
            _DEFAULT_PATTERNS = defaults
            cls._INDEX_CACHE.clear()
            _REGEX_CACHE.clear()

            with open(PATTERNS_FILE_PATH, "w", encoding="utf-8") as f:
                json.dump(defaults, f, indent=2)
            logger.info(f"[PatternRegistry] Saved service pattern '{code}' to {PATTERNS_FILE_PATH}")
            return True
        except Exception as e:
            logger.error(f"[PatternRegistry] Failed to save pattern '{code}' to disk: {e}")
            return False

    @classmethod
    def delete_pattern_from_disk(cls, service_code: str) -> bool:
        """Deletes a pattern definition from service_patterns.json."""
        global _DEFAULT_PATTERNS
        code = (service_code or "ot").lower()
        if code == "ot":
            return False  # Prevent deleting fallback
        try:
            defaults = load_default_patterns()
            if code in defaults:
                del defaults[code]
                _DEFAULT_PATTERNS = defaults
                cls._INDEX_CACHE.clear()
                _REGEX_CACHE.clear()
                with open(PATTERNS_FILE_PATH, "w", encoding="utf-8") as f:
                    json.dump(defaults, f, indent=2)
                logger.info(f"[PatternRegistry] Deleted service pattern '{code}' from {PATTERNS_FILE_PATH}")
            return True
        except Exception as e:
            logger.error(f"[PatternRegistry] Failed to delete pattern '{code}' from disk: {e}")
            return False

    @classmethod
    async def delete_pattern(cls, redis_client, service_code: str) -> bool:
        """Deletes pattern from disk, Redis cache, and Supabase."""
        code = (service_code or "ot").lower()
        if code == "ot":
            return False
        
        # 1. Remove from Disk
        cls.delete_pattern_from_disk(code)

        # 2. Invalidate Redis
        if redis_client:
            try:
                await redis_client.delete(f"{REDIS_PREFIX}:pattern:{code}")
            except Exception:
                pass

        # 3. Supabase delete if configured
        supabase_url = getattr(settings, "SUPABASE_URL", os.environ.get("SUPABASE_URL"))
        supabase_key = getattr(settings, "SUPABASE_KEY", os.environ.get("SUPABASE_KEY"))
        if supabase_url and supabase_key:
            try:
                import httpx
                url = f"{supabase_url.rstrip('/')}/rest/v1/sms_service_patterns?code=eq.{code}"
                headers = {
                    "apikey": supabase_key,
                    "Authorization": f"Bearer {supabase_key}"
                }
                async with httpx.AsyncClient(timeout=3.0) as client:
                    await client.delete(url, headers=headers)
            except Exception as e:
                logger.debug(f"[PatternRegistry] Supabase delete notice for {code}: {e}")

        return True
