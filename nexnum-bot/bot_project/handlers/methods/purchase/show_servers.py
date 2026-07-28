import sys
import os
from pathlib import Path
_bot_project_dir = Path(__file__).resolve().parent
while _bot_project_dir.name != "bot_project" and _bot_project_dir.parent != _bot_project_dir:
    _bot_project_dir = _bot_project_dir.parent
if str(_bot_project_dir) not in sys.path:
    sys.path.insert(0, str(_bot_project_dir))
from telebot.async_telebot import AsyncTeleBot
from telebot.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery, Message, InlineQuery, InlineQueryResultArticle, InputTextMessageContent, InlineQueryResultArticle
from redis.commands.search.query import Query
from utils.functions import setup_logger, small_caps, large_caps, country_flag_link, format_number_to_text
from utils.cache_manager import cache_manager, CachePrefix
from utils.redis_manager import redis_manager, RedisManager
from utils.config import APP_COUNT, COMMISSION
from utils.api_client import api_client
from handlers.security import RateLimiter, InputValidator, TransactionGuard
from handlers.manager.operation import OrderManagement, UserManagement
from datetime import datetime, timedelta
from termcolor import colored
from pydantic import BaseModel, Field, validator
from utils.redis_keys import RedisKeys

import json
import uuid
import time
import asyncio
from functools import lru_cache, partial
from typing import Dict, Any, Optional, List, Tuple, Union
from redis import Redis

