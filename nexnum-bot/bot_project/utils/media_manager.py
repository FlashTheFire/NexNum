import os
import logging
import hashlib
from typing import Union, Optional, Any
from telebot.async_telebot import AsyncTeleBot
from telebot.types import Message, InputFile

from utils.redis_manager import redis_manager
from utils.db import db_adapter

logger = logging.getLogger("media_manager")

import io
from telebot.types import Message, InputFile, InputMediaPhoto, InputMediaVideo, InputMediaAnimation

def _get_source_signature(file_source: str) -> str:
    """Generate a unique signature for the media source based on path/URL and file modification time."""
    try:
        if os.path.exists(file_source):
            mtime = os.path.getmtime(file_source)
            size = os.path.getsize(file_source)
            raw = f"{os.path.abspath(file_source)}:{mtime}:{size}"
        else:
            raw = str(file_source)
        return hashlib.md5(raw.encode('utf-8')).hexdigest()
    except Exception:
        return hashlib.md5(str(file_source).encode('utf-8')).hexdigest()

def prepare_input_media(media_source: Any, caption: Optional[str] = None, parse_mode: str = "HTML", media_type: str = "photo") -> Any:
    """
    Safely creates an InputMedia object (InputMediaPhoto, InputMediaVideo, InputMediaAnimation)
    handling local file paths, InputFile objects, BytesIO, Telegram file_ids, and public URLs.
    """
    if isinstance(media_source, str) and os.path.exists(media_source):
        with open(media_source, "rb") as f:
            input_bytes = f.read()
        input_obj = InputFile(io.BytesIO(input_bytes), file_name=os.path.basename(media_source))
    else:
        input_obj = media_source

    if isinstance(media_source, str):
        if media_source.lower().endswith(".gif"):
            media_type = "animation"
        elif media_source.lower().endswith((".mp4", ".avi", ".mov")):
            media_type = "video"

    if media_type == "animation":
        return InputMediaAnimation(media=input_obj, caption=caption, parse_mode=parse_mode)
    elif media_type == "video":
        return InputMediaVideo(media=input_obj, caption=caption, parse_mode=parse_mode)
    else:
        return InputMediaPhoto(media=input_obj, caption=caption, parse_mode=parse_mode)

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
    High-performance media sender using Redis & PostgreSQL for sub-millisecond Telegram file_id lookup.
    Automatically invalidates cache if local image source file or URL changes.
    """
    redis_key = f"bot_media_cache:{media_key}"
    sig_key = f"bot_media_cache:{media_key}:sig"
    current_sig = _get_source_signature(file_source)

    cached_file_id: Optional[str] = None
    cached_sig: Optional[str] = None

    # 1. Check Redis Cache first
    if redis_manager.redis_client:
        try:
            val = await redis_manager.redis_client.get(redis_key)
            sig_val = await redis_manager.redis_client.get(sig_key)
            if val:
                cached_file_id = val.decode('utf-8') if isinstance(val, bytes) else str(val)
            if sig_val:
                cached_sig = sig_val.decode('utf-8') if isinstance(sig_val, bytes) else str(sig_val)
        except Exception as err:
            logger.warning(f"Redis lookup for '{media_key}' failed: {err}")

    # 2. Fallback check in PostgreSQL if missing from Redis
    if not cached_file_id:
        try:
            cached_session = await db_adapter.get_user_session("GLOBAL_MEDIA_CACHE") or {}
            cached_file_id = cached_session.get(f"media_file_id:{media_key}")
            cached_sig = cached_session.get(f"media_sig:{media_key}")
        except Exception as pg_err:
            logger.warning(f"PostgreSQL lookup for '{media_key}' failed: {pg_err}")

    # 3. Cache Invalidation Check: If source file changed, purge stale file_id
    if cached_file_id and cached_sig and cached_sig != current_sig:
        logger.info(f"Media source for '{media_key}' changed. Invalidating cached file_id.")
        cached_file_id = None

    # 4. Fast Path: Send via cached Telegram file_id
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

    # 5. Upload media via local file path or public URL
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

    # 6. Extract generated Telegram file_id and cache in Redis & PostgreSQL indefinitely
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
                    await redis_manager.redis_client.set(sig_key, current_sig)
                except Exception as err:
                    logger.warning(f"Failed to cache file_id in Redis for '{media_key}': {err}")
            
            # Store in PostgreSQL
            try:
                cached_session = await db_adapter.get_user_session("GLOBAL_MEDIA_CACHE") or {}
                cached_session[f"media_file_id:{media_key}"] = extracted_file_id
                cached_session[f"media_sig:{media_key}"] = current_sig
                await db_adapter.save_user_session("GLOBAL_MEDIA_CACHE", cached_session)
            except Exception as pg_err:
                logger.warning(f"Failed to cache file_id in PostgreSQL for '{media_key}': {pg_err}")

            logger.info(f"Persisted media file_id for '{media_key}' in Redis & DB: {extracted_file_id}")

    return sent_msg

async def edit_or_cached_media(
    bot: AsyncTeleBot,
    chat_id: Union[int, str],
    message_id: int,
    media_key: str,
    file_source: Any,
    caption: Optional[str] = None,
    parse_mode: str = "HTML",
    reply_markup: Optional[Any] = None,
    media_type: str = "photo"
) -> Optional[Message]:
    """
    Edits message media using sub-millisecond cached file_id string, automatically uploading
    and caching local file paths or URLs if cache misses or source file changes.
    """
    if not isinstance(file_source, str):
        media_obj = prepare_input_media(file_source, caption=caption, parse_mode=parse_mode, media_type=media_type)
        return await bot.edit_message_media(media=media_obj, chat_id=chat_id, message_id=message_id, reply_markup=reply_markup)

    redis_key = f"bot_media_cache:{media_key}"
    sig_key = f"bot_media_cache:{media_key}:sig"
    current_sig = _get_source_signature(file_source)

    cached_file_id: Optional[str] = None
    cached_sig: Optional[str] = None

    if redis_manager.redis_client:
        try:
            val = await redis_manager.redis_client.get(redis_key)
            sig_val = await redis_manager.redis_client.get(sig_key)
            if val:
                cached_file_id = val.decode('utf-8') if isinstance(val, bytes) else str(val)
            if sig_val:
                cached_sig = sig_val.decode('utf-8') if isinstance(sig_val, bytes) else str(sig_val)
        except Exception:
            pass

    if not cached_file_id:
        try:
            cached_session = await db_adapter.get_user_session("GLOBAL_MEDIA_CACHE") or {}
            cached_file_id = cached_session.get(f"media_file_id:{media_key}")
            cached_sig = cached_session.get(f"media_sig:{media_key}")
        except Exception:
            pass

    if cached_file_id and cached_sig and cached_sig != current_sig:
        cached_file_id = None

    # 1. Fast Path: If cached file_id exists, edit message using cached file_id string
    if cached_file_id:
        try:
            media_obj = prepare_input_media(cached_file_id, caption=caption, parse_mode=parse_mode, media_type=media_type)
            return await bot.edit_message_media(media=media_obj, chat_id=chat_id, message_id=message_id, reply_markup=reply_markup)
        except Exception as e:
            logger.warning(f"Edit with cached file_id '{cached_file_id}' failed ({e}). Re-uploading media source...")
            cached_file_id = None

    # 2. Slow Path: Upload local file / URL to Telegram and edit message
    media_obj = prepare_input_media(file_source, caption=caption, parse_mode=parse_mode, media_type=media_type)
    edited_msg = await bot.edit_message_media(media=media_obj, chat_id=chat_id, message_id=message_id, reply_markup=reply_markup)

    # 3. Extract generated file_id and store in Redis & PostgreSQL
    if edited_msg:
        extracted_file_id = None
        if getattr(edited_msg, "photo", None):
            extracted_file_id = edited_msg.photo[-1].file_id
        elif getattr(edited_msg, "video", None):
            extracted_file_id = edited_msg.video.file_id
        elif getattr(edited_msg, "animation", None):
            extracted_file_id = edited_msg.animation.file_id
        elif getattr(edited_msg, "document", None):
            extracted_file_id = edited_msg.document.file_id

        if extracted_file_id:
            if redis_manager.redis_client:
                try:
                    await redis_manager.redis_client.set(redis_key, extracted_file_id)
                    await redis_manager.redis_client.set(sig_key, current_sig)
                except Exception:
                    pass
            try:
                cached_session = await db_adapter.get_user_session("GLOBAL_MEDIA_CACHE") or {}
                cached_session[f"media_file_id:{media_key}"] = extracted_file_id
                cached_session[f"media_sig:{media_key}"] = current_sig
                await db_adapter.save_user_session("GLOBAL_MEDIA_CACHE", cached_session)
            except Exception:
                pass

    return edited_msg
