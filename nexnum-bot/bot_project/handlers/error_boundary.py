# handlers/error_boundary.py
"""
Global Error Boundary Decorator & Middleware for Telegram Bot Handlers.
Wraps all Telebot message, callback query, and inline query handlers.
Logs all unhandled exceptions cleanly and responds safely to the user.
"""

from __future__ import annotations

import functools
import logging
import traceback
from typing import Callable, Any
from telebot.types import Message, CallbackQuery, InlineQuery

logger = logging.getLogger("bot_error_boundary")


def safe_handler(func: Callable) -> Callable:
    """
    Decorator that wraps async Telegram bot handler functions in a try/except error boundary.
    Logs exceptions with full traceback and sends a user-friendly error response.
    """
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            func_name = getattr(func, "__name__", str(func))
            logger.error(f"[TELEBOT_ERROR_BOUNDARY] Unhandled exception in handler '{func_name}': {e}\n{traceback.format_exc()}")
            
            # Extract Telebot call object (Message, CallbackQuery, or InlineQuery)
            event_obj = None
            for arg in args:
                if isinstance(arg, (Message, CallbackQuery, InlineQuery)):
                    event_obj = arg
                    break
            if not event_obj and "call" in kwargs:
                event_obj = kwargs["call"]
            elif not event_obj and "message" in kwargs:
                event_obj = kwargs["message"]

            bot = kwargs.get("bot") or getattr(args[0], "bot", None) if args else None

            # User-friendly error message response
            error_msg = "⚠️ Service temporarily busy. Please try again shortly."

            if event_obj and bot:
                try:
                    if isinstance(event_obj, CallbackQuery):
                        await bot.answer_callback_query(event_obj.id, text=error_msg, show_alert=True)
                    elif isinstance(event_obj, Message):
                        await bot.send_message(event_obj.chat.id, text=error_msg)
                except Exception as resp_err:
                    logger.warning(f"[TELEBOT_ERROR_BOUNDARY] Failed to send fallback error response to user: {resp_err}")

            return None

    return wrapper