class UserServerManagement:
    def __init__(self) -> None:
        self.input_validator: Optional[InputValidator] = None
        self.user_manager: Optional[UserManagement] = None
        self.transaction_guard: Optional[TransactionGuard] = None
        self._initialized: bool = False
        self.bot: Optional[AsyncTeleBot] = None
        self.redis_client: Optional[RedisManager] = None

    async def init_managers(self, user_mgr: UserManagement, bot: Optional[AsyncTeleBot] = None) -> bool:
        try:
            if not user_mgr or not bot:
                print("User manager and bot instance are required")
                return False

            self.user_manager = user_mgr
            self.bot = bot
            self.input_validator = getattr(bot, 'input_validator', None)
            self.transaction_guard = getattr(bot, 'transaction_guard', None)
            self.redis_client = await redis_manager.get_client()

            if not all([self.user_manager, self.input_validator, self.transaction_guard]):
                missing = [name for name, comp in [
                    ('user_manager', self.user_manager),
                    ('input_validator', self.input_validator),
                    ('transaction_guard', self.transaction_guard)
                ] if not comp]
                print(f"Missing required components: {', '.join(missing)}")
                return False

            self._initialized = True
            return True

        except Exception as e:
            print(f"Error initializing managers: {e}")
            return False

    async def ensure_managers_initialized(self) -> bool:
        if not self._initialized:
            print("Security components not properly initialized")
            return False
        return True
    
    async def stock_formatter(self, n: float) -> str: 
        if n < 2:
            return "🌑"  # Dark Moon for < 5
        if n < 10:
            return "🔴"  # Red for 5 - 99
        if n < 30:
            return "🟠"  # Orange for 100 - 499
        if n < 50:
            return "🟡"  # Yellow for 500 - 999
        if n < 1000:
            return "🟢"  # Green for 1,000 - 9,999
        if n < 100000:
            return "🟢" #"🔵"  # Blue for 10,000 - 99,999
        return "🟢"  # White for 100,000+

    async def validate_server_request(self, user_id: str, app_id: str, server_id: Optional[str] = None) -> Dict[str, Any]:
        try:
            if not await self.ensure_managers_initialized():
                return {"valid": False, "error": "🛠️ Sᴇʀᴠɪᴄᴇ Tᴇᴍᴘᴏʀᴀʀɪʟʏ Uɴᴀᴠᴀɪʟᴀʙʟᴇ..."}
                #return {"valid": False, "error": f"⚠️ Tᴏᴏ Mᴀɴʏ Sᴇʀᴠᴇʀ Rᴇǫᴜᴇsᴛs. Pʟᴇᴀsᴇ Wᴀɪᴛ {reset_time:.0f}s. (🔄 {remaining} ʟᴇғᴛ)"}
            if not self.input_validator.validate_user_id(user_id):
                return {"valid": False, "error": "🆔 Iɴᴠᴀʟɪᴅ Usᴇʀ ID Fᴏʀᴍᴀᴛ"}
            if not app_id:
                return {"valid": False, "error": "🔢 Iɴᴠᴀʟɪᴅ Aᴘᴘ ID Fᴏʀᴍᴀᴛ"}
            if server_id and not server_id.isdigit():
                return {"valid": False, "error": "🔢 Iɴᴠᴀʟɪᴅ Sᴇʀᴠᴇʀ ID Fᴏʀᴍᴀᴛ"}
            return {"valid": True}
        except Exception as e:
            return {"valid": False, "error": "🔒 Iɴᴛᴇʀɴᴀʟ Vᴀʟɪᴅᴀᴛɪᴏɴ Eʀʀᴏʀ"}

    async def build_query(self, filters: dict) -> str:
        async def process_filter(field: str, value: Any) -> Optional[str]:
            if value is None:
                return None
            if isinstance(value, list) and value:
                options = ' | '.join(map(str, value))
                return f"@{field}:({options})"
            elif isinstance(value, tuple) and len(value) == 2:
                start, end = value
                return f"@{field}:[{start} {end}]"
            else:
                return f"@{field}:{value}"

        tasks = [process_filter(field, value) for field, value in filters.items()]
        query_parts = await asyncio.gather(*tasks)
        query_parts = [part for part in query_parts if part is not None]
        return ' '.join(query_parts) if query_parts else '*'

    async def fetch_server_data(
        self,
        redis_client: RedisManager,
        app_id: str,
        country_id: Optional[str] = None,
        country_name: Optional[str] = None,
        is_inline: Optional[bool] = False,
        is_admin: Optional[bool] = False,
        app_count: Optional[str] = "[1 +inf]",
        app_price: Optional[str] = "[0.01 +inf]",
        limit: Optional[int] = None,
        sort_by: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        try:
            # Construct cache key
            cache_key = f"{app_id or ''}:{country_id or ''}:{country_name or ''}:{is_inline}:{is_admin}:{app_count or ''}:{app_price or ''}:{limit or ''}:{sort_by or ''}"
            cache_data = await cache_manager.get(cache_key, CachePrefix.COUNTRY)
            if cache_data:
                return cache_data

            # Resolve service info to get exact service code/name
            svc_resp = await api_client.get_services(limit=500)
            svc_list = svc_resp.get("services", [])
            clean_id = str(app_id).lower().replace("-", " ")
            target_svc = next((
                s for s in svc_list
                if str(s.get("id", "")).lower() == clean_id
                or str(s.get("code", "")).lower() == clean_id
                or str(s.get("name", "")).lower() == clean_id
                or str(s.get("code", "")).lower().replace(" ", "-") == str(app_id).lower()
                or str(s.get("name", "")).lower().replace(" ", "-") == str(app_id).lower()
            ), None)

            svc_param = target_svc.get("code") or target_svc.get("name") if target_svc else clean_id
            items = await api_client.get_countries(service=svc_param, limit=limit or 200)
            if not items and target_svc and target_svc.get("name"):
                items = await api_client.get_countries(service=target_svc.get("name"), limit=limit or 200)
            if not items:
                items = await api_client.get_countries(limit=limit or 200)
            if not items:
                return None

            whole_country_data = await redis_client.json().get('main_data:details:country_data') or {}
            servers_data: Dict[str, Any] = {}
            all_countries: Dict[str, float] = {}
            global_app_name: str = target_svc.get("name") or app_id if target_svc else str(app_id)

            for item in items:
                sid_raw = str(item.get("serverId") or item.get("providerId") or "1")
                app_name_val = str(item.get("serviceName") or global_app_name)
                cid = str(item.get("id") or item.get("countryCode") or "1")
                ccode = str(item.get("code") or item.get("flag") or item.get("name") or whole_country_data.get(cid, {}).get('country_code', cid))

                price = float(item.get("price") or item.get("pointPrice") or item.get("minPrice") or 0.0)
                stock = int(item.get("stock") or item.get("totalStock") or 0)

                global_app_name = app_name_val
                all_countries[cid] = min(all_countries.get(cid, float('inf')), price)

                if sid_raw not in servers_data:
                    servers_data[sid_raw] = {
                        "countries": {cid: price},
                        "country_codes": {cid: ccode},
                        "min_price": price,
                        "total_stock": stock
                    }
                else:
                    servers_data[sid_raw]["countries"][cid] = min(servers_data[sid_raw]["countries"].get(cid, float('inf')), price)
                    servers_data[sid_raw]["country_codes"][cid] = ccode
                    servers_data[sid_raw]["min_price"] = min(servers_data[sid_raw]["min_price"], price)
                    servers_data[sid_raw]["total_stock"] += stock

            if not servers_data:
                return None

            # Determine top 3 countries overall
            top_countries = sorted(all_countries.items(), key=lambda x: (x[1], x[0]))[:3]
            top_country_ids = [cid for cid, _ in top_countries]

            # Sort each server's country list by price
            for srv in servers_data.values():
                sorted_list = sorted(srv["countries"].items(), key=lambda x: x[1])
                srv["countries"] = [cid for cid, _ in sorted_list]

            data = {
                "servers": servers_data,
                "app_name": global_app_name,
                "all_countries": top_country_ids
            }
            await cache_manager.set(cache_key, data, CachePrefix.COUNTRY)
            return data

        except Exception:
            return None

    async def show_server(
        self,
        message: Message,
        app_id: str,
        country_id: Optional[str] = None,
        country_code: Optional[str] = None,
        page: int = 1,
        is_admin: bool = False
    ) -> Tuple[Optional[Message], Optional[str], Optional[InlineKeyboardMarkup]]:

        # 1) Build a cache key
        key_parts = [
            f"app={app_id or ''}",
            f"cid={country_id or ''}",
            f"ccode={country_code or ''}",
            f"page={page}",
            f"admin={int(is_admin)}"
        ]
        cache_key = "show_srv:" + "|".join(key_parts)

        # 2) Try cache
        cached = await cache_manager.get(cache_key, prefix=CachePrefix.BUTTONS)
        if cached:
            # Reconstruct the keyboard
            markup_dict = cached["markup"]
            keyboard = InlineKeyboardMarkup([
                [InlineKeyboardButton(**btn) for btn in row]
                for row in markup_dict["inline_keyboard"]
            ])

            # Unpack exactly [message, text]
            text = cached["text"]
            return text, keyboard

        # 3) Cache miss → fetch & build
        try:
            data = await self.fetch_server_data(
                redis_client=self.redis_client,
                app_id=app_id,
                country_id=country_id,
                is_admin=is_admin
            )
            if not data or not data.get("servers"):
                return None, None

            keyboard = InlineKeyboardMarkup()
            full_country_data = await self.get_country_data()
            sorted_servers = sorted(
                data["servers"].items(),
                key=lambda x: float(x[1]["min_price"])
            )

            for server_id, info in sorted_servers:
                countries = info["countries"]
                is_show = info.get("is_show_server")
                # map first 3 country IDs to flags
                country_display: List[str] = []
                for i, cid in enumerate(countries):
                    if i >= 3:
                        break
                    code = full_country_data.get(cid, {}).get("country_code") or info.get("country_codes", {}).get(cid) or cid
                    if code:
                        country_display.append(str(code))
                if not country_display:
                    country_display.append(str(country_code or country_id or "IN"))
                if len(countries) > 3:
                    country_display.append("...")
                price = float(info["min_price"]) * float(COMMISSION)
                stock = await self.stock_formatter(info["total_stock"])

                if is_admin:
                    cb1 = f"#modify_data:{app_id}:{country_id}:{server_id}"
                    if len(cb1) > 64:
                        continue
                    label = (
                        f"〔{', '.join(country_display)}〕 » Sᴇʀᴠᴇʀ{server_id}"
                    ).translate(await small_caps())

                    if is_show == 'True':
                        line = f"☰ {price:.2f}    ⃝🟢".translate(await small_caps())
                    else:
                        line = f"☰ {price:.2f} 🔴 ⃝ ".translate(await small_caps())

                    keyboard.add(
                        InlineKeyboardButton(label, callback_data=cb1),
                        InlineKeyboardButton(
                            line,
                            callback_data=f"admin_is_server:{page}:{app_id}:{country_id}:{server_id}:{is_show}"
                        )
                    )
                    is_admin = 'Admin_'
                else:
                    btn_text = (
                        f"Sᴇʀᴠᴇʀ{server_id} ➨ "
                        f"[{', '.join(country_display)}] » 💎 {price:.2f} 〔{stock}〕"
                    ).translate(await small_caps())

                    cb = f"purchase:{app_id}:{price:.2f}:{server_id}:{country_id}:{country_display[0]}"
                    keyboard.add(InlineKeyboardButton(text=btn_text, callback_data=cb))
                    is_admin = ''

            # no servers → user feedback
            if not keyboard.keyboard:
                await self.bot.reply_to(message, "❌ Nᴏ Aᴠᴀɪʟᴀʙʟᴇ Sᴇʀᴠᴇʀs Wɪᴛʜ Sᴛᴏᴄᴋ.")
                return None, None

            # optional “deselect” & “countries” row
            if country_id:
                keyboard.add(
                    InlineKeyboardButton(
                        text=f"• Dᴇsᴇʟᴇᴄᴛ [{country_code}]",
                        callback_data=f"{is_admin.lower()}country:{page}:{app_id}"
                    ),
                    InlineKeyboardButton(
                        text="⌕ Cᴏᴜɴᴛʀɪᴇs",
                        switch_inline_query_current_chat=(
                            f"#{is_admin.replace('_','').translate(await small_caps())}"
                            f"AᴘᴘIᴅ:{app_id.translate(await small_caps())} "
                        )
                    )
                )

            text = (
                f"<b>⦿ Sᴇʀᴠɪᴄᴇ ❯</b> {data['app_name'].translate(await small_caps())}\n\n"
                f"<b>↓ Cʜᴏᴏsᴇ Sᴇʀᴠᴇʀ Bᴇʟᴏw</b>"
            )

            # 4) Cache the result
            meta = text
            button_data = {"markup": keyboard.to_dict(), "text": meta}
            await cache_manager.set(cache_key, button_data, prefix=CachePrefix.BUTTONS)
            return text, keyboard

        except Exception:
            await self.bot.reply_to(
                message,
                "❌ Aɴ Eʀʀᴏʀ Oᴄᴄᴜʀʀᴇᴅ Wʜɪʟᴇ Fᴇᴛᴄʜɪɴɢ Sᴇʀᴠᴇʀs."
            )
            return None, None

    async def process_show_servers(self, call: CallbackQuery, is_admin: bool = False) -> None:
        """
        Process a callback query to show servers.
        """
        try:
            parts = call.data.replace(' ', '').split(':')
            user_id = call.message.chat.id
            #print(f"Parts: {parts}")
            #print(f"Parts length: {call.data}")
            if len(parts) < 2 or len(parts) > 4:
                await self.bot.answer_callback_query(call.id, "⚠️ Iɴᴠᴀʟɪᴅ Rᴇǫᴜᴇsᴛ", show_alert=True)
                return
            app_id = parts[1]
            country_id = parts[2] if len(parts) > 2 else None
            page = parts[3] if len(parts) > 3 else 1
            if not app_id:
                await self.bot.answer_callback_query(call.id, "🚫 Iɴᴠᴀʟɪᴅ Aᴘᴘ ID", show_alert=True)
                return
            transaction_key = RedisKeys.transaction_lock_key(user_id, f"show_servers:{app_id}:{country_id}")
            async with TransactionGuard(self.redis_client) as guard:
                if not await self._acquire_transaction_lock(guard, transaction_key, call):
                    return
                try:
                    country_data = await self.get_country_data(country_id)
                    country_code = country_data.get('country_code', None)
                    text, keyboard = await self.show_server(call.message, app_id, country_id, country_code, page, is_admin)
                    #print(text, keyboard)
                    if text and keyboard:
                         await self.bot.edit_message_text(
                            chat_id=call.message.chat.id,
                            message_id=call.message.message_id,
                            text=text,
                            reply_markup=keyboard,
                            parse_mode='HTML'
                        )
                    else:
                        await self.bot.answer_callback_query(call.id, "🚫 Nᴏ Sᴇʀᴠᴇʀs Aᴠᴀɪʟᴀʙʟᴇ.", show_alert=False)
                except Exception as e:
                    print(f"5 Error processing show servers: {e}")
                    await self.bot.answer_callback_query(call.id, "🚫 Nᴏ Sᴇʀᴠᴇʀs Aᴠᴀɪʟᴀʙʟᴇ.", show_alert=False)
                finally:
                    await guard.release_lock(transaction_key)
        except Exception as e:
            print(f"6 Error processing show servers: {e}")
            await self.bot.answer_callback_query(call.id, "🚫 Nᴏ Sᴇʀᴠᴇʀs Aᴠᴀɪʟᴀʙʟᴇ.", show_alert=False)

    async def is_server_save(self, app_id: str, server_id: str, country_id: str, is_show: bool):
        """
        Searches Redis for keys matching the pattern 'quote:{country_id}:*:{app_id}'
        and updates each hash field ('is_show_app', 'is_show_server', 'is_show_country') to "True"
        if is_admin is True; otherwise "False".
        Returns a list of keys if found, or None.
        """
        pattern = f"quote:{country_id}:{server_id}:{app_id}"
        # If your Redis client is async, use await here; otherwise adjust accordingly.
        keys = await self.redis_client.keys(pattern)
        if not keys:
            return None
        if str(is_show) == 'True':
            new_status = 'False'
        elif str(is_show) == 'False':
            new_status = 'True'

        for key in keys:
            #await self.redis_client.hset(key, 'is_show_app', new_status)
            await self.redis_client.hset(key, 'is_show_server', new_status)
            await self.redis_client.hset(key, 'is_show_country', new_status)
        return keys

    async def handle_is_admin_servers(self, call: CallbackQuery, is_admin: bool = False) -> None:
        """
        Process a callback query to show servers.
        """
        try:
            parts = call.data.replace(' ', '').split(':')
            user_id = call.message.chat.id
            #print(f"Parts: {parts}")
            #print(f"Parts length: {call.data}")
            if len(parts) < 6 or len(parts) > 6:
                await self.bot.answer_callback_query(call.id, "⚠️ Iɴᴠᴀʟɪᴅ Rᴇǫᴜᴇsᴛ", show_alert=True)
                return
            page = parts[1]
            app_id = parts[2]
            country_id = parts[3]
            server_id = parts[4]
            is_show = parts[5] if len(parts) > 5 else False
            if not app_id or not server_id:
                await self.bot.answer_callback_query(call.id, "🚫 Iɴᴠᴀʟɪᴅ Aᴘᴘ ID or Sᴇʀᴠᴇʀ ID", show_alert=True)
                return
            transaction_key = RedisKeys.transaction_lock_key(user_id, f"show_servers:{app_id}:{country_id}")
            async with TransactionGuard(self.redis_client) as guard:
                if not await self._acquire_transaction_lock(guard, transaction_key, call):
                    return
                try:
                    #empliment save function
                    t = await self.is_server_save(app_id=app_id, server_id=server_id, country_id=country_id, is_show=is_show)
                    ##print(t)
                    country_data = await self.get_country_data(country_id)
                    country_code = country_data.get('country_code', None)
                    text, keyboard = await self.show_server(call.message, app_id, country_id, country_code, page, is_admin)
                    if text and keyboard:
                         await self.bot.edit_message_text(
                            chat_id=call.message.chat.id,
                            message_id=call.message.message_id,
                            text=text,
                            reply_markup=keyboard,
                            parse_mode='HTML'
                        )
                    else:
                        await self.bot.answer_callback_query(call.id, "🚫 Nᴏ Sᴇʀᴠᴇʀs Aᴠᴀɪʟᴀʙʟᴇ.", show_alert=False)
                except Exception as e:
                    print(f"1 Error processing show servers: {e}")
                    await self.bot.answer_callback_query(call.id, "🚫 Nᴏ Sᴇʀᴠᴇʀs Aᴠᴀɪʟᴀʙʟᴇ.", show_alert=False)
                finally:
                    await guard.release_lock(transaction_key)
        except Exception as e:
            print(f"2 Error processing show servers: {e}")
            await self.bot.answer_callback_query(call.id, "🚫 Nᴏ Sᴇʀᴠᴇʀs Aᴠᴀɪʟᴀʙʟᴇ.", show_alert=False)

    async def _acquire_transaction_lock(self, guard, transaction_key, input_data) -> bool:
        """Acquire transaction lock with error handling."""
        if not await guard.acquire_lock(transaction_key):
            try:
                if isinstance(input_data, CallbackQuery):
                    await self.bot.answer_callback_query(
                        input_data.id,
                        "🔒 Aɴᴏᴛʜᴇʀ Tʀᴀɴsᴀᴄᴛɪᴏɴ Iɴ Pʀᴏɢʀᴇss, Pʟᴇᴀsᴇ Wᴀɪᴛ...", 
                        show_alert=False
                    )
                else:
                    await self.bot.send_message(
                        input_data.chat.id,
                        "🔒 Aɴᴏᴛʜᴇʀ Tʀᴀɴsᴀᴄᴛɪᴏɴ Iɴ Pʀᴏɢʀᴇss, Pʟᴇᴀsᴇ Wᴀɪᴛ...",
                        parse_mode='html'
                    )
            except Exception as e:
                print(f"Error sending message: {e}")
            return False
        return True

    async def process_buy_command(self, message: Message, is_admin: bool = False) -> None:
        """
        Process a callback query to show servers.
        """
        try:
            if not is_admin:
                parts = message.text.split('_')
            else:
                parts = message.text.split('|')
            
            #print(f"Parts: {parts}")
            user_id = message.from_user.id
            app_id = parts[1]
            country_id = parts[2] if len(parts) > 2 else None
            if not app_id:
                await self.bot.reply_to(message, "🚫 Iɴᴠᴀʟɪᴅ Aᴘᴘ ID")
                return
            if len(parts) < 2:
                await self.bot.reply_to(message, "⚠️ Iɴᴠᴀʟɪᴅ Rᴇǫᴜᴇsᴛ", show_alert=True)
                return
            transaction_key = RedisKeys.transaction_lock_key(user_id, f"show_servers:{app_id}:{country_id}")
            async with TransactionGuard(self.redis_client) as guard:
                if not await self._acquire_transaction_lock(guard, transaction_key, message):
                    return
                try:
                    country_data = await self.get_country_data(country_id)
                    country_code = country_data.get('country_code', None)
                    text, keyboard = await self.show_server(message, app_id, country_id, country_code, "1", is_admin)
                    if text and keyboard:
                        await self.bot.send_message(
                            chat_id=message.chat.id,
                            text=text,
                            reply_markup=keyboard,
                            parse_mode='HTML'
                        )
                    else:
                        await self.bot.reply_to(message, "🚫 Nᴏ Sᴇʀᴠᴇʀs Aᴠᴀɪʟᴀʙʟᴇ.", show_alert=False)
                except Exception as e:
                    print(f"3 Error processing show servers: {e}")
                    error_message = "<blockquote><b>👨🏻‍💻Nᴏ Sᴇʀᴠᴇʀs Aᴠᴀɪʟᴀʙʟᴇ.</b>..</blockquote>"
                    await self.bot.send_message(user_id, error_message, parse_mode='html')
                finally:
                    await guard.release_lock(transaction_key)
        except Exception as e:
            print(f"4 Error processing show servers: {e}")
            error_message = "<blockquote><b>👨🏻‍💻Nᴏ Sᴇʀᴠᴇʀs Aᴠᴀɪʟᴀʙʟᴇ.</b>..</blockquote>"
            await self.bot.send_message(user_id, error_message, parse_mode='html')
    
    
    async def _handle_app_id_inline(
        self,
        inline_query,
        app_count: str = "[1 +inf]",
        app_price: str = "[0.01 +inf]",
        limit: int = None,
        sort_by: Optional[str] = None
    ) -> Union[None, List[Dict[str, Any]]]:
        try:
            # detect admin vs. user
            is_admin = "#AᴅᴍɪɴAᴘᴘIᴅ:" in inline_query.query
            # Use limit as page size if provided, otherwise default to 50
            page_size = int(limit) if limit is not None else 50
            offset = int(inline_query.offset or 0)

            # build a cache key unique to this query + params
            cache_key = (
                "inline_app:"
                + inline_query.query
                + f":count={app_count or ''}"
                + f":price={app_price or ''}"
                + f":limit={limit or ''}"
                + f":sort={sort_by or ''}"
                + f":offset={offset or ''}"
                + f":is_admin={is_admin or ''}"
            )

            # 1) Try cache
            cached = await cache_manager.get(cache_key, CachePrefix.SEARCH)
            if cached:
                items = cached.get("items", [])
                total_count = int(cached.get("total", 0))

                # Reconstruct and answer inline-query directly
                articles = []
                for it in items:
                    art = InlineQueryResultArticle(
                        id=it["id"],
                        title=it["title"],
                        description=it["description"],
                        thumbnail_url=it["thumb"],
                        input_message_content=InputTextMessageContent(
                            message_text=it["input_cmd"]
                        )
                    )
                    if it.get("switch"):
                        art.switch_inline_query_current_chat = it["switch"]
                    articles.append(art)

                next_offset = (
                    str(offset + page_size)
                    if total_count > offset + page_size else ""
                )

                await self.bot.answer_inline_query(
                    inline_query.id,
                    articles,
                    cache_time=30,
                    next_offset=next_offset
                )
                return

            # 2) No cache: parse query
            if not is_admin:
                parts = inline_query.query.split('#AᴘᴘIᴅ:')[1].split()
            else:
                parts = inline_query.query.split('#AᴅᴍɪɴAᴘᴘIᴅ:')[1].split()

            app_id = parts[0].translate(await large_caps())
            country_filter = parts[1].lower() if len(parts) > 1 else None

            country_data = await self.get_country_data()

            # build name/code maps
            country_names = {}
            country_codes = {}
            for cid, info in country_data.items():
                code = info.get("country_code")
                name = info.get("country_name")
                if code and name:
                    country_names[cid] = name
                    country_codes[name.lower()] = code
                    for token in name.lower().split():
                        if len(token) > 2:
                            country_codes[token] = code

            # fetch raw server data
            data = await self.fetch_server_data(
                redis_client=self.redis_client,
                app_id=app_id,
                country_name=country_filter,
                is_inline=True,
                app_count=app_count,
                app_price=app_price,
                limit=limit,
                sort_by=sort_by
            )
            if not data or not data.get("servers"):
                if inline_query.id != "tool":
                    await self.bot.answer_inline_query(inline_query.id, [])
                return [] if inline_query.id == "tool" else None

            # aggregate by country_id
            country_stats = {}
            for srv_id, srv_info in data["servers"].items():
                try:
                    num = srv_id.rsplit("_", 1)[-1] if "_" in srv_id else srv_id
                    if not num.isdigit():
                        continue
                    for cid, price in srv_info.get("prices", {}).items():
                        entry = country_stats.get(cid)
                        if entry is None:
                            cname = country_names.get(cid, "Unknown")
                            country_stats[cid] = [
                                price,
                                srv_info["total_stock"],
                                {num},
                                cname
                            ]
                        else:
                            entry[0] = min(entry[0], price)
                            entry[1] += srv_info["total_stock"]
                            entry[2].add(num)
                except Exception:
                    continue

            # filter by country_filter
            if country_filter:
                if country_filter in country_stats:
                    f_cids = [country_filter]
                else:
                    f_cids = [
                        cid for cid, stats in country_stats.items()
                        if country_filter in stats[3].lower()
                        or country_filter in country_codes
                    ]
            else:
                f_cids = list(country_stats.keys())

            # sort & page
            f_cids.sort(key=lambda cid: (country_stats[cid][0], country_stats[cid][3]))
            raw_items = []
            results = []

            # use updated page_size
            for cid in f_cids[offset: offset + page_size]:
                min_price, total_stock, srv_nums, cname = country_stats[cid]
                servers_sorted = sorted(srv_nums, key=int)
                disp = (
                    f"[{', '.join(servers_sorted)}]"
                    if len(servers_sorted) <= 3 else f"[{', '.join(servers_sorted[:3])}, ...]"
                ) if inline_query.id != "tool" else f"[{', '.join(servers_sorted)}]"

                price_pts = float(min_price) * float(COMMISSION)
                desc = (
                    f"❯ Tʜᴇ Sᴛᴀʀᴛɪɴɢ Pʀɪᴄᴇ Is Oɴʟʏ {str(f'{price_pts:.2f}').translate(await small_caps())} Pᴏɪɴᴛ's.\n"
                    f"• Sᴇʀᴠᴇʀs » {disp.translate(await small_caps())}\n"
                    f"• Tᴏᴛᴀʟ Sᴛᴏᴄᴋ » {await format_number_to_text(total_stock)}"
                ).translate(await small_caps())

                imc = (
                    f"/Buy_{app_id}_{cid}" if not is_admin else f"#Sᴇʀᴠɪᴄᴇ|{app_id}|{cid}"
                )

                if inline_query.id == "tool":
                    results.append({
                        'country_id': cid,
                        'country_name': cname,
                        'country_code': country_data[cid]['country_code']
                    })
                else:
                    item = {
                        "id": str(uuid.uuid4()),
                        "title": (
                            f"{cname} [{country_data[cid]['country_code']}]"
                        ).translate(await small_caps()),
                        "description": desc,
                        "thumb": country_data[cid]["flag_url"],
                        "input_cmd": imc,
                        "switch": None
                    }
                    raw_items.append(item)
                    art = InlineQueryResultArticle(
                        id=item["id"],
                        title=item["title"],
                        description=item["description"],
                        thumbnail_url=item["thumb"],
                        input_message_content=InputTextMessageContent(
                            message_text=item["input_cmd"]
                        )
                    )
                    results.append(art)

            total_count = len(f_cids)
            next_offset = str(offset + page_size) if total_count > offset + page_size else ""

            # 3) Cache final results
            await cache_manager.set(
                cache_key,
                {"items": raw_items, "total": total_count, "ts": time.time()},
                CachePrefix.SEARCH
            )

            # answer or return
            if inline_query.id == "tool":
                return results
            else:
                await self.bot.answer_inline_query(
                    inline_query.id,
                    results,
                    cache_time=30,
                    next_offset=next_offset
                )

        except Exception as e:
            # on error, return empty list
            if hasattr(self.bot, 'answer_inline_query'):
                await self.bot.answer_inline_query(inline_query.id, [])
            return

    async def get_country_data(self, country_id: str=None) -> dict:
        """Get country data from Redis."""
        try:
            whole_country_data = await self.redis_client.json().get('main_data:details:country_data') or {}
            if country_id:
                return whole_country_data.get(country_id, {})
            #print('country data')
            #print(whole_country_data)
            return whole_country_data
        except Exception as e:
            print(f"Error fetching country data: {e}")
            return {}

    async def register_handlers(self, bot: AsyncTeleBot) -> None:
        @bot.inline_handler(func=lambda query: query.query.startswith('#AᴘᴘIᴅ'))
        async def handle_app_id_inline(inline_query):
            try:
                await self._handle_app_id_inline(inline_query)
            except Exception as e:
                print(f"Error processing inline query: {e}")
                await self.bot.answer_inline_query(inline_query.id, [])
        
        @bot.inline_handler(func=lambda query: query.query.startswith('#AᴅᴍɪɴAᴘᴘIᴅ'))
        async def handle_admin_app_id_inline(inline_query):
            try:
                await self._handle_app_id_inline(inline_query, is_admin=True)
            except Exception as e:
                print(f"Error processing inline query: {e}")
                await self.bot.answer_inline_query(inline_query.id, [])
        
                    
        @bot.callback_query_handler(func=lambda call: call.data.startswith("servers:"))
        async def handle_show_servers(call: CallbackQuery):
            try:
                process_task = partial(self.process_show_servers, call)
                asyncio.create_task(process_task())
            except ValueError:
                asyncio.create_task(bot.answer_callback_query(call.id, "🚫 Iɴᴠᴀʟɪᴅ Rᴇǫᴜᴇsᴛ Fᴏʀᴍᴀᴛ", show_alert=True))
            except Exception as e:
                print(f"Callback error: {e}")
                asyncio.create_task(bot.answer_callback_query(call.id, "🚫 Sʏsᴛᴇᴍ Eʀʀᴏʀ Oᴄᴄᴜʀʀᴇᴅ", show_alert=True))

        @bot.callback_query_handler(func=lambda call: call.data.startswith("admin_servers:"))
        async def handle_show_servers(call: CallbackQuery):
            try:
                process_task = partial(self.process_show_servers, call, is_admin=True)
                asyncio.create_task(process_task())
            except ValueError:
                asyncio.create_task(bot.answer_callback_query(call.id, "🚫 Iɴᴠᴀʟɪᴅ Rᴇǫᴜᴇsᴛ Fᴏʀᴍᴀᴛ", show_alert=True))
            except Exception as e:
                print(f"Callback error: {e}")
                asyncio.create_task(bot.answer_callback_query(call.id, "🚫 Sʏsᴛᴇᴍ Eʀʀᴏʀ Oᴄᴄᴜʀʀᴇᴅ", show_alert=True))

        @bot.callback_query_handler(func=lambda call: call.data.startswith("admin_is_server:"))
        async def handle_country_callback(call: CallbackQuery):
            try:
                process_task = partial(self.handle_is_admin_servers, call, is_admin=True)
                asyncio.create_task(process_task())
            except ValueError:
                asyncio.create_task(bot.answer_callback_query(call.id, "🚫 Iɴᴠᴀʟɪᴅ Rᴇǫᴜᴇsᴛ Fᴏʀᴍᴀᴛ", show_alert=True))
            except Exception as e:
                print(f"Callback error: {e}")
                asyncio.create_task(bot.answer_callback_query(call.id, "🚫 Sʏsᴛᴇᴍ Eʀʀᴏʀ Oᴄᴄᴜʀʀᴇᴅ", show_alert=True))

        @bot.message_handler(regexp=r'^/Buy_[\w\-]+_[\w\-]+$')
        async def handle_buy_command(message: Message):
            try:
                process_task = partial(self.process_buy_command, message)
                asyncio.create_task(process_task())
            except ValueError:
                asyncio.create_task(bot.send_message(message.chat.id, "🚫 Iɴᴠᴀʟɪᴅ Rᴇǫᴜᴇsᴛ Fᴏʀᴍᴀᴛ", parse_mode='html'))
            except Exception as e:
                print(f"Callback error: {e}")
                asyncio.create_task(bot.send_message(message.chat.id, "🚫 Sʏsᴛᴇᴍ Eʀʀᴏʀ Oᴄᴄᴜʀʀᴇᴅ...", parse_mode='html'))

        @bot.message_handler(regexp=r'^#Sᴇʀᴠɪᴄᴇ\|\d+\|\d+$')
        async def handle_admin_buy_command(message: Message):
            try:
                process_task = partial(self.process_buy_command, message, is_admin=True)
                asyncio.create_task(process_task())
            except ValueError:
                asyncio.create_task(bot.send_message(message.chat.id, "🚫 Iɴᴠᴀʟɪᴅ Rᴇǫᴜᴇsᴛ Fᴏʀᴍᴀᴛ", parse_mode='html'))
            except Exception as e:
                print(f"Callback error: {e}")
                asyncio.create_task(bot.send_message(message.chat.id, "🚫 Sʏsᴛᴇᴍ Eʀʀᴏʀ Oᴄᴄᴜʀʀᴇᴅ...", parse_mode='html'))

# ---------------------------------------------------------------------------
# Global instance and wrapper functions for backward compatibility
# ---------------------------------------------------------------------------
server_management = UserServerManagement()

async def init_managers(user_manager: OrderManagement, order_manager: Optional[OrderManagement]=None, bot: Optional[AsyncTeleBot] = None) -> bool:
    """Initialize the server manager with required components."""
    return await server_management.init_managers(user_manager, bot)

async def register_handlers(bot: AsyncTeleBot) -> None:
    """Register handlers for showing servers."""
    await server_management.register_handlers(bot)

__all__ = ['init_managers', 'register_handlers']
