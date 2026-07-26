import sys
import os
from pathlib import Path
_bot_project_dir = Path(__file__).resolve().parent
while _bot_project_dir.name != "bot_project" and _bot_project_dir.parent != _bot_project_dir:
    _bot_project_dir = _bot_project_dir.parent
if str(_bot_project_dir) not in sys.path:
    sys.path.insert(0, str(_bot_project_dir))
#!/usr/bin/env python3
import sys
import os
import asyncio
import functools
import contextlib
from typing import Optional, Tuple, Any

from telebot.async_telebot import AsyncTeleBot
from telebot.types import Update, InputMediaPhoto, Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton

try:
    from utils.cache_manager import cache_manager
except ImportError:
    from bot_project.utils.cache_manager import cache_manager

try:
    from utils.config import BOT_TOKEN, CHANNEL_ID, START_PAGE
except ImportError:
    from bot_project.utils.config import BOT_TOKEN, CHANNEL_ID, START_PAGE

try:
    from utils.redis_manager import redis_manager
except ImportError:
    from bot_project.utils.redis_manager import redis_manager

try:
    from handlers.manager.operation import (
        FinancialManagement, UserManagement, OrderManagement, DepositManagement,
        get_async_logger, user_mgr, order_mgr, deposit_mgr, financial_mgr
    )
except ImportError:
    from bot_project.handlers.manager.operation import (
        FinancialManagement, UserManagement, OrderManagement, DepositManagement,
        get_async_logger, user_mgr, order_mgr, deposit_mgr, financial_mgr
    )

try:
    from handlers.security import InputValidator, TransactionGuard
except ImportError:
    from bot_project.handlers.security import InputValidator, TransactionGuard

try:
    from handlers.methods.purchase import made_purchase, show_country, show_servers, order_status
except ImportError:
    from bot_project.handlers.methods.purchase import made_purchase, show_country, show_servers, order_status

try:
    from handlers.main import inline_query, message_handler, show_refferal, show_menu, top_services, show_wallet, show_support, support_management, external
except ImportError:
    from bot_project.handlers.main import inline_query, message_handler, show_refferal, show_menu, top_services, show_wallet, show_support, support_management, external

try:
    from handlers.main.external import forward_manager, ForwardManager
except ImportError:
    from bot_project.handlers.main.external import forward_manager, ForwardManager

try:
    from handlers.methods.purchase.order_tracker import init_managers as order_tracker_init, register_handlers as order_tracker_register, order_tracker
except ImportError:
    from bot_project.handlers.methods.purchase.order_tracker import init_managers as order_tracker_init, register_handlers as order_tracker_register, order_tracker

try:
    from handlers.methods.recharge.deposit_tracker import init_managers as deposit_tracker_init, register_handlers as deposit_tracker_register, deposit_tracker
except ImportError:
    from bot_project.handlers.methods.recharge.deposit_tracker import init_managers as deposit_tracker_init, register_handlers as deposit_tracker_register, deposit_tracker

try:
    from handlers.methods.recharge import show_deposit
except ImportError:
    from bot_project.handlers.methods.recharge import show_deposit

try:
    from handlers.methods.history import show_history
except ImportError:
    from bot_project.handlers.methods.history import show_history

try:
    from handlers.main.inline_query import UserSearchManagement
except ImportError:
    from bot_project.handlers.main.inline_query import UserSearchManagement

try:
    from handlers.methods.admin import admin_panel
except ImportError:
    from bot_project.handlers.methods.admin import admin_panel

try:
    from utils.db import db_adapter
except ImportError:
    from bot_project.utils.db import db_adapter


