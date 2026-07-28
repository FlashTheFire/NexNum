#!/usr/bin/env python3
"""
Redis -> PostgreSQL (Supabase) Data Migration Script for NexNum Bot.
Migrates legacy Redis keys/hashes into PostgreSQL tables with idempotency,
conflict handling, dry-run mode, and validation reporting.
"""

import sys
import os
import json
import time
import argparse
import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

# Ensure Windows Selector Event Loop policy for psycopg3 compatibility on Windows
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

BOT_PROJECT_DIR = Path(__file__).resolve().parent.parent
if str(BOT_PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(BOT_PROJECT_DIR))

load_dotenv("D:/Nex-Projects/NexNum/.env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("redis_to_pg_migration")

from utils.db import db_adapter
from utils.redis_manager import redis_manager

class RedisToPgMigrator:
    def __init__(self, dry_run: bool = False, batch_size: int = 100):
        self.dry_run = dry_run
        self.batch_size = batch_size
        self.stats = {
            "sessions": {"scanned": 0, "migrated": 0, "errors": 0},
            "referrals": {"scanned": 0, "migrated": 0, "errors": 0},
            "orders": {"scanned": 0, "migrated": 0, "errors": 0},
            "deposits": {"scanned": 0, "migrated": 0, "errors": 0},
        }

    async def migrate_user_sessions(self, r_client) -> None:
        logger.info("--- Starting User Sessions Migration ---")
        pattern = "user_data:*:profile:main"
        cursor = "0"
        
        while True:
            cursor, keys = await r_client.scan(cursor=cursor, match=pattern, count=self.batch_size)
            for key in keys:
                self.stats["sessions"]["scanned"] += 1
                try:
                    data = await r_client.hgetall(key)
                    if not data:
                        continue
                    
                    # Key format: user_data:{uid}:profile:main
                    parts = key.split(":")
                    telegram_id = parts[1] if len(parts) >= 2 else data.get("telegram_id")
                    if not telegram_id:
                        continue

                    # Parse fields
                    selected_country = data.get("selected_country_id") or data.get("selected_country")
                    selected_service = data.get("selected_service_code") or data.get("selected_service")
                    menu_state = data.get("menu_state", "START")
                    session_json = json.dumps(data)

                    if not self.dry_run:
                        # 1. Ensure user exists
                        await db_adapter.get_or_create_user(
                            telegram_id=str(telegram_id),
                            first_name=data.get("first_name", ""),
                            username=data.get("username", "")
                        )
                        # 2. Save session
                        await db_adapter.save_user_session(
                            telegram_id=str(telegram_id),
                            session_data={
                                "selected_country_id": selected_country,
                                "selected_service_code": selected_service,
                                "menu_state": menu_state,
                                "data": data
                            }
                        )
                    self.stats["sessions"]["migrated"] += 1
                except Exception as exc:
                    logger.error(f"Failed migrating session key '{key}': {exc}")
                    self.stats["sessions"]["errors"] += 1

            if cursor == "0" or cursor == 0:
                break

    async def migrate_referrals(self, r_client) -> None:
        logger.info("--- Starting Referrals Migration ---")
        pattern = "user_data:*:referral"
        cursor = "0"

        while True:
            cursor, keys = await r_client.scan(cursor=cursor, match=pattern, count=self.batch_size)
            for key in keys:
                self.stats["referrals"]["scanned"] += 1
                try:
                    data = await r_client.hgetall(key)
                    if not data:
                        continue
                    
                    parts = key.split(":")
                    telegram_id = parts[1] if len(parts) >= 2 else None
                    if not telegram_id:
                        continue

                    referrer_id = data.get("referrer_id")
                    referral_code = data.get("referral_code", f"ref_{telegram_id}")

                    if not self.dry_run:
                        await db_adapter.save_referral_info(
                            telegram_id=str(telegram_id),
                            referrer_id=str(referrer_id) if referrer_id else None,
                            code=str(referral_code)
                        )
                    self.stats["referrals"]["migrated"] += 1
                except Exception as exc:
                    logger.error(f"Failed migrating referral key '{key}': {exc}")
                    self.stats["referrals"]["errors"] += 1

            if cursor == "0" or cursor == 0:
                break

    async def migrate_orders(self, r_client) -> None:
        logger.info("--- Starting Purchase Orders Migration ---")
        pattern = "order_data:*"
        cursor = "0"

        while True:
            cursor, keys = await r_client.scan(cursor=cursor, match=pattern, count=self.batch_size)
            for key in keys:
                self.stats["orders"]["scanned"] += 1
                try:
                    data = await r_client.hgetall(key)
                    if not data:
                        continue
                    
                    order_id = data.get("order_id") or key.split(":")[-1]
                    telegram_id = data.get("user_id") or data.get("telegram_id")
                    if not telegram_id:
                        continue

                    amount = float(data.get("amount", 0.0) or data.get("price", 0.0))
                    service_name = data.get("service_name") or data.get("app_name") or "service"
                    country_name = data.get("country_name", "Unknown")
                    status = data.get("status", "COMPLETED")
                    phone_number = data.get("phone_number")
                    sms_code = data.get("sms_code")
                    provider = data.get("provider", "default")

                    if not self.dry_run:
                        await db_adapter.create_activation_order(
                            user_id=str(telegram_id),
                            service_name=service_name,
                            country_name=country_name,
                            amount=amount,
                            phone_number=phone_number,
                            activation_id=order_id,
                            provider_name=provider
                        )
                        if sms_code or status != "PENDING":
                            await db_adapter.update_activation_sms(
                                order_id=order_id,
                                sms_code=sms_code,
                                status=status
                            )
                    self.stats["orders"]["migrated"] += 1
                except Exception as exc:
                    logger.error(f"Failed migrating order key '{key}': {exc}")
                    self.stats["orders"]["errors"] += 1

            if cursor == "0" or cursor == 0:
                break

    async def migrate_deposits(self, r_client) -> None:
        logger.info("--- Starting Deposit Requests Migration ---")
        pattern = "deposit_data:*"
        cursor = "0"

        while True:
            cursor, keys = await r_client.scan(cursor=cursor, match=pattern, count=self.batch_size)
            for key in keys:
                self.stats["deposits"]["scanned"] += 1
                try:
                    data = await r_client.hgetall(key)
                    if not data:
                        continue

                    deposit_id = data.get("deposit_id") or key.split(":")[-1]
                    telegram_id = data.get("user_id") or data.get("telegram_id")
                    if not telegram_id:
                        continue

                    amount = float(data.get("amount", 0.0))
                    gateway = data.get("gateway", "upi")
                    status = data.get("status", "COMPLETED")
                    code = data.get("code")

                    if not self.dry_run:
                        created_id = await db_adapter.create_deposit_request(
                            user_id=str(telegram_id),
                            amount=amount,
                            gateway=gateway,
                            idempotency_key=deposit_id
                        )
                        if created_id and (status != "PENDING" or code):
                            await db_adapter.update_deposit_status(
                                deposit_id=created_id,
                                status=status,
                                code=code
                            )
                    self.stats["deposits"]["migrated"] += 1
                except Exception as exc:
                    logger.error(f"Failed migrating deposit key '{key}': {exc}")
                    self.stats["deposits"]["errors"] += 1

            if cursor == "0" or cursor == 0:
                break

    async def run(self) -> None:
        mode_str = "[DRY-RUN MODE]" if self.dry_run else "[LIVE MIGRATION MODE]"
        logger.info(f"==========================================")
        logger.info(f"   NexNum Redis -> PostgreSQL Migrator    ")
        logger.info(f"   {mode_str}")
        logger.info(f"==========================================")

        await db_adapter.init_pool()
        r_client = await redis_manager.get_client()

        if not r_client:
            logger.warning("Redis is offline or empty. Scanned key count will be 0. (Valid for fresh/migrated setups)")
        
        try:
            if r_client:
                await self.migrate_user_sessions(r_client)
                await self.migrate_referrals(r_client)
                await self.migrate_orders(r_client)
                await self.migrate_deposits(r_client)

            print("\n==========================================")
            print(f"      MIGRATION SUMMARY REPORT {mode_str}")
            print("==========================================")
            print(f"{'Category':<15} | {'Scanned':<10} | {'Migrated':<10} | {'Errors':<10}")
            print("-" * 55)
            for cat, s in self.stats.items():
                print(f"{cat.capitalize():<15} | {s['scanned']:<10} | {s['migrated']:<10} | {s['errors']:<10}")
            print("==========================================\n")

        finally:
            await db_adapter.close_pool()
            await redis_manager.close()

def main():
    parser = argparse.ArgumentParser(description="Migrate Redis persistent data to PostgreSQL (Supabase).")
    parser.add_argument("--dry-run", action="store_true", help="Preview migration without modifying PostgreSQL.")
    parser.add_argument("--batch-size", type=int, default=100, help="Scan batch size (default 100).")
    args = parser.parse_args()

    asyncio.run(RedisToPgMigrator(dry_run=args.dry_run, batch_size=args.batch_size).run())

if __name__ == "__main__":
    main()
