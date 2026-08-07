# app/gateway/scorer.py
"""
Phase 4 — getNumber Advanced Scoring Engine

Deterministic Multi-Factor Device SIM Scoring Engine:
  1. Fresh Numbers Priority (Service Usage Penalty):
     Reads pre-analyzed service usage count from Redis (`nexsms:service_counts:{phone}`).
     Penalty: `score -= (service_sms_count * 25)`.
     Fresh numbers (0 SMS for requested service) get a +100 bonus!
  2. 12-Hour SMS Recency Requirement (HARD CUTOFF):
     Computes hours since newest SMS received on the SIM.
     Only numbers receiving SMS within the last 12 hours are eligible.
     Score bonuses: +60 (<1h), +40 (<3h), +20 (<6h), +10 (<12h). >12h is HARD EXCLUDED (-9999).
  3. Online Status Bonus:
     +30 if device is currently online.
  4. Battery Health:
     +10 if battery >= 70%, -20 if battery < 15%.
  5. Dynamic Cooldown Compression (Low Stock Shield):
     Adjusts service cooldown dynamically based on available stock to prevent NO_NUMBERS errors.
  6. Hard Excludes (Score = -9999):
     - No SMS received within last 12 hours (> 12h cutoff)
     - Active service cooldown on same phone for same service
     - User 30-minute cooldown on same phone for same user
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
    last_sms_hours: float = 999.0


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
        Enforces HARD CUTOFF: Only numbers receiving SMS within the last 12 hours are eligible.
        """
        phone = node.phone_number or ""
        req_service = (service or "ot").lower()
        score = 0

        has_messages = False
        last_sms_timestamp_ms: float = 0.0

        if service_sms_count_override is not None:
            service_sms_count = service_sms_count_override
            has_messages = True
        elif redis_client:
            try:
                pipe = redis_client.pipeline()
                pipe.get(f"{REDIS_PREFIX}:cooldown:service:{phone}:{req_service}")
                if user_id:
                    pipe.get(f"{REDIS_PREFIX}:cooldown:user:{user_id}:{phone}")
                pipe.hget(f"{REDIS_PREFIX}:service_counts:{phone}", req_service)
                pipe.get(f"{REDIS_PREFIX}:device_messages:{node.device_id}")
                pipe.get(f"{REDIS_PREFIX}:device_messages:{phone}")

                results = await pipe.execute()

                svc_cooldown_val = results[0]
                idx = 1
                user_cooldown_val = results[idx] if user_id else None
                if user_id:
                    idx += 1
                svc_count_val = results[idx]
                idx += 1
                dev_msgs_val = results[idx]
                idx += 1
                phone_msgs_val = results[idx]

                # 1. Service Cooldown Check (Dynamic compressed TTL)
                if svc_cooldown_val is not None:
                    last_svc_time = float(svc_cooldown_val)
                    if (now - last_svc_time) < effective_cooldown_sec:
                        return ScoredSimCandidate(node=node, score=-9999, service_sms_count=0, mins_since_seen=999, has_messages=has_messages, last_sms_hours=999)

                # 2. User 30-minute Cooldown Check
                if user_cooldown_val is not None:
                    last_user_time = float(user_cooldown_val)
                    if (now - last_user_time) < 1800.0:
                        return ScoredSimCandidate(node=node, score=-9999, service_sms_count=0, mins_since_seen=999, has_messages=has_messages, last_sms_hours=999)

                service_sms_count = int(svc_count_val) if svc_count_val else 0

                # Extract newest SMS timestamp
                msgs_raw = dev_msgs_val or phone_msgs_val
                if msgs_raw:
                    try:
                        parsed = json.loads(msgs_raw)
                        if isinstance(parsed, list) and len(parsed) > 0:
                            has_messages = True
                            last_sms_timestamp_ms = float(parsed[0].get("timestamp") or 0.0)
                    except Exception:
                        pass

            except Exception as e:
                logger.warning(f"Redis pipeline error in DeviceScorer: {e}")
                service_sms_count = 0
        else:
            service_sms_count = 0

        # Calculate time since newest SMS received (in hours)
        if last_sms_timestamp_ms > 0:
            last_sms_sec = last_sms_timestamp_ms / 1000.0 if last_sms_timestamp_ms > 1e11 else last_sms_timestamp_ms
            hours_since_last_sms = max(0.0, (now - last_sms_sec) / 3600.0)
        else:
            hours_since_last_sms = 999.0  # No SMS history

        mins_since_sms = hours_since_last_sms * 60.0

        # ─── HARD EXCLUSION: Allocation requires SMS received within last 12 hours ───
        if hours_since_last_sms > 12.0:
            return ScoredSimCandidate(
                node=node,
                score=-9999,
                service_sms_count=service_sms_count,
                mins_since_seen=mins_since_sms,
                has_messages=has_messages,
                last_sms_hours=hours_since_last_sms
            )

        # ─── SOFT SCORING ──────────────────────────────────────────────────────

        # A. Fresh Numbers Priority (3-Way: NO_DATA / FRESH / USED)
        if not has_messages:
            score -= 50
        elif service_sms_count == 0:
            score += 100
        else:
            score -= (service_sms_count * 25)

        # B. SMS Recency Score (Under 12 Hours Scale)
        if hours_since_last_sms <= 1.0:        # SMS received < 1 hour ago
            score += 60
        elif hours_since_last_sms <= 3.0:      # SMS received < 3 hours ago
            score += 40
        elif hours_since_last_sms <= 6.0:      # SMS received < 6 hours ago
            score += 20
        elif hours_since_last_sms <= 12.0:     # SMS received < 12 hours ago
            score += 10

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
            mins_since_seen=mins_since_sms,
            has_messages=has_messages,
            last_sms_hours=hours_since_last_sms
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
        Scores all SIM nodes concurrently, enforces 12-hour SMS recency requirement,
        applies dynamic load compression if stock is low, and returns the highest-scoring candidate.
        """
        if not sim_nodes:
            return None

        now = time.time()
        total_nodes = len(sim_nodes)

        # Dynamic Cooldown Compression (Low Stock Shield)
        if total_nodes <= 5:
            effective_cooldown_sec = 300.0
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
        if not scored_candidates and effective_cooldown_sec > 120.0:
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
            f"sim_slot={best.node.sim_slot} score={best.score} last_sms_hours={round(best.last_sms_hours, 2)}h"
        )
        return best.node
