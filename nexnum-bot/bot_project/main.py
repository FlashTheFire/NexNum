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

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from contextlib import asynccontextmanager

from app.core.config import get_settings
from app.core.logging import setup_logging
from app.api.v1.router import router as api_router
from app.api.webhook import router as webhook_router
from app.jobs.scheduler import schedule_jobs
from app.gateway.router import router as gateway_router
from app.gateway.dashboard import router as dashboard_router
from app.services.firebase_stream import firebase_stream_manager
from app.inbound.router import router as inbound_router, ensure_consumer_group
from app.workers.activation_worker import start_activation_workers, stop_activation_workers
from app.workers.prescorer_worker import start_prescorer_worker, stop_prescorer_worker

settings = get_settings()
setup_logging()

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = BackgroundScheduler()
    schedule_jobs(scheduler)
    scheduler.start()
    app.state.scheduler = scheduler

    # Ensure Redis Stream consumer group exists for fast-ack webhook
    try:
        redis_client = await redis_manager.get_client()
        if redis_client:
            await ensure_consumer_group(redis_client)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to init inbound consumer group: {e}")

    # Conditionally start background workers if in-process mode is enabled
    if settings.ENABLE_IN_PROCESS_WORKERS:
        await firebase_stream_manager.start_listeners()
        await start_activation_workers()
        await start_prescorer_worker()
        logger.info("[LIFESPAN] Background workers started in-process inside FastAPI server.")
    else:
        logger.info("[LIFESPAN] HTTP API Mode active — background worker tasks offloaded to worker.py process.")

    yield

    # Cleanup
    if settings.ENABLE_IN_PROCESS_WORKERS:
        await stop_prescorer_worker()
        await stop_activation_workers()
        await firebase_stream_manager.stop_listeners()
    scheduler.shutdown()

fastapi_app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    debug=settings.DEBUG,
    lifespan=lifespan
)

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

fastapi_app.include_router(api_router, prefix=settings.API_V1_PREFIX)
fastapi_app.include_router(webhook_router, prefix="/webhook")
fastapi_app.include_router(gateway_router)
fastapi_app.include_router(inbound_router)  # Phase 1: Unified Inbound Webhook
fastapi_app.include_router(dashboard_router)  # Phase 7: Production Admin Control Dashboard

@fastapi_app.get("/health")
async def health_check():
    return {"status": "ok"}


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

    async def start_webhook(self) -> None:
        """Configure Telegram Webhook route on the FastAPI application."""
        try:
            from utils.config import WEBHOOK_URL, WEBHOOK_PATH, WEBHOOK_SECRET
        except ImportError:
            from bot_project.utils.config import WEBHOOK_URL, WEBHOOK_PATH, WEBHOOK_SECRET

        @fastapi_app.post(WEBHOOK_PATH)
        async def handle_telegram_webhook(request: Request):
            secret_header = request.headers.get("X-Telegram-Bot-Api-Secret-Token")
            if WEBHOOK_SECRET and secret_header and secret_header != WEBHOOK_SECRET:
                return Response(status_code=403, content="Forbidden")
            try:
                data = await request.json()
                update = Update.de_json(data)
                if update:
                    asyncio.create_task(self.bot.process_new_updates([update]))
                return Response(status_code=200, content="OK")
            except Exception as err:
                logger = await get_async_logger()
                await logger.error(f"Error processing webhook update: {err}")
                return Response(status_code=500, content="Error")

        full_webhook_url = f"{WEBHOOK_URL.rstrip('/')}{WEBHOOK_PATH}"
        logger = await get_async_logger()
        await logger.info(f"Setting Telegram Webhook URL to: {full_webhook_url}")
        await self.bot.set_webhook(
            url=full_webhook_url,
            secret_token=WEBHOOK_SECRET if WEBHOOK_SECRET else None,
            drop_pending_updates=True
        )

async def main():
    """Entry point of the application."""
    bot = TelegramBot()
    
    # Create tasks for both the bot and the periodic updater
    async with bot.initialize_services():
        bot_task = None
        fastapi_task = None
        try:
            # Register handlers
            await bot.register_handlers()

            try:
                from utils.config import USE_WEBHOOK, WEBHOOK_URL, WEBHOOK_HOST, WEBHOOK_PORT
            except ImportError:
                from bot_project.utils.config import USE_WEBHOOK, WEBHOOK_URL, WEBHOOK_HOST, WEBHOOK_PORT

            # Start FastAPI gateway app on the configured webhook port
            import uvicorn
            config = uvicorn.Config(
                app=fastapi_app,
                host=WEBHOOK_HOST,
                port=WEBHOOK_PORT,
                log_level="info",
                loop="asyncio"
            )
            server = uvicorn.Server(config)
            logger = await get_async_logger()
            await logger.info(f"Starting Unified FastAPI App & Gateway on http://{WEBHOOK_HOST}:{WEBHOOK_PORT}...")
            fastapi_task = asyncio.create_task(server.serve())

            if USE_WEBHOOK and WEBHOOK_URL:
                logger = await get_async_logger()
                await logger.info("Configuring bot in Webhook Mode on FastAPI app...")
                await bot.start_webhook()
                # Keep service alive as FastAPI serves requests
                while True:
                    await asyncio.sleep(3600)
            else:
                logger = await get_async_logger()
                await logger.info("Launching bot in Polling Mode...")
                await bot.bot.delete_webhook()
                bot_task = asyncio.create_task(bot.bot.polling(non_stop=True, timeout=60))
                await asyncio.gather(bot_task, fastapi_task)

        except Exception as e:
            logger = await get_async_logger()
            await logger.error(f"Startup error: {e}")
        finally:
            if bot_task is not None and not bot_task.done():
                bot_task.cancel()
                try:
                    await bot_task
                except (asyncio.CancelledError, Exception):
                    pass
            if fastapi_task is not None and not fastapi_task.done():
                fastapi_task.cancel()
                try:
                    await fastapi_task
                except (asyncio.CancelledError, Exception):
                    pass

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"Error in main: {e}")
        pass
    print("Bot stopped.")
