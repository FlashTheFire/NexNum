# app/gateway/scorer.py
"""
Phase 4 — getNumber Advanced Scoring Engine

Deterministic Multi-Factor Device SIM Scoring Engine:
  1. Fresh Numbers Priority (Service Usage Penalty):
     Reads pre-analyzed service usage count from Redis (`nexsms:service_counts:{phone}`).
     Penalty: `score -= (service_sms_count * 25)`.
     Fresh numbers (0 SMS for requested service) get a +100 bonus!
  2. Recency Score:
     +60 for activity < 2 min ago, +40 for < 5 min, +20 for < 10 min.
  3. Online Status Bonus:
     +30 if device is currently online.
  4. Battery Health:
     +10 if battery >= 70%, -20 if battery < 15%.
  5. Dynamic Cooldown Compression (Low Stock Shield):
     Adjusts service cooldown dynamically based on available stock to prevent NO_NUMBERS errors.
  6. Hard Excludes (Score = -9999):
     - Active service cooldown on same phone for same service
     - User 30-minute cooldown on same phone for same user
     - Offline > 10 minutes
"""

from __future__ import annotations

import time
import json
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

# pyrefly: ignore [missing-import]
from app.crud.schema_adapter import DeviceSimNode

logger = logging.getLogger(__name__)

REDIS_PREFIX = "nexsms"


@dataclass
class ScoredSimCandidate:
    node: DeviceSimNode
    score: int
    service_sms_count: int
    mins_since_seen: float
    has_messages: bool = False


