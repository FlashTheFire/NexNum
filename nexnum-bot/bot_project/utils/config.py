import sys
import os
from pathlib import Path
_bot_project_dir = Path(__file__).resolve().parent
while _bot_project_dir.name != "bot_project" and _bot_project_dir.parent != _bot_project_dir:
    _bot_project_dir = _bot_project_dir.parent
if str(_bot_project_dir) not in sys.path:
    sys.path.insert(0, str(_bot_project_dir))
import os
import sys
from typing import Optional
from dotenv import load_dotenv

# Load unified root .env if present, followed by local .env
_root_env = _bot_project_dir.parent / ".env"
if _root_env.exists():
    load_dotenv(dotenv_path=_root_env)
load_dotenv()

def get_required_env(key: str) -> str:
    value = os.getenv(key)
    if not value:
        print(f"Error: Required environment variable {key} is not set")
        sys.exit(1)
    return value

# Required configurations
DEPOSIT_TIMEOUT = 15  # 15 minutes expiration time
INR_RATE = 1.0        # 1 INR = 1 Point (💎)
MIN_DEPOSIT = '1⩇'      # 1 Point (💎) minimum deposit amount
# config.py
DEPOSIT_CONFIG = {
    'currency': 'INR',
    'timeout': 15,
    'rate_limits': {
        'deposit': {'requests': 5, 'period': 60},
        'verification': {'requests': 10, 'period': 300}
    },
    'branding': {
        'qr_colors': {'dark': '#2a2f3d', 'light': '#ffffff'},
        'menu_image': 'https://example.com/deposit-banner.jpg'
    },
    'payment_methods': [
        {'id': 'upi', 'display_name': '💰 UPI'},
        {'id': 'card', 'display_name': '💳 Credit Card'}
    ]
}
APP_IMAGE_LIST = {
    '2203': 'https://i.ibb.co/Wvh4R4yX/image-removebg-preview.png',
}
# Payment Gateway Configuration
PAYMENT_GATEWAY_API = os.getenv("PAYMENT_GATEWAY_API", "https://api.payment-gateway.com/v1")
PAYMENT_GATEWAY_API_KEY = os.getenv("PAYMENT_GATEWAY_API_KEY", "dummy_gateway_key")

PAYMENT_GATEWAY = {
    'endpoint': f'{PAYMENT_GATEWAY_API}/charges',
    'status_endpoint': f'{PAYMENT_GATEWAY_API}/status',
    'headers': {'Authorization': f'Bearer {PAYMENT_GATEWAY_API_KEY}'}
}
# COMMISSION: stored as a multiplier — 1.25 means a 25% markup on base price.
# Override via COMMISSION env var (e.g. COMMISSION=1.10 for 10% markup).
_commission_raw = os.getenv("COMMISSION", "1.25")
try:
    COMMISSION = float(_commission_raw)
except ValueError:
    raise ValueError(f"COMMISSION env var '{_commission_raw}' is not a valid float")

if not (0.01 <= COMMISSION <= 100.0):
    raise ValueError(f"COMMISSION value {COMMISSION} is out of valid range [0.01, 100.0]")

BASE_TIMEOUT = int(os.getenv("BASE_TIMEOUT", 10))  # minutes
EXTENDED_TIMEOUT = int(os.getenv("EXTENDED_TIMEOUT", 20))  # minutes
CHECK_INTERVAL = int(os.getenv("CHECK_INTERVAL", 5))  # seconds
UPDATE_INTERVAL = int(os.getenv("UPDATE_INTERVAL", 60))  # seconds
BATCH_SIZE = int(os.getenv("BATCH_SIZE", 100))
ENV_FILE = os.getenv("ENV_FILE", ".env")


BOT_TOKEN = os.getenv("BOT_TOKEN") or os.getenv("TELEGRAM_BOT_TOKEN") or ""
if not BOT_TOKEN:
    print("Error: Required environment variable BOT_TOKEN or TELEGRAM_BOT_TOKEN is not set")
    sys.exit(1)

