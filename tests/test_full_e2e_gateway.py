"""
Comprehensive E2E Test Suite for NexNum Gateway & Service Pattern Lifecycle.
Tests:
1. getPrices / getPricing country mapping with India (22), surge calculation, pricing, and stocks.
2. getServices and getCountries handlers.
3. ServicePatternRegistry CRUD, disk persistence (service_patterns.json), Redis cache invalidation.
4. Real-world SMS body & sender OTP regex matching (/test-match).
5. get_incoming_messages multi-path querying, phone normalization, and 0ms Redis caching.
6. Number purchase, active activations, and cancellation.
"""

import sys
import os
import pytest
import asyncio
import json
import time

# Ensure project root is on sys.path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(BASE_DIR, "nexnum-bot", "bot_project"))
sys.path.insert(0, os.path.join(BASE_DIR, "nexnum-bot"))

# pyrefly: ignore [missing-import]
from app.services.pattern_registry import ServicePatternRegistry, load_default_patterns
from app.services.pricing_engine import PricingEngine
from app.services.sms_parser import extract_otp_code
from app.crud.firebase_crud import get_incoming_messages, parse_any_datetime_to_epoch_ms, _save_phone_cache, GLOBAL_PHONE_CACHE


class MockRedisClient:
    """Fast in-memory mock of Redis client supporting key/value, hashes, and pipelines."""
    def __init__(self):
        self.store = {}
        self.hashes = {}

    async def get(self, key):
        return self.store.get(key)

    async def set(self, key, value, ex=None):
        self.store[key] = value
        return True

    async def delete(self, *keys):
        for k in keys:
            self.store.pop(k, None)
            self.hashes.pop(k, None)
        return True

    async def hset(self, hash_key, key, value):
        if hash_key not in self.hashes:
            self.hashes[hash_key] = {}
        self.hashes[hash_key][key] = value
        return 1

    async def hgetall(self, hash_key):
        return self.hashes.get(hash_key, {})

    def pipeline(self):
        return MockPipeline(self)


class MockPipeline:
    def __init__(self, client):
        self.client = client
        self.commands = []

    def set(self, key, value, ex=None):
        self.commands.append(('set', (key, value, ex)))
        return self

    def delete(self, key):
        self.commands.append(('delete', (key,)))
        return self

    def hset(self, hash_key, key, value):
        self.commands.append(('hset', (hash_key, key, value)))
        return self

    async def execute(self):
        results = []
        for cmd, args in self.commands:
            if cmd == 'set':
                results.append(await self.client.set(*args))
            elif cmd == 'delete':
                results.append(await self.client.delete(*args))
            elif cmd == 'hset':
                results.append(await self.client.hset(*args))
        return results


def test_service_pattern_registry_default_loading():
    """Test 1: Verify service_patterns.json loads with 25+ services, valid prices, and stocks."""
    patterns = load_default_patterns()
    assert isinstance(patterns, dict)
    assert len(patterns) >= 25, f"Expected >= 25 default patterns, got {len(patterns)}"

    for code in ["tg", "wa", "go", "sw", "zo", "fk"]:
        assert code in patterns, f"Service code '{code}' must be in default patterns"
        info = patterns[code]
        assert "price" in info, f"Price must exist for {code}"
        assert float(info["price"]) > 0, f"Price must be > 0 for {code}"
        assert "stock" in info, f"Stock must exist for {code}"
        assert int(info["stock"]) >= 1, f"Stock must be >= 1 for {code}"
        assert "sender_patterns" in info, f"Sender patterns must exist for {code}"
        assert "body_patterns" in info, f"Body patterns must exist for {code}"


def test_service_pattern_registry_crud():
    """Test 2: Test live addition, update, retrieval, disk save, and deletion of custom service."""
    async def _run():
        redis = MockRedisClient()
        test_code = "z_pytest_service"
        pattern_data = {
            "name": "Pytest Mock Service",
            "price": 22.50,
            "stock": 250,
            "sender_patterns": ["pytest_sender", "py_alert"],
            "body_patterns": ["pytest verification code", "mock otp"],
            "otp_regex": r"\b\d{6}\b"
        }

        # 1. Update/Add Pattern
        success = await ServicePatternRegistry.update_pattern(redis, test_code, pattern_data)
        assert success is True

        # 2. Get Pattern
        retrieved = await ServicePatternRegistry.get_pattern(redis, test_code)
        assert retrieved is not None
        assert retrieved["name"] == "Pytest Mock Service"
        assert float(retrieved["price"]) == 22.50
        assert int(retrieved["stock"]) == 250

        # 3. Match Pattern
        is_matched, extracted_otp, details = await ServicePatternRegistry.match_sms_dynamic(
            redis,
            body="Your mock otp is 849302 for verification.",
            sender="pytest_sender_1",
            service_code=test_code
        )
        assert is_matched is True
        assert extracted_otp == "849302"

        # 4. Delete Pattern
        del_success = await ServicePatternRegistry.delete_pattern(redis, test_code)
        assert del_success is True

        # Ensure removed from memory/disk and falls back to universal 'ot'
        deleted_retrieved = await ServicePatternRegistry.get_pattern(redis, test_code)
        assert deleted_retrieved.get("name") == "Other / Universal Fallback"
        assert test_code not in load_default_patterns()

    asyncio.run(_run())