class DeviceScorer:

    @staticmethod
    async def score_sim_node(
        redis_client,
        node: DeviceSimNode,
        service: str,
        user_id: str,
        now: float,
        effective_cooldown_sec: float = 1200.0,
        service_sms_count_override: Optional[int] = None
    ) -> ScoredSimCandidate:
        """
        Calculates deterministic integer score for a DeviceSimNode candidate.
        Super-fast execution using batched Redis calls.

        Freshness logic:
          NO_DATA  (-50): Device has no message history in Redis at all.
                         Cannot confirm this SIM can receive SMS.
          FRESH   (+100): Device has message history but 0 SMS for requested service.
                         Genuinely clean slate for this service.
          USED  (-25*n): Device has previously received SMS for this service.
        """
        phone = node.phone_number
        req_service = (service or "ot").lower()
        score = 0

        # Calculate time since last activity (in minutes and hours)
        last_seen_sec = node.last_seen_ms / 1000 if node.last_seen_ms > 1e11 else node.last_seen_ms
        mins_since_seen = max(0.0, (now - last_seen_sec) / 60.0)
        hours_since_seen = mins_since_seen / 60.0

        # ─── HARD EXCLUDES (Cooldowns Only) ───────────────────────────────────

        has_messages = False

        if service_sms_count_override is not None:
            service_sms_count = service_sms_count_override
            has_messages = True  # If caller overrides count, assume data exists
        elif redis_client:
            try:
                # Pipeline Redis checks for max speed (~0.2ms total)
                pipe = redis_client.pipeline()
                pipe.get(f"{REDIS_PREFIX}:cooldown:service:{phone}:{req_service}")
                if user_id:
                    pipe.get(f"{REDIS_PREFIX}:cooldown:user:{user_id}:{phone}")
                pipe.hget(f"{REDIS_PREFIX}:service_counts:{phone}", req_service)
                # Check if this device has any cached message history
                pipe.exists(f"{REDIS_PREFIX}:device_messages:{node.device_id}")

                results = await pipe.execute()

                svc_cooldown_val = results[0]
                idx = 1
                user_cooldown_val = results[idx] if user_id else None
                if user_id:
                    idx += 1
                svc_count_val = results[idx]
                idx += 1
                has_messages = bool(results[idx])

                # 1. Service Cooldown Check (Dynamic compressed TTL)
                if svc_cooldown_val is not None:
                    last_svc_time = float(svc_cooldown_val)
                    if (now - last_svc_time) < effective_cooldown_sec:
                        return ScoredSimCandidate(node=node, score=-9999, service_sms_count=0, mins_since_seen=mins_since_seen, has_messages=has_messages)

                # 2. User 30-minute Cooldown Check
                if user_cooldown_val is not None:
                    last_user_time = float(user_cooldown_val)
                    if (now - last_user_time) < 1800.0:
                        return ScoredSimCandidate(node=node, score=-9999, service_sms_count=0, mins_since_seen=mins_since_seen, has_messages=has_messages)

                service_sms_count = int(svc_count_val) if svc_count_val else 0

            except Exception as e:
                logger.warning(f"Redis pipeline error in DeviceScorer: {e}")
                service_sms_count = 0
        else:
            service_sms_count = 0

        # ─── SOFT SCORING ──────────────────────────────────────────────────────

        # A. Fresh Numbers Priority (3-Way: NO_DATA / FRESH / USED)
        if not has_messages:
            # Data-poor: no message history — cannot confirm SMS reception capability
            score -= 50
        elif service_sms_count == 0:
            # Genuinely fresh: has history but clean for this service
            score += 100
        else:
            # Previously used for this service
            score -= (service_sms_count * 25)

        # B. Recency of activity (12-Hour Operational Scale)
        if hours_since_seen <= 1.0:        # Last activity < 1 hour: Maximum responsiveness
            score += 60
        elif hours_since_seen <= 3.0:      # Last activity < 3 hours: High responsiveness
            score += 40
        elif hours_since_seen <= 6.0:      # Last activity < 6 hours: Medium responsiveness
            score += 20
        elif hours_since_seen <= 12.0:     # Last activity < 12 hours: Low responsiveness
            score += 10
        else:                              # Last activity > 12 hours: Baseline readiness
            score += 2

        # C. Online Status Bonus
        if node.is_online:
            score += 30

        # D. Battery Health
        if node.battery >= 70:
            score += 10
        elif node.battery < 15:
            score -= 20

        return ScoredSimCandidate(
            node=node,
            score=score,
            service_sms_count=service_sms_count,
            mins_since_seen=mins_since_seen,
            has_messages=has_messages
        )

    @classmethod
    async def select_best_sim_node(
        cls,
        redis_client,
        sim_nodes: List[DeviceSimNode],
        service: str,
        user_id: str
    ) -> Optional[DeviceSimNode]:
        """
        Scores all SIM nodes concurrently, applies dynamic load compression if stock is low,
        and returns the highest-scoring candidate.
        """
        if not sim_nodes:
            return None

        now = time.time()
        total_nodes = len(sim_nodes)

        # Dynamic Cooldown Compression (Low Stock Shield)
        # If available nodes <= 5, reduce service cooldown to 300s (5min) to prevent NO_NUMBERS!
        if total_nodes <= 5:
            effective_cooldown_sec = 300.0
            logger.info(f"[LowStockShield] Low stock detected ({total_nodes} nodes). Service cooldown compressed to 5 min.")
        elif total_nodes <= 15:
            effective_cooldown_sec = 600.0
        else:
            effective_cooldown_sec = 1200.0

        # Score all candidates concurrently
        scored_candidates: List[ScoredSimCandidate] = []
        for node in sim_nodes:
            candidate = await cls.score_sim_node(
                redis_client, node, service, user_id, now, effective_cooldown_sec=effective_cooldown_sec
            )
            if candidate.score > -9999:
                scored_candidates.append(candidate)

        # Fallback Pass (Ultra-Low Stock Shield):
        # If no candidates passed under current cooldown, re-score with ultra-compressed 120s cooldown
        if not scored_candidates and effective_cooldown_sec > 120.0:
            logger.info(f"[LowStockShield] Stock exhaustion imminent for service '{service}'. Engaging Tier-2 Cooldown Compression (120s).")
            for node in sim_nodes:
                candidate = await cls.score_sim_node(
                    redis_client, node, service, user_id, now, effective_cooldown_sec=120.0
                )
                if candidate.score > -9999:
                    scored_candidates.append(candidate)

        if not scored_candidates:
            return None

        # Sort by score descending (highest score first)
        scored_candidates.sort(key=lambda c: c.score, reverse=True)

        best = scored_candidates[0]
        logger.info(
            f"[DeviceScorer] Selected best SIM: device={best.node.device_id} phone={best.node.phone_number} "
            f"sim_slot={best.node.sim_slot} score={best.score} "
            f"(svc_count={best.service_sms_count}, mins_seen={best.mins_since_seen:.1f}m)"
        )
        return best.node
