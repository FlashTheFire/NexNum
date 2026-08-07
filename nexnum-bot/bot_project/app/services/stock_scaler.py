# app/services/stock_scaler.py
"""
Smart Psychological Stock Scaling Engine for Real SIM Fleet.

Transforms real physical SIM stock into an optimized presentation count:
  - 10 real numbers -> 2x (20 display numbers)
  - 1k real numbers -> 2x (2,000 display numbers)
  - 0 real numbers  -> 0 (Guaranteed hard floor: never display phantom stock if empty)

Preserves Ground Truth:
  - Execution Tier (order placement, carrier allocation, cooldowns) always uses real_stock.
  - Presentation Tier (catalog, getPrices, bot listings) uses computed display_stock.
"""

from __future__ import annotations
import math
from typing import Dict, Any, Optional


class StockScaler:
    """
    Intelligent Stock Multiplier & Psychological Scaling Engine.
    """

    DEFAULT_MULTIPLIER: float = 2.0
    DEFAULT_BASE_BOOST: int = 0
    DEFAULT_MAX_CAP: int = 50000

    @classmethod
    def compute_display_stock(
        cls,
        real_stock: int,
        multiplier: float = 2.0,
        base_boost: int = 0,
        max_cap: int = 50000,
        min_display_when_active: int = 1
    ) -> int:
        """
        Computes psychological display stock from ground-truth real SIM fleet count.

        Rules:
          1. Hard Floor: If real_stock <= 0 -> returns 0 (Out of stock shield).
          2. Multiplier Scaling: If real_stock >= 1 -> multiplies by multiplier (e.g. 2.0x).
          3. Optional Base Boost: Adds base_boost if real_stock > 0.
          4. Cap: Clamps to max_cap to prevent unrealistic display figures.
        """
        if real_stock <= 0:
            return 0

        mult = max(1.0, float(multiplier or cls.DEFAULT_MULTIPLIER))
        boost = max(0, int(base_boost or 0))
        cap = max(1, int(max_cap or cls.DEFAULT_MAX_CAP))

        # Psychological scaling formula
        scaled = math.floor(real_stock * mult) + boost

        # Ensure at least min_display_when_active when physical stock > 0
        display = max(min_display_when_active, scaled)

        # Bounded by max_cap
        return min(cap, display)

    @classmethod
    def compute_fleet_service_stock(
        cls,
        service_code: str,
        real_online_sims: int,
        pattern_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Calculates both real and psychological display stock for a service.
        Returns:
          {
            "service": str,
            "real_stock": int,
            "display_stock": int,
            "multiplier": float,
            "is_out_of_stock": bool
          }
        """
        code = (service_code or "ot").lower()
        info = pattern_data or {}

        # 1. Real physical stock from online fleet or service pattern baseline
        configured_stock = int(info.get("stock", real_online_sims) or real_online_sims or 0)
        # Real stock is at least real_online_sims if SIMs are actively broadcasting
        real_stock = max(0, configured_stock if configured_stock > 0 else real_online_sims)

        # 2. Multiplier configuration (customizable per service in service_patterns.json)
        multiplier = float(info.get("stock_multiplier", cls.DEFAULT_MULTIPLIER) or cls.DEFAULT_MULTIPLIER)
        base_boost = int(info.get("base_stock_boost", cls.DEFAULT_BASE_BOOST) or cls.DEFAULT_BASE_BOOST)
        max_cap = int(info.get("max_stock_cap", cls.DEFAULT_MAX_CAP) or cls.DEFAULT_MAX_CAP)

        display_stock = cls.compute_display_stock(
            real_stock=real_stock,
            multiplier=multiplier,
            base_boost=base_boost,
            max_cap=max_cap
        )

        return {
            "service": code,
            "real_stock": real_stock,
            "display_stock": display_stock,
            "multiplier": multiplier,
            "is_out_of_stock": real_stock <= 0
        }
