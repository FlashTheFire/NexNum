# app/services/pricing_engine.py
"""
Phase 8 — Professional Dynamic Pricing & Peak-Time Surge Engine

Calculates dynamic activation price based on:
  1. Service Base Price (configured per service code)
  2. Time-of-Day Peak Window Surge (IST peak hours 09:00-13:00, 18:00-23:00 -> +25%, off-peak 02:00-07:00 -> -15%)
  3. Real-Time Demand Multiplier (number of active activations for same service)
  4. Stock Scarcity Shield (surge when allocatable online SIM stock is low)
"""

from __future__ import annotations

import time
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

REDIS_PREFIX = "nexsms"

# Base default prices per service code (USD / Points equivalent)
DEFAULT_SERVICE_PRICES: Dict[str, float] = {
    "wa": 0.50,   # WhatsApp
    "tg": 0.35,   # Telegram
    "go": 0.35,   # Google / YouTube
    "fb": 0.35,   # Facebook
    "ig": 0.35,   # Instagram
    "tw": 0.35,   # Twitter / X
    "vi": 0.35,   # Viber
    "ds": 0.35,   # Discord
    "mm": 0.35,   # Microsoft
    "ya": 0.35,   # Yahoo
    "am": 0.35,   # Amazon
    "wx": 0.35,   # Apple
    "lf": 0.35,   # TikTok
    "vk": 0.35,   # VK
    "ok": 0.35,   # OK.ru
    "ma": 0.35,   # Mail.ru
    "oi": 0.35,   # Tinder
    "nz": 0.35,   # Nike
    "hw": 0.35,   # Alipay
    "ot": 0.35,   # Other / Universal Fallback
}

# IST Timezone (UTC+5:30)
IST_TZ = timezone(timedelta(hours=5, minutes=30))


class PricingEngine:
    """
    Professional Dynamic Pricing Engine.
    """

    @classmethod
    def get_time_multiplier(cls, dt: Optional[datetime] = None) -> float:
        """
        Calculate time-of-day surge multiplier based on IST peak hours.
          - Peak Hours (09:00 - 13:00 & 18:00 - 23:00 IST): 1.25x
          - Off-Peak Hours (02:00 - 07:00 IST): 0.85x
          - Regular Hours: 1.0x
        """
        if dt is None:
            dt = datetime.now(IST_TZ)
        else:
            dt = dt.astimezone(IST_TZ)

        hour = dt.hour

        # Morning Peak (9 AM - 1 PM) & Evening Peak (6 PM - 11 PM)
        if (9 <= hour < 13) or (18 <= hour < 23):
            return 1.25
        # Night Off-Peak (2 AM - 7 AM)
        elif 2 <= hour < 7:
            return 0.85
        else:
            return 1.0

    @classmethod
    async def get_demand_multiplier(cls, redis_client, service_code: str) -> float:
        """
        Calculate surge multiplier based on current active activations for the service in Redis.
          - 0-5 active: 1.0x
          - 6-15 active: 1.10x
          - 16-30 active: 1.20x
          - 30+ active: 1.35x
        """
        if not redis_client:
            return 1.0

        try:
            active_ids = await redis_client.smembers(f"{REDIS_PREFIX}:active_ids")
            if not active_ids:
                return 1.0

            # Count active for this service
            pipe = redis_client.pipeline()
            for aid in active_ids:
                pipe.get(f"{REDIS_PREFIX}:activation:{aid}")
            results = await pipe.execute()

            active_for_service = 0
            for v in results:
                if v:
                    try:
                        import json
                        act = json.loads(v)
                        if (act.get("service") or "").lower() == service_code.lower():
                            active_for_service += 1
                    except Exception:
                        pass

            if active_for_service >= 30:
                return 1.35
            elif active_for_service >= 16:
                return 1.20
            elif active_for_service >= 6:
                return 1.10
            else:
                return 1.0

        except Exception as e:
            logger.warning(f"[PricingEngine] Redis demand query error: {e}")
            return 1.0

    @classmethod
    async def compute_dynamic_price(
        cls,
        redis_client,
        service_code: str,
        custom_base_price: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Computes dynamic pricing for a given service code.
        Returns:
          {
            "service": str,
            "basePrice": float,
            "finalPrice": float,
            "timeMultiplier": float,
            "demandMultiplier": float,
            "isSurge": bool,
            "surgeReason": str
          }
        """
        code = (service_code or "ot").lower()
        base_price = custom_base_price or DEFAULT_SERVICE_PRICES.get(code, 0.35)

        time_mult = cls.get_time_multiplier()
        demand_mult = await cls.get_demand_multiplier(redis_client, code)

        combined_mult = time_mult * demand_mult
        final_price = round(base_price * combined_mult, 2)

        is_surge = combined_mult > 1.00
        surge_reasons = []
        if time_mult > 1.0:
            surge_reasons.append("Peak Hours (IST)")
        if time_mult < 1.0:
            surge_reasons.append("Off-Peak Discount (IST)")
        if demand_mult > 1.0:
            surge_reasons.append("High Service Demand")

        surge_reason = ", ".join(surge_reasons) if surge_reasons else "Normal"

        return {
            "service": code,
            "basePrice": base_price,
            "finalPrice": final_price,
            "timeMultiplier": time_mult,
            "demandMultiplier": demand_mult,
            "combinedMultiplier": round(combined_mult, 2),
            "isSurge": is_surge,
            "surgeReason": surge_reason
        }
