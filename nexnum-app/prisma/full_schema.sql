-- ============================================================================
-- NexNum Master Full Database Schema (full_schema.sql)
-- Complete standalone PostgreSQL SQL script for nexnum-app
-- Safe & idempotent execution for any PostgreSQL instance (Supabase, Neon, AWS, GCP, Docker)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "ActivationState" AS ENUM (
        'INIT', 'RESERVED', 'ACTIVE', 'RECEIVED', 'EXPIRED', 'CANCELLED', 'FAILED', 'REFUNDED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "ApiTier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "CouponType" AS ENUM ('PROMO', 'GIFT', 'REFERRAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "CouponStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DEPLETED', 'DISABLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "MatchMethod" AS ENUM ('AUTO_ALIAS', 'AUTO_FUZZY', 'AUTO_NEW', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "ReviewEntityType" AS ENUM ('SERVICE', 'COUNTRY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CREATE_NEW');
EXCEPTION WHEN duplicate_object THEN null; END $$;


-- ---------------------------------------------------------------------------
-- 2. USERS & PREFERENCES
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "users" (
    "id"                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "email"                  TEXT UNIQUE NOT NULL,
    "password_hash"          TEXT NOT NULL,
    "name"                   TEXT NOT NULL,
    "google_id"              TEXT UNIQUE,
    "github_id"              TEXT UNIQUE,
    "twitter_id"             TEXT UNIQUE,
    "discord_id"             TEXT UNIQUE,
    "facebook_id"            TEXT UNIQUE,
    "telegram_id"            TEXT UNIQUE,
    "image"                  TEXT,
    "created_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "role"                   "Role" NOT NULL DEFAULT 'USER',
    "is_banned"              BOOLEAN NOT NULL DEFAULT FALSE,
    "email_verified"         TIMESTAMPTZ,
    "token_version"          INTEGER NOT NULL DEFAULT 1,
    "preferred_currency"     TEXT NOT NULL DEFAULT 'USD',
    "twoFactorEnabled"       BOOLEAN NOT NULL DEFAULT FALSE,
    "twoFactorSecret"        TEXT,
    "twoFactorBackupCodes"   TEXT[] DEFAULT '{}'::text[]
);

CREATE TABLE IF NOT EXISTS "user_favorites" (
    "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"      TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "type"         TEXT NOT NULL,
    "value"        TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "icon_url"     TEXT,
    "sort_order"   INTEGER NOT NULL DEFAULT 0,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "user_favorites_user_id_type_value_key" UNIQUE ("user_id", "type", "value")
);

CREATE TABLE IF NOT EXISTS "notifications" (
    "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"    TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "type"       TEXT NOT NULL,
    "title"      TEXT NOT NULL,
    "message"    TEXT NOT NULL,
    "data"       JSONB,
    "read"       BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"    TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "endpoint"   TEXT UNIQUE NOT NULL,
    "p256dh"     TEXT NOT NULL,
    "auth"       TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "notification_preferences" (
    "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"       TEXT UNIQUE NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "email_enabled" BOOLEAN NOT NULL DEFAULT TRUE,
    "push_enabled"  BOOLEAN NOT NULL DEFAULT TRUE,
    "sms_enabled"   BOOLEAN NOT NULL DEFAULT FALSE,
    "sms_received"  BOOLEAN NOT NULL DEFAULT TRUE,
    "promotions"    BOOLEAN NOT NULL DEFAULT TRUE,
    "billing"       BOOLEAN NOT NULL DEFAULT TRUE,
    "security"      BOOLEAN NOT NULL DEFAULT TRUE,
    "system"        BOOLEAN NOT NULL DEFAULT TRUE,
    "sound_enabled" BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------------
-- 3. WALLETS & TRANSACTIONS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "wallets" (
    "id"                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"            TEXT UNIQUE NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "balance"            NUMERIC(18, 8) NOT NULL DEFAULT 0.00000000,
    "reserved"           NUMERIC(18, 8) NOT NULL DEFAULT 0.00000000,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "ledger_checksum"    NUMERIC(18, 8) NOT NULL DEFAULT 0.00000000,
    "ledger_checksum_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "balance_snapshot"   JSONB
);

CREATE TABLE IF NOT EXISTS "wallet_transactions" (
    "id"                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "wallet_id"         TEXT NOT NULL REFERENCES "wallets"("id") ON DELETE CASCADE,
    "amount"            NUMERIC(18, 8) NOT NULL,
    "type"              TEXT NOT NULL,
    "description"       TEXT,
    "idempotency_key"   TEXT UNIQUE,
    "metadata"          JSONB,
    "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "currency_snapshot" JSONB
);

CREATE INDEX IF NOT EXISTS "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions" ("wallet_id", "created_at");

-- ---------------------------------------------------------------------------
-- 4. ORDERS & DEPOSITS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "purchase_orders" (
    "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"         TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "service_name"    TEXT NOT NULL,
    "country_name"    TEXT NOT NULL,
    "amount"          NUMERIC(8, 2) NOT NULL,
    "status"          TEXT NOT NULL,
    "provider"        TEXT,
    "activation_id"   TEXT,
    "phone_number"    TEXT,
    "sms_code"        TEXT,
    "completed_at"    TIMESTAMPTZ,
    "retry_count"     INTEGER DEFAULT 0,
    "raw_response"    JSONB,
    "idempotency_key" TEXT UNIQUE,
    "expires_at"      TIMESTAMPTZ NOT NULL,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "deposit_requests" (
    "id"               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"          TEXT NOT NULL,
    "amount"           NUMERIC(12, 2) NOT NULL,
    "gateway"          TEXT DEFAULT 'upi',
    "payment_gateway"  TEXT,
    "status"           TEXT NOT NULL DEFAULT 'PENDING',
    "transaction_code" TEXT,
    "idempotency_key"  TEXT UNIQUE,
    "completed_at"     TIMESTAMPTZ,
    "created_at"       TIMESTAMPTZ DEFAULT NOW(),
    "updated_at"       TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 5. NUMBERS, ACTIVATIONS & SYSTEM SETTINGS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "numbers" (
    "id"                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "phone_number"          TEXT NOT NULL,
    "phone_country_code"    TEXT,
    "phone_national_number" TEXT,
    "country_code"          TEXT NOT NULL,
    "country_name"          TEXT,
    "country_icon_url"      TEXT,
    "service_name"          TEXT,
    "service_code"          TEXT,
    "service_icon_url"      TEXT,
    "price"                 NUMERIC(8, 2) NOT NULL,
    "provider_cost"         NUMERIC(8, 4) NOT NULL DEFAULT 0.0000,
    "profit"                NUMERIC(8, 4) NOT NULL DEFAULT 0.0000,
    "status"                TEXT NOT NULL DEFAULT 'available',
    "owner_id"              TEXT REFERENCES "users"("id") ON DELETE SET NULL,
    "activation_id"         TEXT,
    "provider"              TEXT,
    "idempotency_key"       TEXT UNIQUE,
    "expires_at"            TIMESTAMPTZ,
    "purchased_at"          TIMESTAMPTZ,
    "poll_count"            INTEGER NOT NULL DEFAULT 0,
    "next_poll_at"          TIMESTAMPTZ DEFAULT NOW(),
    "last_polled_at"        TIMESTAMPTZ,
    "error_count"           INTEGER NOT NULL DEFAULT 0,
    "last_error"            TEXT,
    "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "sms_messages" (
    "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "number_id"      TEXT NOT NULL REFERENCES "numbers"("id") ON DELETE CASCADE,
    "sender"         TEXT,
    "content"        TEXT,
    "code"           TEXT,
    "received_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "provider"       TEXT,
    "raw_payload"    JSONB,
    "extracted_code" TEXT,
    "confidence"     NUMERIC(3, 2)
);

CREATE TABLE IF NOT EXISTS "system_settings" (
    "id"                         TEXT PRIMARY KEY DEFAULT 'default',
    "base_currency"              TEXT NOT NULL DEFAULT 'USD',
    "display_currency"           TEXT NOT NULL DEFAULT 'USD',
    "points_enabled"             BOOLEAN NOT NULL DEFAULT FALSE,
    "points_name"                TEXT NOT NULL DEFAULT 'Points',
    "points_rate"                NUMERIC NOT NULL DEFAULT 100.0,
    "payments_enabled"           BOOLEAN NOT NULL DEFAULT FALSE,
    "upi_provider_mode"          TEXT NOT NULL DEFAULT 'DISABLED',
    "upi_api_token"              TEXT,
    "upi_create_order_url"        TEXT,
    "upi_check_status_url"        TEXT,
    "upi_qr_base_url"            TEXT,
    "paytm_merchant_id"          TEXT,
    "paytm_merchant_key"         TEXT,
    "paytm_website"              TEXT,
    "paytm_industry_type"        TEXT,
    "paytm_channel_id"           TEXT,
    "paytm_callback_url"         TEXT,
    "paytm_environment"          TEXT NOT NULL DEFAULT 'STAGING',
    "deposit_min_amount"         NUMERIC(10, 2) NOT NULL DEFAULT 10,
    "deposit_max_amount"         NUMERIC(10, 2) NOT NULL DEFAULT 50000,
    "deposit_timeout_mins"       INTEGER NOT NULL DEFAULT 15,
    "max_pending_deposits"       INTEGER NOT NULL DEFAULT 3,
    "deposit_bonus_percent"      NUMERIC(5, 2) NOT NULL DEFAULT 0,
    "updated_at"                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "captcha_enabled"            BOOLEAN NOT NULL DEFAULT TRUE,
    "crypto_api_base_url"        TEXT,
    "crypto_api_token"           TEXT,
    "crypto_provider_mode"       TEXT NOT NULL DEFAULT 'DISABLED',
    "crypto_usdt_bep20_address"  TEXT,
    "crypto_usdt_trx_address"    TEXT,
    "crypto_webhook_secret"      TEXT,
    "email_from"                 TEXT,
    "heartbeat_enabled"          BOOLEAN NOT NULL DEFAULT TRUE,
    "heartbeat_interval_mins"    INTEGER NOT NULL DEFAULT 60,
    "heartbeat_last_run_at"      TIMESTAMPTZ,
    "inr_to_usd_rate"            NUMERIC(10, 4) NOT NULL DEFAULT 96.28,
    "rates_version"              INTEGER NOT NULL DEFAULT 1,
    "smtp_host"                  TEXT,
    "smtp_pass"                  TEXT,
    "smtp_port"                  INTEGER,
    "smtp_user"                  TEXT,
    "sync_buffer_percent"        NUMERIC(5, 2) NOT NULL DEFAULT 2.00
);

COMMIT;
