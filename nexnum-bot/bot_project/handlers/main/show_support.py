import sys
import os
from pathlib import Path
_bot_project_dir = Path(__file__).resolve().parent
while _bot_project_dir.name != "bot_project" and _bot_project_dir.parent != _bot_project_dir:
    _bot_project_dir = _bot_project_dir.parent
if str(_bot_project_dir) not in sys.path:
    sys.path.insert(0, str(_bot_project_dir))
from typing import Optional
import logging

from telebot.async_telebot import AsyncTeleBot
from telebot.types import (
    InputMediaPhoto,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
    CallbackQuery
)

from handlers.manager.operation import UserManagement, OrderManagement
# Initialize logger
logger = logging.getLogger(__name__)
class SupportManagement:
    def __init__(self):
        self.user_manager: Optional[UserManagement] = None
        self.order_manager: Optional[OrderManagement] = None

    async def init_managers(
        self,
        user_mgr: UserManagement = None,
        order_mgr: OrderManagement = None,
        bot: Optional[AsyncTeleBot] = None
    ) -> bool:
        """Initialize the user and order managers asynchronously."""
        try:
            self.user_manager = user_mgr
            self.order_manager = order_mgr
            return True
        except Exception as e:
            logger.error(f"Error initializing managers: {e}")
            return False

    async def handle_support_callback(self, bot: AsyncTeleBot, call: CallbackQuery) -> None:
        """
        Handle callback queries whose data starts with 'USER:SUPPORT' by editing
        the message with a predefined photo, caption, and inline keyboard.
        """
        try:
            parts = call.data.split()
            chat_id = call.message.chat.id
            message_id = call.message.message_id

            keyboard = InlineKeyboardMarkup()
            keyboard.row(
                InlineKeyboardButton(
                    "🔍 Fᴀǫ [Gᴜɪᴅᴇ]",
                    web_app=WebAppInfo(url='https://flashsms.in/BotFile/HelpFaq.php')
                ),
                InlineKeyboardButton(
                    "👨🏻‍💻 Sᴜᴘᴘᴏʀᴛ [Hᴀʀsʜ]",
                    url='https://flashsmsowner.t.me'
                )
            )
            keyboard.row(
                InlineKeyboardButton(
                    "🔙 Bᴀᴄᴋ Tᴏ Pʀᴏғɪʟᴇ Pᴀɢᴇ [ Usᴇʀ-Pʀᴏғɪʟᴇ ]",
                    callback_data='start'
                )
            )

            caption = (
                "<b>⁉️ Fʟᴀsʜ Hᴇʟᴘ Gᴜɪᴅᴇ</b> <b>[ </b><code>Hᴏᴡ ᴛᴏ Usᴇ</code><b> ]</b>\n\n"
                "<b>𝟷.</b> <b>Sᴇʟᴇᴄᴛ Tʜᴇ Sᴇʀᴠɪᴄᴇ ❯</b>\n"
                "<code>Cʜᴏᴏsᴇ Tʜᴇ Sᴇʀᴠɪᴄᴇ Yᴏᴜ Wɪsʜ Tᴏ Pᴜʀᴄʜᴀsᴇ.</code>\n"
                "<b>𝟸.</b> <b>Cʜᴏᴏsᴇ Tʜᴇ Sᴇʀᴠᴇʀ ❯</b>\n"
                "<code>Sᴇʟᴇᴄᴛ Tʜᴇ Sᴇʀᴠᴇʀ Fᴏʀ Tʜᴇ Cʜᴏsᴇɴ Sᴇʀᴠɪᴄᴇ.</code>\n"
                "<b>𝟹.</b> <b>Pɪᴄᴋ Tʜᴇ Cᴏᴜɴᴛʀʏ ❯</b>\n"
                "<code>Sᴘᴇᴄɪғʏ Tʜᴇ Cᴏᴜɴᴛʀʏ Fᴏʀ Tʜᴇ Sᴇʀᴠɪᴄᴇ.</code>\n"
                "<b>𝟺.</b> <b>Cᴏɴғɪʀᴍ Yᴏᴜʀ Oʀᴅᴇʀ ❯</b>\n"
                "<code>Rᴇᴠɪᴇᴡ Aɴᴅ Cᴏɴғɪʀᴍ Yᴏᴜʀ Oʀᴅᴇʀ Dᴇᴛᴀɪʟs.</code>\n"
                "<b>𝟻.</b> <b>Rᴇᴄᴇɪᴠᴇ Yᴏᴜʀ Nᴜᴍʙᴇʀ ❯</b>\n"
                "<code>Yᴏᴜ Wɪʟʟ Rᴇᴄᴇɪᴠᴇ A Nᴜᴍʙᴇʀ, Vᴀʟɪᴅ Fᴏʀ 20 Mɪɴᴜᴛᴇs.</code>\n\n"
                "<b>📌 Nᴇᴇᴅ Assɪsᴛᴀɴᴄᴇ.!?</b>  \n"
                "<i>Fᴇᴇʟ Fʀᴇᴇ Tᴏ Cᴏɴᴛᴀᴄᴛ Us Fᴏʀ Aɴʏ Hᴇʟᴘ Oʀ Sᴜᴘᴘᴏʀᴛ...</i>"
            )

            await bot.edit_message_media(
                media=InputMediaPhoto(
                    media='https://i.postimg.cc/9QH9VNky/20240628-203445.jpg',
                    caption=caption,
                    parse_mode='HTML'
                ),
                chat_id=chat_id,
                message_id=message_id,
                reply_markup=keyboard
            )
        except Exception as e:
            logger.error(f"Error handling support callback: {e}")

    async def register_handlers(self, bot: AsyncTeleBot) -> None:
        """
        Register the support callback handler with the provided bot.
        Any callback data starting with 'USER:SUPPORT' will be handled.
        """
       # await self.init_managers()
        try:
            @bot.callback_query_handler(func=lambda call: call.data.startswith('USER:SUPPORT'))
            async def support_callback(call: CallbackQuery):
                await self.handle_support_callback(bot, call)
        except Exception as e:
            logger.error(f"Error registering support handler: {e}")

# Create a singleton instance for module-level usage
support_management = SupportManagement()

async def init_managers(user_manager=None, order_manager=None, bot: Optional[AsyncTeleBot] = None) -> bool:
    """Initialize the support manager with required components asynchronously."""
    return await support_management.init_managers(user_manager, order_manager, bot)

async def register_handlers(bot: AsyncTeleBot) -> None:
    """Register support handlers with the bot asynchronously."""
    await support_management.register_handlers(bot)

__all__ = ['register_handlers', 'support_management']
