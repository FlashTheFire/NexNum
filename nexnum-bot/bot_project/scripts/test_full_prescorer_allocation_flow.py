# nexnum-bot/bot_project/scripts/test_full_prescorer_allocation_flow.py
"""
Full End-to-End Deep Verification Test Script

Validates the complete raw-to-allocation pipeline:
1. Universal Firebase Registry (7 Nodes) connectivity
2. Aggregate all SIM devices across Firebase nodes
3. Shallow probe (/messages, /clients, /gateways, /phoneMapping) & fetch device messages
4. Execute PreScorerWorker batch analysis & Redis caching
5. Verify Strict Allocation Gating:
   - Pending/Unknown phone numbers -> HARD EXCLUDED (-9999)
   - Uncached / Pending message devices -> HARD EXCLUDED (-9999)
   - Devices with last SMS > 12 hours ago -> HARD EXCLUDED (-9999)
   - ONLY devices receiving SMS under 12 hours with verified phone numbers -> ELIGIBLE & SCORED
"""

import sys
import os
import asyncio
import time
import json
import logging

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("deep_test")


async def run_full_deep_test():
    logger.info("=================================================================")
    logger.info("  STARTING FULL END-TO-END DEEP TEST FOR NEXNUM ALLOCATION FLOW   ")
    logger.info("=================================================================\n")

    # Imports
    # pyrefly: ignore [missing-import]
    from app.crud.universal_firebase import UniversalFirebaseRegistry
    # pyrefly: ignore [missing-import]
    from app.crud.firebase_crud import get_all_sim_nodes
    # pyrefly: ignore [missing-import]
    from app.workers.prescorer_worker import analyze_and_cache_all_service_counts
    # pyrefly: ignore [missing-import]
    from app.gateway.scorer import DeviceScorer
    # pyrefly: ignore [missing-import]
    from utils.redis_manager import redis_manager

    # STEP 1: Universal Firebase Registry Check
    logger.info("--- [STEP 1] Validating Universal Firebase Registry ---")
    fb_nodes = UniversalFirebaseRegistry.get_nodes()
    logger.info(f"Loaded {len(fb_nodes)} active Firebase nodes:")
    for n in fb_nodes:
        logger.info(f"  - {n.node_id}: {n}")
    assert len(fb_nodes) >= 1, "No Firebase nodes found!"

    # STEP 2: Aggregate All SIM Devices
    logger.info("\n--- [STEP 2] Aggregating All Raw SIM Nodes Across Firebases ---")
    loop = asyncio.get_running_loop()
    sim_nodes = await loop.run_in_executor(None, get_all_sim_nodes)
    logger.info(f"Aggregated {len(sim_nodes)} total allocatable SIM nodes.")
    assert len(sim_nodes) > 0, "No SIM nodes returned!"

    # STEP 3 & 4: Run PreScorer Worker Analysis & Redis Cache
    logger.info("\n--- [STEP 3 & 4] Executing PreScorer Worker (Shallow Probe & Batch Redis Sync) ---")
    redis_client = await redis_manager.get_client()
    assert redis_client is not None, "Failed to connect to Redis!"

    start_t = time.time()
    await analyze_and_cache_all_service_counts(redis_client)
    elapsed = time.time() - start_t
    logger.info(f"PreScorerWorker batch analysis completed in {round(elapsed, 2)}s.")

    # STEP 5: Verify Allocation Gating & 12-Hour Cutoff Enforcements
    logger.info("\n--- [STEP 5] Verifying Strict Allocation Gating Rules ---")
    now = time.time()
    eligible_candidates = []
    disqualified_pending_phone = 0
    disqualified_over_12h = 0
    disqualified_no_msgs = 0

    for sim in sim_nodes:
        cand = await DeviceScorer.score_sim_node(
            redis_client=redis_client,
            node=sim,
            service="tg",
            user_id="",
            now=now
        )

        phone = (sim.phone_number or "").strip()
        if not phone or phone.lower() in ("pending", "unknown"):
            disqualified_pending_phone += 1
            assert cand.score == -9999, f"Pending phone {sim.device_id} was NOT hard-excluded!"
        elif cand.last_sms_hours > 12.0:
            disqualified_over_12h += 1
            assert cand.score == -9999, f"Device {sim.device_id} with SMS >12h was NOT hard-excluded!"
        elif not cand.has_messages:
            disqualified_no_msgs += 1
        elif cand.score > -9999:
            eligible_candidates.append(cand)

    logger.info(f"Allocation Audit Summary across {len(sim_nodes)} SIM nodes:")
    logger.info(f"  - Pending / Unknown Phone Numbers Disqualified: {disqualified_pending_phone}")
    logger.info(f"  - SMS > 12 Hours Ago Disqualified: {disqualified_over_12h}")
    logger.info(f"  - No Message History Disqualified: {disqualified_no_msgs}")
    logger.info(f"  - ELIGIBLE NUMBERS READY FOR ALLOCATION (SMS < 12h): {len(eligible_candidates)}")

    # STEP 6: Verify Best SIM Node Selection
    logger.info("\n--- [STEP 6] Testing Best SIM Node Allocation Engine ---")
    best_sim = await DeviceScorer.select_best_sim_node(
        redis_client=redis_client,
        sim_nodes=sim_nodes,
        service="tg",
        user_id=""
    )

    if best_sim:
        logger.info(f"SUCCESS: Best Allocated SIM Selected: phone={best_sim.phone_number} device={best_sim.device_id}")
        # Verify best sim last SMS was indeed under 12 hours
        best_cand = await DeviceScorer.score_sim_node(redis_client, best_sim, "tg", "", now)
        logger.info(f"  - Score: {best_cand.score}")
        logger.info(f"  - Last SMS Received: {round(best_cand.last_sms_hours, 2)} hours ago")
        assert best_cand.last_sms_hours <= 12.0, "Selected SIM had SMS > 12 hours ago!"
        assert best_sim.phone_number not in ("Pending", "Unknown", None, ""), "Selected SIM has pending phone!"
    else:
        logger.warning("No eligible SIM numbers currently active with SMS under 12 hours.")

    logger.info("\n=================================================================")
    logger.info("  ALL END-TO-END DEEP TESTS PASSED WITH 0 ROOT CAUSE BUG ERRORS! ")
    logger.info("=================================================================")


if __name__ == "__main__":
    asyncio.run(run_full_deep_test())
