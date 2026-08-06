# bot_project/worker.py
"""
NexNum Gateway — Dedicated Standalone Worker Process Entrypoint

Runs all background asynchronous worker pools outside the FastAPI HTTP process:
  1. Redis Stream Consumer Worker Pool (5 workers) -> OTP Matching & Instant Push
  2. Historical SMS Pre-Scorer Worker -> Populates Redis service_counts
  3. Firebase Realtime Database SSE Stream Listeners
"""
import sys
import os
import signal
import asyncio
import logging
from pathlib import Path

# Add bot_project directory to sys.path
_bot_dir = Path(__file__).resolve().parent
if str(_bot_dir) not in sys.path:
    sys.path.insert(0, str(_bot_dir))

from app.core.config import get_settings
from utils.redis_manager import redis_manager
from app.inbound.router import ensure_consumer_group
from app.workers.activation_worker import start_activation_workers, stop_activation_workers
from app.workers.prescorer_worker import start_prescorer_worker, stop_prescorer_worker
from app.services.firebase_stream import firebase_stream_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("nexnum_worker")
settings = get_settings()


async def run_worker():
    logger.info("=" * 70)
    logger.info(" 🚀 STARTING NEXNUM DEDICATED PYTHON WORKER PROCESS")
    logger.info(f"    Worker Concurrency : {settings.INBOUND_WORKER_COUNT} consumer workers")
    logger.info("=" * 70)

    # 1. Initialize Redis Stream Consumer Group
    try:
        redis_client = await redis_manager.get_client()
        if redis_client:
            await ensure_consumer_group(redis_client)
            logger.info("  [1/3] Redis Stream consumer group verified.")
    except Exception as e:
        logger.warning(f"  [1/3] Redis connection warning: {e}")

    # 2. Start Firebase SSE Stream Listeners
    await firebase_stream_manager.start_listeners()
    logger.info("  [2/3] Firebase SSE Stream Listeners active.")

    # 3. Start Redis Stream Consumer Workers (5 workers)
    await start_activation_workers()
    logger.info(f"  [3/3] Redis Stream Consumer Workers active ({settings.INBOUND_WORKER_COUNT} workers).")

    # 4. Start Background Historical SMS Pre-Scorer Worker
    await start_prescorer_worker()
    logger.info("  [Pre-Scorer] Historical SMS pre-scorer active.")

    logger.info("=" * 70)
    logger.info(" ✅ ALL BACKGROUND WORKER POOLS ACTIVE AND PROCESSING SMS")
    logger.info("=" * 70)

    # Shutdown signal handler
    stop_event = asyncio.Event()

    def handle_signal():
        logger.info("Received termination signal. Shutting down worker pools...")
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, handle_signal)
        except NotImplementedError:
            pass  # Signal handlers on Windows main thread

    try:
        await stop_event.wait()
    except asyncio.CancelledError:
        pass
    finally:
        logger.info("Cleaning up background worker tasks...")
        await stop_prescorer_worker()
        await stop_activation_workers()
        await firebase_stream_manager.stop_listeners()
        logger.info("Worker process terminated cleanly.")


if __name__ == "__main__":
    try:
        asyncio.run(run_worker())
    except KeyboardInterrupt:
        logger.info("Worker process interrupted by user.")