CHANNEL_ID = os.getenv("CHANNEL_ID") or os.getenv("TELEGRAM_ADMIN_CHANNEL") or ""
if not CHANNEL_ID:
    print("Error: Required environment variable CHANNEL_ID or TELEGRAM_ADMIN_CHANNEL is not set")
    sys.exit(1)

_admin_id_raw = os.getenv("ADMIN_ID") or os.getenv("TELEGRAM_ADMIN_ID") or "0"
try:
    ADMIN_ID = int(_admin_id_raw)
except ValueError:
    ADMIN_ID = 0
ADMIN_PHONE = os.getenv("ADMIN_PHONE")

ENABLE_TELETHON = os.getenv("ENABLE_TELETHON", "false").lower() == "true"
ENABLE_PROVIDER_SYNC = os.getenv("ENABLE_PROVIDER_SYNC", "false").lower() == "true"

# Supabase / PostgreSQL Database Configuration
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

def sanitize_db_url(url: str) -> str:
    if not url or "?" not in url:
        return url
    try:
        parsed = urlparse(url)
        params = parse_qs(parsed.query, keep_blank_values=True)
        params.pop('pgbouncer', None)
        params.pop('connection_limit', None)
        new_query = urlencode(params, doseq=True)
        return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment))
    except Exception:
        return url

_raw_db_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/postgres")
DATABASE_URL = sanitize_db_url(_raw_db_url)
_raw_direct_url = os.getenv("DIRECT_URL", DATABASE_URL)
DIRECT_URL = sanitize_db_url(_raw_direct_url)
NEXNUM_API_URL = os.getenv("NEXNUM_API_URL", "http://nexnum-app:3000")
NEXNUM_API_KEY = os.getenv("NEXNUM_API_KEY", os.getenv("ADMIN_API_KEY", "nexnum_admin_secret_key"))
PUBLIC_APP_URL = os.getenv("NEXT_PUBLIC_APP_URL", os.getenv("PUBLIC_APP_URL", "https://nexnum.in")).rstrip("/")
URL = os.getenv("URL", "")

def resolve_asset_source(env_val: Optional[str], default_rel_path: str) -> str:
    """
    Universal asset resolver pointing to local image files in bot_project/images/general.
    """
    if env_val and os.path.exists(env_val):
        return os.path.abspath(env_val)

    filename = os.path.basename(default_rel_path)
    candidates = [
        os.path.abspath(os.path.join(_bot_project_dir, "images", "general", filename)),
        os.path.abspath(os.path.join(_bot_project_dir, default_rel_path.lstrip("/"))),
        os.path.abspath(os.path.join(_bot_project_dir.parent, default_rel_path.lstrip("/"))),
        os.path.abspath(os.path.join(_bot_project_dir.parent.parent, "nexnum-app", "public", default_rel_path.lstrip("/"))),
        f"/app/bot_project/images/general/{filename}",
        f"/app/{default_rel_path.lstrip('/')}",
        f"/app/public/{default_rel_path.lstrip('/')}",
        f"/app/nexnum-app/public/{default_rel_path.lstrip('/')}"
    ]

    for path in candidates:
        if os.path.exists(path):
            return os.path.abspath(path)

    if env_val and (env_val.startswith("http://") or env_val.startswith("https://")):
        return env_val

    fallback_default = os.path.abspath(os.path.join(_bot_project_dir, "images", "general", "start-home_page.jpg"))
    return fallback_default if os.path.exists(fallback_default) else f"{PUBLIC_APP_URL}/{default_rel_path.lstrip('/')}"

