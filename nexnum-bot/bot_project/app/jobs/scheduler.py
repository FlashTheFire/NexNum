from apscheduler.schedulers.background import BackgroundScheduler
# pyrefly: ignore [missing-import]
from app.core.config import get_settings
import logging

settings = get_settings()
logger = logging.getLogger(__name__)


def schedule_jobs(scheduler: BackgroundScheduler):
    """
    Background job scheduler stub.
    Heartbeat monitor and command_cleanup jobs have been removed:
      - Heartbeat: Offline devices are valid for SMS purchase/receive — no status patching needed.
      - Command Cleanup: webhookEvent.sendSms feature is not in use.
    """
    logger.info("Background scheduler initialized. No periodic jobs currently active.")