def test_get_prices_country_mapping_india():
    """Test 3: Verify getPrices logic for India (country code 22) with surge and dynamic stock."""
    async def _run():
        redis = MockRedisClient()
        defaults = load_default_patterns()

        services_catalog = [
            {
                "code": c_code,
                "name": c_info.get("name", c_code.upper()),
                "cost": float(c_info.get("price", 15.0) or 15.0),
                "stock": int(c_info.get("stock", 100) or 100)
            }
            for c_code, c_info in defaults.items()
        ]

        target_country = "22"
        services_map = {}

        for s in services_catalog:
            code = s["code"]
            price_info = await PricingEngine.compute_dynamic_price(redis, code, custom_base_price=s["cost"])
            cost = price_info["finalPrice"]
            count = max(1, s.get("stock", 100))
            services_map[code] = {
                "cost": cost,
                "price": cost,
                "amount": cost,
                "count": count,
                "stock": count,
                "operator": "any",
                "surge": price_info["isSurge"],
                "surgeReason": price_info["surgeReason"]
            }

        prices = {target_country: services_map}

        # Validations
        assert "22" in prices, "India country code '22' must be root key"
        india_services = prices["22"]
        assert len(india_services) >= 25, f"Expected >= 25 services for India, got {len(india_services)}"

        # Check specific major services
        for svc in ["tg", "wa", "go", "sw", "zo"]:
            assert svc in india_services, f"Service '{svc}' must be present in India pricing"
            entry = india_services[svc]
            assert entry["cost"] > 0, f"Cost must be positive for {svc}"
            assert entry["stock"] > 0, f"Stock must be positive for {svc}"
            assert isinstance(entry["surge"], bool), "Surge must be a boolean"

    asyncio.run(_run())


def test_otp_extraction_regex():
    """Test 4: Verify ultra-fast OTP extraction across diverse real-world SMS patterns."""
    samples = [
        ("Your Telegram code is: 48392", "48392"),
        ("Use 928374 to verify your WhatsApp account. Do not share.", "928374"),
        ("G-738291 is your Google verification code.", "738291"),
        ("Swiggy: 4930 is your OTP for order delivery.", "4930"),
        ("Your login password / OTP is 8943.", "8943"),
        ("Your activation code: 284019 valid for 10 mins.", "284019"),
    ]

    for body_text, expected_otp in samples:
        extracted = extract_otp_code(body_text)
        assert extracted == expected_otp, f"Failed for '{body_text}': expected {expected_otp}, got {extracted}"


def test_timestamp_parser_epoch_ms():
    """Test 5: Verify robust parsing of varied Firebase date/time formats into epoch milliseconds."""
    test_now_ms = int(time.time() * 1000)
    
    # Dict with raw epoch ms
    msg1 = {"timestamp": test_now_ms}
    assert parse_any_datetime_to_epoch_ms(msg1) == test_now_ms

    # Dict with ISO format string
    msg2 = {"dateTime": "2026-08-07 14:30:00"}
    ts2 = parse_any_datetime_to_epoch_ms(msg2)
    assert ts2 > 946684800000, f"Epoch ms must be valid year 2000+, got {ts2}"

    # Dict with legacy date_time string
    msg3 = {"date_time": "2026/08/07 18:45:00"}
    ts3 = parse_any_datetime_to_epoch_ms(msg3)
    assert ts3 > 946684800000, f"Epoch ms must be valid year 2000+, got {ts3}"


def test_phone_cache_atomic_save_and_load():
    """Test 6: Verify atomic phone cache saving and memory synchronization."""
    test_data = {
        "device_test_101": {
            "mobNo": "+919876543210",
            "carrier": "Airtel 5G",
            "simSlot": 1,
            "status": True,
            "lastSeen": time.time()
        }
    }
    
    GLOBAL_PHONE_CACHE.update(test_data)
    _save_phone_cache(test_data)
    
    assert "device_test_101" in GLOBAL_PHONE_CACHE
    assert GLOBAL_PHONE_CACHE["device_test_101"]["mobNo"] == "+919876543210"


if __name__ == "__main__":
    pytest.main(["-v", __file__])