class TelegramBot:
    def __init__(self):
        self.bot: Any = None
        self.services_initialized: bool = False
        self.user_manager: Any = None
        self.order_manager: Any = None
        self.deposit_manager: Any = None
        self.financial_manager: Any = None
        self.input_validator: Any = None
        self.transaction_guard: Any = None
    @staticmethod
    async def safe_call(func, *args, retries=3, **kwargs):
        """Execute a function with retry logic."""
        for attempt in range(retries):
            try:
                return await func(*args, **kwargs)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                try:
                    logger = await get_async_logger()
                    await logger.warning(f"{func.__name__} failed on attempt {attempt + 1}: {e}")
                    await asyncio.sleep(2 ** attempt)
                except asyncio.CancelledError:
                    raise
                except Exception as e:
                    print(f"Failed to log error: {e}")

    @contextlib.asynccontextmanager
    async def initialize_services(self):
        """Initialize all required services."""
        try:
            await redis_manager.ensure_connection()
            await db_adapter.init_pool()
            if not await self.initialize_managers():
                raise Exception("Failed to initialize managers")
            if not await self.initialize_bot():
                raise Exception("Failed to initialize bot")
            logger = await get_async_logger()
            await logger.info("Managers and security components initialized successfully")
            self.services_initialized = True
            yield
        except Exception as e:
            logger = await get_async_logger()
            await logger.error(f"Error during service initialization: {str(e)}")
            raise
        finally:
            await self.safe_call(self.shutdown)
            await self.safe_call(db_adapter.close_pool)
            await self.safe_call(redis_manager.close)

    async def initialize_managers(self) -> bool:
        """Initialize all required managers using global instances."""
        try:
            self.user_manager = user_mgr
            self.order_manager = order_mgr
            self.deposit_manager = deposit_mgr
            
            # Initialize loggers for each manager
            await self.user_manager._init_logger()
            await self.order_manager._init_logger()
            await self.deposit_manager._init_logger()
            
            # Initialize search indexes
            await self.user_manager._init_search_indexes()
            await self.order_manager._init_search_indexes()
            await self.deposit_manager._init_search_indexes()
            return True
        except Exception as e:
            logger = await get_async_logger()
            await logger.error(f"Failed to initialize managers: {e}")
            return False

    async def initialize_bot(self) -> bool:
        """Initialize the Telegram bot and its components."""
        try:
            self.bot = AsyncTeleBot(BOT_TOKEN)
            self.bot.input_validator = InputValidator()
            self.bot.transaction_guard = TransactionGuard(await redis_manager.get_client())
            self.bot.user_manager = self.user_manager
            self.bot.order_manager = self.order_manager
            self.bot.deposit_manager = self.deposit_manager
            self.bot.aggregator = financial_mgr
            self.forward_manager = forward_manager

            # Initialize trackers
            await self._initialize_trackers()
            return True
        except Exception as e:
            logger = await get_async_logger()
            await logger.error(f"Failed to initialize bot: {e}")
            return False

    async def _initialize_trackers(self) -> None:
        """Initialize order and deposit trackers."""
        # Initialize and register order tracker
        await order_tracker_init(order_manager=self.order_manager, user_manager=self.user_manager, bot=self.bot)
        await order_tracker_register(self.bot)
        await order_tracker.start()

        # Initialize and register deposit tracker
        await deposit_tracker_init(deposit_manager=self.deposit_manager, user_manager=self.user_manager, bot=self.bot)
        await deposit_tracker_register(self.bot)
        await deposit_tracker.start()

    async def shutdown(self) -> None:
        """Gracefully shutdown all components."""
        if order_tracker:
            await order_tracker.stop()
        if deposit_tracker:
            await deposit_tracker.stop()
        if self.bot:
            await self.bot.close_session()
        if self.forward_manager:
            await self.forward_manager.shutdown()

    async def register_handlers(self) -> bool:
        """Register all message handlers with the bot."""
        if not self.services_initialized:
            logger = await get_async_logger()
            await logger.error("Cannot register handlers: services not initialized")
            return False

        handlers = [
            (show_menu, "show_menu"),
            (external, "external"),
            (show_wallet, "show_wallet"),
            (made_purchase, "made_purchase"),
            (order_status, "order_status"),
            (show_servers, "show_servers"),
            (show_country, "show_country"),
            (show_deposit, "show_deposit"),
            (show_history, "show_history"),
            (support_management, "support_management"),
            (top_services, "top_services"),
            (show_refferal, "show_refferal"),
            (show_support, "show_support"),
            (admin_panel, "admin_panel"),
            (inline_query, "inline_query"),
            (message_handler, "message_handler"),
        ]

        success = True
        for handler, name in handlers:
            try:
                if hasattr(handler, 'init_managers'):
                    import inspect
                    sig = inspect.signature(handler.init_managers)
                    kwargs = {}
                    if 'user_manager' in sig.parameters: kwargs['user_manager'] = self.user_manager
                    if 'user_mgr' in sig.parameters: kwargs['user_mgr'] = self.user_manager
                    if 'order_manager' in sig.parameters: kwargs['order_manager'] = self.order_manager
                    if 'order_mgr' in sig.parameters: kwargs['order_mgr'] = self.order_manager
                    if 'deposit_manager' in sig.parameters: kwargs['deposit_manager'] = self.deposit_manager
                    if 'deposit_mgr' in sig.parameters: kwargs['deposit_mgr'] = self.deposit_manager
                    if 'bot' in sig.parameters: kwargs['bot'] = self.bot
                    
                    await handler.init_managers(**kwargs)
                await handler.register_handlers(self.bot)
                logger = await get_async_logger()
                await logger.info(f"Handler registered: {name}")
            except Exception as e:
                logger = await get_async_logger()
                await logger.error(f"Failed to register handler {name}: {e}")
                success = False
        await cache_manager.get_redis()
        return success

    async def start_polling(self) -> None:
        """Start the bot in polling mode."""
        for attempt in range(3):
            try:
                logger = await get_async_logger()
                await logger.info("Starting bot polling...")
                await self.bot.polling(non_stop=True, timeout=60)
                break
            except Exception as e:
                logger = await get_async_logger()
                await logger.error(f"Polling failed on attempt {attempt + 1}: {e}")
                await asyncio.sleep(5)


async def main():
    """Entry point of the application."""
    bot = TelegramBot()
    
    # Create tasks for both the bot and the periodic updater
    async with bot.initialize_services():
        update_task = None
        polling_task = None
        try:
            # Register handlers
            await bot.register_handlers()

            # Start periodic update
            try:
                from handlers.manager.auto_updater import periodic_update
            except ImportError:
                from bot_project.handlers.manager.auto_updater import periodic_update
            update_task = asyncio.create_task(periodic_update(update=True, bot=bot.bot))

            # Polling mode: clear webhook and run polling concurrently
            await bot.bot.delete_webhook()
            polling_task = asyncio.create_task(bot.bot.polling(non_stop=True, timeout=60))
            await asyncio.gather(polling_task, update_task)
        except Exception as e:
            logger = await get_async_logger()
            await logger.error(f"Startup error: {e}")
        finally:
            # Cancel any still-running background tasks before tearing down
            for _task in (update_task, polling_task):
                if _task is not None and not _task.done():
                    _task.cancel()
                    try:
                        await _task
                    except (asyncio.CancelledError, Exception) as _ce:
                        try:
                            _logger = await get_async_logger()
                            await _logger.info(f"Background task cancelled during shutdown: {_ce}")
                        except Exception:
                            pass

if __name__ == "__main__":
    from handlers.manager.auto_updater import periodic_update
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"Error in main: {e}")
        pass
    print("Bot stopped.")