START_PAGE = resolve_asset_source(os.getenv("START_PAGE"), "bot_project/images/general/start-home_page.jpg")
DEFAULT_BANNER_URL = START_PAGE
DEPOSIT_PAGE = resolve_asset_source(os.getenv("DEPOSIT_PAGE"), "bot_project/images/general/deposit-main_page.jpg")
REFERRAL_PAGE = resolve_asset_source(os.getenv("REFERRAL_PAGE"), "bot_project/images/general/start-home_page.jpg")
LOADING_GIF = resolve_asset_source(os.getenv("LOADING_GIF"), "bot_project/images/general/deposit-load_page.gif")
WALLET_PAGE = resolve_asset_source(os.getenv("WALLET_PAGE"), "bot_project/images/general/profile-main_page.png")
DEPOSIT_INR_QR_CODE = resolve_asset_source(os.getenv("DEPOSIT_INR_QR_CODE"), "bot_project/images/general/deposit-inr-qr_code.jpeg")
HISTORY_PAGE = resolve_asset_source(os.getenv("HISTORY_PAGE"), "bot_project/images/general/history-main_page.jpg")
SUPPORT_PAGE = resolve_asset_source(os.getenv("SUPPORT_PAGE"), "bot_project/images/general/support-main_page.jpg")
SETTINGS_PAGE = resolve_asset_source(os.getenv("SETTINGS_PAGE"), "bot_project/images/general/setting-currency.jpg")

# Redis configuration (Optional - only required if in-memory cache/search is enabled)
ENABLE_REDIS = os.getenv("ENABLE_REDIS", "true").lower() == "true"
USE_REDIS_FOR_SEARCH = os.getenv("USE_REDIS_FOR_SEARCH", "true").lower() == "true"
REDIS_URL = os.getenv("REDIS_URL", None)
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")  # Empty string if not set
REDIS_DB = int(os.getenv("REDIS_DB", 0))

# Service configuration
SMS_PROVIDERS = os.getenv("SMS_PROVIDERS", "default_provider")
APP_COUNT = int(os.getenv("APP_COUNT", 5))

ORDER_INDEX = os.getenv("ORDER_INDEX", "order_index")
ORDER_PREFIX = os.getenv("ORDER_PREFIX", "order_data:")

# Cache Configuration with reasonable defaults
CACHE_PREFIX = os.getenv("CACHE_PREFIX", "cache:")
INLINE_CACHE_PREFIX = f"{CACHE_PREFIX}inline_cache:"
CACHE_DURATION = int(os.getenv("CACHE_DURATION", 1800))  # 30 minutes
CACHE_RESULTS_PER_PAGE = int(os.getenv("CACHE_RESULTS_PER_PAGE", 10))
CACHE_EXPIRY = int(os.getenv("CACHE_EXPIRY", 300))  # 5 minutes
CACHE_KEY = os.getenv("CACHE_KEY", "cache-data:")
USER_IMAGE_HASH = os.getenv("USER_IMAGE_HASH", "image_data:user-profile")
IMGBB_API_KEY = os.getenv("IMGBB_API_KEY")

# Cloudinary configuration
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

# Validate critical configurations
def validate_config():
    if not BOT_TOKEN or len(BOT_TOKEN) < 20:
        print("Error: Invalid BOT_TOKEN configuration")
        sys.exit(1)

    if REDIS_PORT < 1 or REDIS_PORT > 65535:
        print("Error: Invalid REDIS_PORT configuration")
        sys.exit(1)

    if CACHE_DURATION < 0 or CACHE_EXPIRY < 0:
        print("Error: Cache durations cannot be negative")
        sys.exit(1)

    # Warn about missing upload credentials (image features will be degraded)
    missing_upload = []
    if not IMGBB_API_KEY:
        missing_upload.append("IMGBB_API_KEY")
    if not CLOUDINARY_CLOUD_NAME:
        missing_upload.append("CLOUDINARY_CLOUD_NAME")
    if not CLOUDINARY_API_KEY:
        missing_upload.append("CLOUDINARY_API_KEY")
    if not CLOUDINARY_API_SECRET:
        missing_upload.append("CLOUDINARY_API_SECRET")
    if missing_upload:
        print(
            f"Warning: Missing upload credential(s): {', '.join(missing_upload)}. "
            "Image upload features will be unavailable."
        )

validate_config()