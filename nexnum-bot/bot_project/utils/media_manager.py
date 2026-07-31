import os
import logging
from typing import Union, Optional, Any
from telebot.async_telebot import AsyncTeleBot
from telebot.types import Message, InputFile

from utils.redis_manager import redis_manager
from utils.db import db_adapter

logger = logging.getLogger("media_manager")

async def send_or_cached_media(
    bot: AsyncTeleBot,
    chat_id: Union[int, str],
    media_key: str,
    file_source: str,
    caption: Optional[str] = None,
    parse_mode: str = "HTML",
    reply_markup: Optional[Any] = None,
    media_type: str = "photo"
) -> Optional[Message]:
    """
    High-performance media sender using Redis for sub-millisecond Telegram file_id lookup.
    
    Caching Flow:
    1. Checks Redis (`bot_media_cache:{media_key}`) for ultra-fast response (<1ms).
    2. Fallback to PostgreSQL `user_sessions` if Redis cache misses.
    3. If not cached, uploads local file / URL, captures Telegram's generated file_id,
       and stores it indefinitely in Redis and PostgreSQL.
    """
    redis_key = f"bot_media_cache:{media_key}"
    cached_file_id: Optional[str] = None

    # 1. Check Redis Cache first
    if redis_manager.redis_client:
        try:
            val = await redis_manager.redis_client.get(redis_key)
            if val:
                cached_file_id = val.decode('utf-8') if isinstance(val, bytes) else str(val)
        except Exception as err:
            logger.warning(f"Redis lookup for '{media_key}' failed: {err}")

    # 2. Fallback check in PostgreSQL if missing from Redis
    if not cached_file_id:
        try:
            cached_session = await db_adapter.get_user_session("GLOBAL_MEDIA_CACHE") or {}
            cached_file_id = cached_session.get(f"media_file_id:{media_key}")
            # Repopulate Redis cache if found in PostgreSQL
            if cached_file_id and redis_manager.redis_client:
                try:
                    await redis_manager.redis_client.set(redis_key, cached_file_id)
                except Exception:
                    pass
        except Exception as pg_err:
            logger.warning(f"PostgreSQL lookup for '{media_key}' failed: {pg_err}")

    # 3. Fast Path: Send via cached Telegram file_id
    if cached_file_id:
        try:
            if media_type == "photo":
                return await bot.send_photo(chat_id, cached_file_id, caption=caption, parse_mode=parse_mode, reply_markup=reply_markup)
            elif media_type == "video":
                return await bot.send_video(chat_id, cached_file_id, caption=caption, parse_mode=parse_mode, reply_markup=reply_markup)
            elif media_type == "animation":
                return await bot.send_animation(chat_id, cached_file_id, caption=caption, parse_mode=parse_mode, reply_markup=reply_markup)
            else:
                return await bot.send_document(chat_id, cached_file_id, caption=caption, parse_mode=parse_mode, reply_markup=reply_markup)
        except Exception as e:
            logger.warning(f"Cached file_id for '{media_key}' failed or expired ({e}). Re-uploading media source...")

    # 4. Upload media via local file path or public URL
    sent_msg = None
    if os.path.exists(file_source):
        with open(file_source, "rb") as f:
            input_file = InputFile(f)
            if media_type == "photo":
                sent_msg = await bot.send_photo(chat_id, input_file, caption=caption, parse_mode=parse_mode, reply_markup=reply_markup)
            elif media_type == "video":
                sent_msg = await bot.send_video(chat_id, input_file, caption=caption, parse_mode=parse_mode, reply_markup=reply_markup)
            elif media_type == "animation":
                sent_msg = await bot.send_animation(chat_id, input_file, caption=caption, parse_mode=parse_mode, reply_markup=reply_markup)
            else:
                sent_msg = await bot.send_document(chat_id, input_file, caption=caption, parse_mode=parse_mode, reply_markup=reply_markup)
    else:
        if media_type == "photo":
            sent_msg = await bot.send_photo(chat_id, file_source, caption=caption, parse_mode=parse_mode, reply_markup=reply_markup)
        elif media_type == "video":
            sent_msg = await bot.send_video(chat_id, file_source, caption=caption, parse_mode=parse_mode, reply_markup=reply_markup)
        elif media_type == "animation":
            sent_msg = await bot.send_animation(chat_id, file_source, caption=caption, parse_mode=parse_mode, reply_markup=reply_markup)
        else:
            sent_msg = await bot.send_document(chat_id, file_source, caption=caption, parse_mode=parse_mode, reply_markup=reply_markup)

    # 5. Extract generated Telegram file_id and cache in Redis & PostgreSQL indefinitely
    if sent_msg:
        extracted_file_id = None
        if getattr(sent_msg, "photo", None):
            extracted_file_id = sent_msg.photo[-1].file_id
        elif getattr(sent_msg, "video", None):
            extracted_file_id = sent_msg.video.file_id
        elif getattr(sent_msg, "animation", None):
            extracted_file_id = sent_msg.animation.file_id
        elif getattr(sent_msg, "document", None):
            extracted_file_id = sent_msg.document.file_id

        if extracted_file_id:
            # Store in Redis
            if redis_manager.redis_client:
                try:
                    await redis_manager.redis_client.set(redis_key, extracted_file_id)
                except Exception as err:
                    logger.warning(f"Failed to cache file_id in Redis: {err}")
            
            # Store in PostgreSQL
            try:
                await db_adapter.save_user_session("GLOBAL_MEDIA_CACHE", {
                    f"media_file_id:{media_key}": extracted_file_id
                })
            except Exception as err:
                logger.warning(f"Failed to cache file_id in PostgreSQL: {err}")

            logger.info(f"Persisted media file_id for '{media_key}' in Redis & DB: {extracted_file_id}")

    return sent_msg
