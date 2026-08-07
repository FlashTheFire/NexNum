from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from concurrent.futures import ThreadPoolExecutor
# pyrefly: ignore [missing-import]
from app.crud import firebase_crud as crud
# pyrefly: ignore [missing-import]
from app.core.config import get_settings
import time
import logging

settings = get_settings()
logger = logging.getLogger(__name__)

def heartbeat_monitor():
    """Check all clients and update status in parallel based on lastMessageTime."""
    clients = crud.get_all_clients()
    now = int(time.time() * 1000)
    threshold = 5 * 60 * 1000  # 5 minutes in ms

    to_update = []
    for client_id, data in clients.items():
        last_time = data.get("lastMessageTime", 0)
        current_status = data.get("status", False)
        # If last message older than threshold, mark offline
        new_status = (now - last_time) <= threshold if last_time else False
        if current_status != new_status:
            to_update.append((client_id, new_status))

    if not to_update:
        return

    def _do_update(item):
        cid, n_status = item
        crud.update_client(cid, {"status": n_status})

    # Execute all status updates concurrently across worker threads
    with ThreadPoolExecutor(max_workers=25) as executor:
        list(executor.map(_do_update, to_update))

    logger.info(f"Heartbeat monitor completed status updates for {len(to_update)} clients.")

def command_cleanup():
    """Remove completed webhookEvents in parallel."""
    clients = crud.get_all_clients()
    to_clear = []
    for client_id, data in clients.items():
        webhook = data.get("webhookEvent", {})
        send_sms = webhook.get("sendSms")
        if send_sms and send_sms.get("isSended") == True:
            to_clear.append(client_id)

    if not to_clear:
        return

    with ThreadPoolExecutor(max_workers=25) as executor:
        list(executor.map(crud.clear_webhook_event, to_clear))

    logger.info(f"Cleared completed webhookEvents for {len(to_clear)} clients.")

def schedule_jobs(scheduler: BackgroundScheduler):
    # Heartbeat every minute
    scheduler.add_job(
        heartbeat_monitor,
        trigger=IntervalTrigger(seconds=settings.HEARTBEAT_INTERVAL_SECONDS),
        id="heartbeat_monitor",
        replace_existing=True
    )
    # Command cleanup every 10 minutes
    scheduler.add_job(
        command_cleanup,
        trigger=IntervalTrigger(minutes=10),
        id="command_cleanup",
        replace_existing=True
    )
    logger.info("Background jobs scheduled with parallel threadpool execution.")
