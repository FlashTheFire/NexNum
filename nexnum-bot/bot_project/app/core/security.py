from fastapi import HTTPException, Depends, Header
from app.core.config import get_settings
import logging

settings = get_settings()
logger = logging.getLogger(__name__)

API_KEY_HEADER = "X-API-Key"

async def verify_api_key(api_key: str = Header(None, alias=API_KEY_HEADER)):
    if api_key == settings.API_KEY:
        return {"user": "system"}
    raise HTTPException(status_code=401, detail="Invalid API Key")
