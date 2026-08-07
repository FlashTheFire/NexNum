import logging
import sys

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )
    # Set lower for third-party libs
    logging.getLogger("firebase_admin").setLevel(logging.WARNING)
    logging.getLogger("apscheduler").setLevel(logging.WARNING)
