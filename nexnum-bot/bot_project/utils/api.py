import sys
import os
from pathlib import Path
_bot_project_dir = Path(__file__).resolve().parent
while _bot_project_dir.name != "bot_project" and _bot_project_dir.parent != _bot_project_dir:
    _bot_project_dir = _bot_project_dir.parent
if str(_bot_project_dir) not in sys.path:
    sys.path.insert(0, str(_bot_project_dir))
import os
from dotenv import load_dotenv

load_dotenv()


SMS_PROVIDERS = {
    "nexnum.in": os.getenv("NEXNUM_API_KEY", None),
}
SMS_PROVIDERS_ID = {
    "1": {"url": "nexnum.in", "api_key": os.getenv("NEXNUM_API_KEY", None)},
}
SMS_PROVIDERS_MANAGEMENT = {
    'NexNumManager', '1',
}
SMS_PROVIDERS_KEY = {
    'NexNumManager': '1',
}

NEXNUM_API_KEY = os.getenv("NEXNUM_API_KEY", None)