-- ============================================================================
-- NexNum Master Full Database Schema (full_schema.sql)
-- Unified Master PostgreSQL Schema (identical mirror to app_schema.sql)
-- Safe & idempotent execution for any PostgreSQL instance.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. EXTENSIONS & SHARED TRIGGER FUNCTION
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------------
-- 1. ENUM TYPES & RECONCILIATION
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
-- 2. CURRENCIES (Base table for FK references)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "currencies" (
    "code"        TEXT PRIMARY KEY,
    "name"        TEXT NOT NULL,
    "symbol"      TEXT NOT NULL,
    "rate"        NUMERIC(10, 4) NOT NULL CHECK ("rate" > 0),
    "is_base"     BOOLEAN NOT NULL DEFAULT FALSE,
    "is_active"   BOOLEAN NOT NULL DEFAULT TRUE,
    "auto_update" BOOLEAN NOT NULL DEFAULT TRUE,
    "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "currencies_single_base_idx" ON "currencies" ("is_base") WHERE "is_base" = TRUE;

DROP TRIGGER IF EXISTS trg_currencies_updated_at ON "currencies";
CREATE TRIGGER trg_currencies_updated_at BEFORE UPDATE ON "currencies" FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- 3. USERS & PREFERENCES
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "users" (
    "id"                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "email"                  TEXT UNIQUE NOT NULL,
    "password_hash"          TEXT,
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
    "deleted_at"             TIMESTAMPTZ,
    "role"                   "Role" NOT NULL DEFAULT 'USER',
    "is_banned"              BOOLEAN NOT NULL DEFAULT FALSE,
    "email_verified"         TIMESTAMPTZ,
    "token_version"          INTEGER NOT NULL DEFAULT 1,
    "preferred_currency"     TEXT NOT NULL DEFAULT 'USD' REFERENCES "currencies"("code") ON UPDATE CASCADE,
    "twoFactorEnabled"       BOOLEAN NOT NULL DEFAULT FALSE,
    "twoFactorSecret"        TEXT,
    "twoFactorBackupCodes"   TEXT[] DEFAULT '{}'::text[],
    CONSTRAINT "users_has_credential_chk" CHECK (
        "password_hash" IS NOT NULL OR
        "google_id" IS NOT NULL OR "github_id" IS NOT NULL OR
        "twitter_id" IS NOT NULL OR "discord_id" IS NOT NULL OR
        "facebook_id" IS NOT NULL OR "telegram_id" IS NOT NULL
    )
);

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "twoFactorBackupCodes" TEXT[] DEFAULT '{}'::text[];
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;

UPDATE "users" SET "twoFactorEnabled" = FALSE WHERE "twoFactorEnabled" IS NULL;

DROP TRIGGER IF EXISTS trg_users_updated_at ON "users";
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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

CREATE INDEX IF NOT EXISTS "user_favorites_user_id_type_idx" ON "user_favorites" ("user_id", "type");


-- ---------------------------------------------------------------------------
-- 4. NOTIFICATIONS & PREFERENCES
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "notifications" (
    "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"    TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "type"       TEXT NOT NULL,
    "title"      TEXT NOT NULL,
    "message"    TEXT NOT NULL,
    "data"       JSONB,
    "read"       BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "notifications_user_id_read_idx" ON "notifications" ("user_id", "read");
CREATE INDEX IF NOT EXISTS "notifications_user_id_created_at_idx" ON "notifications" ("user_id", "created_at");

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

CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "push_subscriptions" ("user_id");

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at ON "push_subscriptions";
CREATE TRIGGER trg_push_subscriptions_updated_at BEFORE UPDATE ON "push_subscriptions" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

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
-- 5. WALLET & FINANCIAL LEDGER
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "wallets" (
    "id"                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"            TEXT UNIQUE NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "balance"            NUMERIC(18, 8) NOT NULL DEFAULT 0.00000000 CHECK ("balance" >= 0),
    "reserved"           NUMERIC(18, 8) NOT NULL DEFAULT 0.00000000 CHECK ("reserved" >= 0),
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "ledger_checksum"    NUMERIC(18, 8) NOT NULL DEFAULT 0.00000000,
    "ledger_checksum_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "balance_snapshot"   JSONB,
    CONSTRAINT "wallets_reserved_lte_balance_chk" CHECK ("reserved" <= "balance")
);

DROP TRIGGER IF EXISTS trg_wallets_updated_at ON "wallets";
CREATE TRIGGER trg_wallets_updated_at BEFORE UPDATE ON "wallets" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "wallet_transactions" (
    "id"                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "wallet_id"         TEXT NOT NULL REFERENCES "wallets"("id") ON DELETE RESTRICT,
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
-- 6. ORDERS & DEPOSITS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "purchase_orders" (
    "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"         TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "service_name"    TEXT NOT NULL,
    "country_name"    TEXT NOT NULL,
    "amount"          NUMERIC(8, 2) NOT NULL CHECK ("amount" > 0),
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

CREATE INDEX IF NOT EXISTS "purchase_orders_status_expires_at_idx" ON "purchase_orders" ("status", "expires_at");
CREATE INDEX IF NOT EXISTS "purchase_orders_user_id_idx" ON "purchase_orders" ("user_id");

DROP TRIGGER IF EXISTS trg_purchase_orders_updated_at ON "purchase_orders";
CREATE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON "purchase_orders" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "deposit_requests" (
    "id"               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"          TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "amount"           NUMERIC(12, 2) NOT NULL CHECK ("amount" > 0),
    "gateway"          TEXT DEFAULT 'upi',
    "payment_gateway"  TEXT,
    "status"           TEXT NOT NULL DEFAULT 'PENDING',
    "transaction_code" TEXT,
    "idempotency_key"  TEXT UNIQUE,
    "completed_at"     TIMESTAMPTZ,
    "created_at"       TIMESTAMPTZ DEFAULT NOW(),
    "updated_at"       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "deposit_requests_user_id_created_at_idx" ON "deposit_requests" ("user_id", "created_at");

DROP TRIGGER IF EXISTS trg_deposit_requests_updated_at ON "deposit_requests";
CREATE TRIGGER trg_deposit_requests_updated_at BEFORE UPDATE ON "deposit_requests" FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- 7. SUPPORT TICKETS, SESSIONS & TOKENS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "support_tickets" (
    "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"     TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "ticket_type" TEXT DEFAULT 'general',
    "subject"     TEXT,
    "message"     TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'OPEN',
    "created_at"  TIMESTAMPTZ DEFAULT NOW(),
    "updated_at"  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "support_tickets_user_id_created_at_idx" ON "support_tickets" ("user_id", "created_at");

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON "support_tickets";
CREATE TRIGGER trg_support_tickets_updated_at BEFORE UPDATE ON "support_tickets" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "user_referrals" (
    "user_id"              TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
    "telegram_id"          TEXT,
    "referral_code"        TEXT UNIQUE,
    "referrer_id"          TEXT REFERENCES "users"("id") ON DELETE SET NULL,
    "total_earnings"       NUMERIC(12, 2) DEFAULT 0.00,
    "total_referred_count" INTEGER DEFAULT 0,
    "created_at"           TIMESTAMPTZ DEFAULT NOW(),
    "updated_at"           TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT "user_referrals_no_self_referral_chk" CHECK ("user_id" != "referrer_id")
);

CREATE INDEX IF NOT EXISTS "user_referrals_referrer_id_idx" ON "user_referrals" ("referrer_id");

DROP TRIGGER IF EXISTS trg_user_referrals_updated_at ON "user_referrals";
CREATE TRIGGER trg_user_referrals_updated_at BEFORE UPDATE ON "user_referrals" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "user_sessions" (
    "user_id"    TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
    "data"       JSONB NOT NULL DEFAULT '{}'::jsonb,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_user_sessions_updated_at ON "user_sessions";
CREATE TRIGGER trg_user_sessions_updated_at BEFORE UPDATE ON "user_sessions" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "account_link_tokens" (
    "token_hash" TEXT PRIMARY KEY,
    "user_id"    TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "account_link_tokens_expires_at_idx" ON "account_link_tokens" ("expires_at");


-- ---------------------------------------------------------------------------
-- 8. NUMBERS & SMS MESSAGES
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

CREATE INDEX IF NOT EXISTS "numbers_owner_id_idx" ON "numbers" ("owner_id");
CREATE INDEX IF NOT EXISTS "numbers_status_idx" ON "numbers" ("status");
CREATE INDEX IF NOT EXISTS "numbers_status_created_at_idx" ON "numbers" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "numbers_status_next_poll_at_idx" ON "numbers" ("status", "next_poll_at");
CREATE INDEX IF NOT EXISTS "numbers_owner_id_status_idx" ON "numbers" ("owner_id", "status");
CREATE INDEX IF NOT EXISTS "numbers_provider_status_idx" ON "numbers" ("provider", "status");
CREATE INDEX IF NOT EXISTS "numbers_expires_at_idx" ON "numbers" ("expires_at");

DROP TRIGGER IF EXISTS trg_numbers_updated_at ON "numbers";
CREATE TRIGGER trg_numbers_updated_at BEFORE UPDATE ON "numbers" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "sms_messages" (
    "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "number_id"      TEXT NOT NULL REFERENCES "numbers"("id") ON DELETE CASCADE,
    "sender"         TEXT,
    "content"        TEXT,
    "code"           TEXT,
    "received_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expires_at"     TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    "provider"       TEXT,
    "raw_payload"    JSONB,
    "extracted_code" TEXT,
    "confidence"     NUMERIC(3, 2)
);

CREATE INDEX IF NOT EXISTS "sms_messages_number_id_idx" ON "sms_messages" ("number_id");
CREATE INDEX IF NOT EXISTS "sms_messages_provider_idx" ON "sms_messages" ("provider");
CREATE INDEX IF NOT EXISTS "sms_messages_expires_at_idx" ON "sms_messages" ("expires_at");


-- ---------------------------------------------------------------------------
-- 9. AUDIT LOGS & LOOKUPS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"       TEXT REFERENCES "users"("id") ON DELETE SET NULL,
    "action"        TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id"   TEXT,
    "metadata"      JSONB,
    "ip_address"    TEXT,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "audit_logs_user_id_idx" ON "audit_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" ("action");

CREATE TABLE IF NOT EXISTS "service_lookups" (
    "id"           SERIAL PRIMARY KEY,
    "service_code" TEXT UNIQUE NOT NULL,
    "name"         TEXT NOT NULL,
    "icon_url"     TEXT
);

CREATE TABLE IF NOT EXISTS "country_lookups" (
    "id"           SERIAL PRIMARY KEY,
    "country_code" TEXT UNIQUE NOT NULL,
    "name"         TEXT NOT NULL,
    "flag_url"     TEXT
);


-- ---------------------------------------------------------------------------
-- 10. CANONICAL NORMALIZATION ARCHITECTURE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "canonical_services" (
    "id"             SERIAL PRIMARY KEY,
    "canonical_code" VARCHAR(100) UNIQUE NOT NULL,
    "canonical_name" VARCHAR(255) NOT NULL,
    "display_name"   VARCHAR(255),
    "aliases"        JSONB NOT NULL,
    "metadata"       JSONB,
    "is_verified"    BOOLEAN NOT NULL DEFAULT FALSE,
    "is_active"      BOOLEAN NOT NULL DEFAULT TRUE,
    "provider_count" INTEGER NOT NULL DEFAULT 0,
    "offer_count"    INTEGER NOT NULL DEFAULT 0,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "canonical_services_canonical_code_idx" ON "canonical_services" ("canonical_code");
CREATE INDEX IF NOT EXISTS "canonical_services_canonical_name_idx" ON "canonical_services" ("canonical_name");
CREATE INDEX IF NOT EXISTS "canonical_services_is_verified_is_active_idx" ON "canonical_services" ("is_verified", "is_active");

DROP TRIGGER IF EXISTS trg_canonical_services_updated_at ON "canonical_services";
CREATE TRIGGER trg_canonical_services_updated_at BEFORE UPDATE ON "canonical_services" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "canonical_countries" (
    "id"             SERIAL PRIMARY KEY,
    "canonical_code" VARCHAR(100) UNIQUE NOT NULL,
    "canonical_name" VARCHAR(255) NOT NULL,
    "display_name"   JSONB NOT NULL,
    "aliases"        JSONB NOT NULL,
    "flag_url"       VARCHAR(500),
    "region"         VARCHAR(100),
    "sub_region"     VARCHAR(100),
    "coordinates"    JSONB,
    "is_verified"    BOOLEAN NOT NULL DEFAULT FALSE,
    "is_active"      BOOLEAN NOT NULL DEFAULT TRUE,
    "provider_count" INTEGER NOT NULL DEFAULT 0,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "canonical_countries_canonical_code_idx" ON "canonical_countries" ("canonical_code");
CREATE INDEX IF NOT EXISTS "canonical_countries_canonical_name_idx" ON "canonical_countries" ("canonical_name");
CREATE INDEX IF NOT EXISTS "canonical_countries_is_verified_is_active_idx" ON "canonical_countries" ("is_verified", "is_active");

DROP TRIGGER IF EXISTS trg_canonical_countries_updated_at ON "canonical_countries";
CREATE TRIGGER trg_canonical_countries_updated_at BEFORE UPDATE ON "canonical_countries" FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- 11. PROVIDER INFRASTRUCTURE & MAPPINGS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "providers" (
    "id"                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "name"                   TEXT UNIQUE NOT NULL,
    "display_name"           TEXT NOT NULL,
    "description"            TEXT,
    "logo_url"               TEXT,
    "website_url"            TEXT,
    "api_base_url"           TEXT NOT NULL,
    "authType"               TEXT NOT NULL DEFAULT 'bearer',
    "provider_type"          TEXT NOT NULL DEFAULT 'rest',
    "auth_key"               TEXT,
    "auth_header"            TEXT,
    "auth_query_param"       TEXT,
    "endpoints"              JSONB NOT NULL,
    "mappings"               JSONB NOT NULL,
    "price_multiplier"       NUMERIC(5, 2) NOT NULL DEFAULT 1.00,
    "fixed_markup"           NUMERIC(18, 8) NOT NULL DEFAULT 0.00000000,
    "currency"               TEXT NOT NULL DEFAULT 'USD',
    "normalization_mode"     TEXT NOT NULL DEFAULT 'AUTO',
    "normalization_rate"     NUMERIC(18, 8),
    "api_pair"               TEXT,
    "deposit_spent"          NUMERIC(18, 8),
    "deposit_received"       NUMERIC(18, 8),
    "deposit_currency"       TEXT NOT NULL DEFAULT 'USD',
    "balance"                NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    "low_balance_alert"      NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
    "last_balance_sync"      TIMESTAMPTZ,
    "success_rate"           NUMERIC(5, 2) NOT NULL DEFAULT 100.00,
    "total_orders"           INTEGER NOT NULL DEFAULT 0,
    "use_global_sync"        BOOLEAN NOT NULL DEFAULT FALSE,
    "priority"               INTEGER NOT NULL DEFAULT 0,
    "last_sync_at"           TIMESTAMPTZ,
    "sync_status"            TEXT,
    "sync_count"             INTEGER NOT NULL DEFAULT 0,
    "last_metadata_sync_at"  TIMESTAMPTZ,
    "created_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "is_active"              BOOLEAN NOT NULL DEFAULT FALSE,
    "sync_buffer_percent"    NUMERIC(5, 2) NOT NULL DEFAULT 0.00
);

CREATE INDEX IF NOT EXISTS "providers_is_active_idx" ON "providers" ("is_active");
CREATE INDEX IF NOT EXISTS "providers_priority_idx" ON "providers" ("priority");
CREATE INDEX IF NOT EXISTS "providers_is_active_priority_idx" ON "providers" ("is_active", "priority");

DROP TRIGGER IF EXISTS trg_providers_updated_at ON "providers";
CREATE TRIGGER trg_providers_updated_at BEFORE UPDATE ON "providers" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "provider_services" (
    "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "provider_id"  TEXT NOT NULL REFERENCES "providers"("id") ON DELETE CASCADE,
    "external_id"  TEXT NOT NULL,
    "code"         TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "icon_url"     TEXT,
    "is_active"    BOOLEAN NOT NULL DEFAULT TRUE,
    "last_sync_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "provider_services_provider_id_external_id_key" UNIQUE ("provider_id", "external_id")
);

CREATE INDEX IF NOT EXISTS "provider_services_provider_id_idx" ON "provider_services" ("provider_id");
CREATE INDEX IF NOT EXISTS "provider_services_code_idx" ON "provider_services" ("code");

CREATE TABLE IF NOT EXISTS "provider_countries" (
    "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "provider_id"  TEXT NOT NULL REFERENCES "providers"("id") ON DELETE CASCADE,
    "external_id"  TEXT NOT NULL,
    "code"         TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "flag_url"     TEXT,
    "is_active"    BOOLEAN NOT NULL DEFAULT TRUE,
    "last_sync_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "provider_countries_provider_id_external_id_key" UNIQUE ("provider_id", "external_id")
);

CREATE INDEX IF NOT EXISTS "provider_countries_provider_id_idx" ON "provider_countries" ("provider_id");
CREATE INDEX IF NOT EXISTS "provider_countries_code_idx" ON "provider_countries" ("code");

CREATE TABLE IF NOT EXISTS "provider_service_mappings" (
    "id"                   SERIAL PRIMARY KEY,
    "provider_id"          TEXT NOT NULL REFERENCES "providers"("id") ON DELETE CASCADE,
    "provider_service_id"  TEXT NOT NULL REFERENCES "provider_services"("id") ON DELETE CASCADE,
    "canonical_service_id" INTEGER NOT NULL REFERENCES "canonical_services"("id") ON DELETE RESTRICT,
    "confidence"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "match_method"         "MatchMethod" NOT NULL DEFAULT 'AUTO_ALIAS',
    "is_verified"          BOOLEAN NOT NULL DEFAULT FALSE,
    "reviewed_by_id"       TEXT REFERENCES "users"("id") ON DELETE SET NULL,
    "reviewed_at"          TIMESTAMPTZ,
    "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "provider_service_mappings_provider_id_provider_service_id_key" UNIQUE ("provider_id", "provider_service_id")
);

CREATE INDEX IF NOT EXISTS "provider_service_mappings_provider_id_canonical_service_id_idx" ON "provider_service_mappings" ("provider_id", "canonical_service_id");

DROP TRIGGER IF EXISTS trg_provider_service_mappings_updated_at ON "provider_service_mappings";
CREATE TRIGGER trg_provider_service_mappings_updated_at BEFORE UPDATE ON "provider_service_mappings" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "provider_country_mappings" (
    "id"                   SERIAL PRIMARY KEY,
    "provider_id"          TEXT NOT NULL REFERENCES "providers"("id") ON DELETE CASCADE,
    "provider_country_id"  TEXT NOT NULL REFERENCES "provider_countries"("id") ON DELETE CASCADE,
    "canonical_country_id" INTEGER NOT NULL REFERENCES "canonical_countries"("id") ON DELETE RESTRICT,
    "confidence"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "match_method"         "MatchMethod" NOT NULL DEFAULT 'AUTO_ALIAS',
    "is_verified"          BOOLEAN NOT NULL DEFAULT FALSE,
    "reviewed_by_id"       TEXT REFERENCES "users"("id") ON DELETE SET NULL,
    "reviewed_at"          TIMESTAMPTZ,
    "created_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "provider_country_mappings_provider_id_provider_country_id_key" UNIQUE ("provider_id", "provider_country_id")
);

CREATE INDEX IF NOT EXISTS "provider_country_mappings_provider_id_canonical_country_id_idx" ON "provider_country_mappings" ("provider_id", "canonical_country_id");

DROP TRIGGER IF EXISTS trg_provider_country_mappings_updated_at ON "provider_country_mappings";
CREATE TRIGGER trg_provider_country_mappings_updated_at BEFORE UPDATE ON "provider_country_mappings" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "mapping_review_queue" (
    "id"                    SERIAL PRIMARY KEY,
    "entity_type"           "ReviewEntityType" NOT NULL,
    "provider_id"           TEXT NOT NULL REFERENCES "providers"("id") ON DELETE CASCADE,
    "raw_external_id"       VARCHAR(100) NOT NULL,
    "raw_name"              VARCHAR(255) NOT NULL,
    "raw_code"              VARCHAR(100),
    "candidate_matches"     JSONB NOT NULL,
    "canonical_service_id" INTEGER REFERENCES "canonical_services"("id") ON DELETE SET NULL,
    "canonical_country_id" INTEGER REFERENCES "canonical_countries"("id") ON DELETE SET NULL,
    "best_match_id"         INTEGER,
    "best_match_confidence" DOUBLE PRECISION,
    "status"                "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "resolved_by_id"        TEXT REFERENCES "users"("id") ON DELETE SET NULL,
    "resolved_at"           TIMESTAMPTZ,
    "priority"              INTEGER NOT NULL DEFAULT 0,
    "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "mapping_review_queue_entity_chk" CHECK (
        ("entity_type" = 'SERVICE' AND "canonical_service_id" IS NOT NULL AND "canonical_country_id" IS NULL) OR
        ("entity_type" = 'COUNTRY' AND "canonical_country_id" IS NOT NULL AND "canonical_service_id" IS NULL) OR
        ("status" = 'PENDING')
    )
);

CREATE INDEX IF NOT EXISTS "mapping_review_queue_resolver_idx" ON "mapping_review_queue" ("status", "priority" DESC, "created_at");

CREATE TABLE IF NOT EXISTS "provider_test_results" (
    "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "provider_id"   TEXT NOT NULL REFERENCES "providers"("id") ON DELETE CASCADE,
    "action"        TEXT NOT NULL,
    "success"       BOOLEAN NOT NULL,
    "http_status"   INTEGER,
    "response_time" INTEGER,
    "request_url"   TEXT,
    "response_data" TEXT,
    "error"         TEXT,
    "tested_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "provider_test_results_provider_tested_idx" ON "provider_test_results" ("provider_id", "tested_at");

CREATE TABLE IF NOT EXISTS "provider_health_logs" (
    "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "provider_id"  TEXT NOT NULL REFERENCES "providers"("id") ON DELETE CASCADE,
    "status"       TEXT NOT NULL,
    "successRate"  NUMERIC(5, 2) NOT NULL,
    "avgLatency"   INTEGER NOT NULL,
    "errorCount"   INTEGER NOT NULL DEFAULT 0,
    "checked_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "provider_health_logs_provider_checked_idx" ON "provider_health_logs" ("provider_id", "checked_at");


-- ---------------------------------------------------------------------------
-- 12. ACTIVATIONS, RESERVATIONS & EVENTS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "offer_reservations" (
    "id"                      TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "offer_id"                TEXT NOT NULL,
    "user_id"                 TEXT REFERENCES "users"("id") ON DELETE SET NULL,
    "quantity"                INTEGER NOT NULL DEFAULT 1,
    "expires_at"              TIMESTAMPTZ NOT NULL,
    "status"                  "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key"         TEXT UNIQUE,
    "provider_reservation_id" TEXT,
    "created_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "confirmed_at"            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "offer_reservations_status_expires_at_idx" ON "offer_reservations" ("status", "expires_at");

CREATE TABLE IF NOT EXISTS "service_aggregates" (
    "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "service_code"    TEXT UNIQUE NOT NULL,
    "service_name"    TEXT NOT NULL,
    "lowest_price"    NUMERIC(8, 2) NOT NULL,
    "total_stock"     BIGINT NOT NULL,
    "country_count"   INTEGER NOT NULL,
    "provider_count"  INTEGER NOT NULL,
    "flag_urls"       TEXT[] DEFAULT '{}'::text[],
    "last_updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "activations" (
    "id"                     TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"                TEXT REFERENCES "users"("id") ON DELETE CASCADE,
    "state"                  "ActivationState" NOT NULL DEFAULT 'RESERVED',
    "price"                  NUMERIC(18, 8) NOT NULL,
    "provider_cost"          NUMERIC(18, 8) NOT NULL DEFAULT 0.00000000,
    "profit"                 NUMERIC(18, 8) NOT NULL DEFAULT 0.00000000,
    "reserved_tx_id"         TEXT REFERENCES "wallet_transactions"("id") ON DELETE SET NULL,
    "captured_tx_id"         TEXT REFERENCES "wallet_transactions"("id") ON DELETE SET NULL,
    "refund_tx_id"           TEXT REFERENCES "wallet_transactions"("id") ON DELETE SET NULL,
    "provider_activation_id" TEXT,
    "provider_id"            TEXT REFERENCES "providers"("id") ON DELETE SET NULL,
    "service_name"           TEXT NOT NULL,
    "country_code"           TEXT NOT NULL,
    "country_name"           TEXT,
    "operator_id"            TEXT,
    "phone_number"           TEXT,
    "expires_at"             TIMESTAMPTZ,
    "number_id"              TEXT UNIQUE REFERENCES "numbers"("id") ON DELETE SET NULL,
    "idempotency_key"        TEXT UNIQUE,
    "trace_id"               TEXT,
    "created_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "activations_user_id_state_idx" ON "activations" ("user_id", "state");
CREATE INDEX IF NOT EXISTS "activations_state_expires_at_idx" ON "activations" ("state", "expires_at");

DROP TRIGGER IF EXISTS trg_activations_updated_at ON "activations";
CREATE TRIGGER trg_activations_updated_at BEFORE UPDATE ON "activations" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "activation_state_history" (
    "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "activation_id"  TEXT NOT NULL REFERENCES "activations"("id") ON DELETE CASCADE,
    "state"          "ActivationState" NOT NULL,
    "previous_state" "ActivationState",
    "reason"         TEXT,
    "metadata"       JSONB,
    "trace_id"       TEXT,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "provider_events" (
    "id"                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "provider_event_id" TEXT UNIQUE NOT NULL,
    "provider_id"       TEXT NOT NULL REFERENCES "providers"("id") ON DELETE CASCADE,
    "activation_id"     TEXT REFERENCES "activations"("id") ON DELETE SET NULL,
    "event_type"        TEXT NOT NULL,
    "payload"           JSONB NOT NULL,
    "processed"         BOOLEAN NOT NULL DEFAULT FALSE,
    "processed_at"      TIMESTAMPTZ,
    "received_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "provider_events_unprocessed_idx" ON "provider_events" ("processed", "received_at") WHERE "processed" = FALSE;

CREATE TABLE IF NOT EXISTS "webhook_events" (
    "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "provider"        TEXT NOT NULL,
    "event_type"      TEXT NOT NULL,
    "payload"         JSONB NOT NULL,
    "idempotency_key" TEXT UNIQUE NOT NULL,
    "processed"       BOOLEAN NOT NULL DEFAULT FALSE,
    "processed_at"    TIMESTAMPTZ,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "webhook_events_unprocessed_idx" ON "webhook_events" ("processed", "created_at") WHERE "processed" = FALSE;

CREATE TABLE IF NOT EXISTS "outbox_events_v2" (
    "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "aggregate_id"   TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "event_type"     TEXT NOT NULL,
    "payload"        JSONB NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'PENDING',
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "error"          TEXT,
    "retry_count"    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "outbox_events_pending_idx" ON "outbox_events_v2" ("status", "created_at") WHERE "status" = 'PENDING';

DROP TRIGGER IF EXISTS trg_outbox_events_v2_updated_at ON "outbox_events_v2";
CREATE TRIGGER trg_outbox_events_v2_updated_at BEFORE UPDATE ON "outbox_events_v2" FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- 13. SYSTEM SETTINGS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "system_settings" (
    "id"                         TEXT PRIMARY KEY DEFAULT 'default',
    "base_currency"              TEXT NOT NULL DEFAULT 'USD' REFERENCES "currencies"("code") ON UPDATE CASCADE,
    "display_currency"           TEXT NOT NULL DEFAULT 'USD' REFERENCES "currencies"("code") ON UPDATE CASCADE,
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
    "inr_to_usd_rate"            NUMERIC(10, 4) NOT NULL DEFAULT 88.50,
    "rates_version"              INTEGER NOT NULL DEFAULT 1,
    "smtp_host"                  TEXT,
    "smtp_pass"                  TEXT,
    "smtp_port"                  INTEGER,
    "smtp_user"                  TEXT,
    "sync_buffer_percent"        NUMERIC(5, 2) NOT NULL DEFAULT 2.00,
    CONSTRAINT "system_settings_singleton_chk" CHECK ("id" = 'default')
);

DROP TRIGGER IF EXISTS trg_system_settings_updated_at ON "system_settings";
CREATE TRIGGER trg_system_settings_updated_at BEFORE UPDATE ON "system_settings" FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- 14. API KEYS, WEBHOOKS & SECURITY TOKENS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "api_keys" (
    "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"      TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "name"         TEXT NOT NULL,
    "key_hash"     TEXT UNIQUE NOT NULL,
    "prefix"       TEXT NOT NULL,
    "permissions"  TEXT[] NOT NULL DEFAULT '{}'::text[],
    "tier"         "ApiTier" NOT NULL DEFAULT 'FREE',
    "rate_limit"   INTEGER NOT NULL DEFAULT 60,
    "usage_count"  BIGINT NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMPTZ,
    "last_used_ip" TEXT,
    "expires_at"   TIMESTAMPTZ,
    "is_active"    BOOLEAN NOT NULL DEFAULT TRUE,
    "ip_whitelist" TEXT[] NOT NULL DEFAULT '{}'::text[],
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "api_keys_user_id_idx" ON "api_keys" ("user_id");

DROP TRIGGER IF EXISTS trg_api_keys_updated_at ON "api_keys";
CREATE TRIGGER trg_api_keys_updated_at BEFORE UPDATE ON "api_keys" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "webhooks" (
    "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"         TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "url"             TEXT NOT NULL,
    "secret"          TEXT NOT NULL,
    "events"          TEXT[] NOT NULL DEFAULT '{}'::text[],
    "is_active"       BOOLEAN NOT NULL DEFAULT TRUE,
    "fail_count"      INTEGER NOT NULL DEFAULT 0,
    "last_tried_at"   TIMESTAMPTZ,
    "last_success_at" TIMESTAMPTZ,
    "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_webhooks_updated_at ON "webhooks";
CREATE TRIGGER trg_webhooks_updated_at BEFORE UPDATE ON "webhooks" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
    "id"            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "webhook_id"    TEXT NOT NULL REFERENCES "webhooks"("id") ON DELETE CASCADE,
    "event"         TEXT NOT NULL,
    "payload"       JSONB NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'pending',
    "response_code" INTEGER,
    "response_body" TEXT,
    "duration_ms"   INTEGER,
    "attempts"      INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "delivered_at"  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS "webhook_deliveries_pending_retry_idx" ON "webhook_deliveries" ("status", "next_retry_at") WHERE "status" = 'pending';

CREATE TABLE IF NOT EXISTS "password_resets" (
    "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"    TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "token_hash" TEXT UNIQUE NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at"    TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "ip_address" TEXT
);

CREATE INDEX IF NOT EXISTS "password_resets_user_id_idx" ON "password_resets" ("user_id");
CREATE INDEX IF NOT EXISTS "password_resets_expires_at_idx" ON "password_resets" ("expires_at");

CREATE TABLE IF NOT EXISTS "email_verification_tokens" (
    "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "user_id"    TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "token_hash" TEXT UNIQUE NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at"    TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "email_verification_tokens_user_id_idx" ON "email_verification_tokens" ("user_id");
CREATE INDEX IF NOT EXISTS "email_verification_tokens_expires_at_idx" ON "email_verification_tokens" ("expires_at");

CREATE TABLE IF NOT EXISTS "banned_icons" (
    "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "hash"        TEXT UNIQUE NOT NULL,
    "description" TEXT,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "coupons" (
    "id"                 TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "code"               TEXT UNIQUE NOT NULL,
    "type"               "CouponType" NOT NULL,
    "status"             "CouponStatus" NOT NULL DEFAULT 'ACTIVE',
    "discountType"       TEXT,
    "discountValue"      NUMERIC(10, 2),
    "giftAmount"         NUMERIC(10, 2),
    "maxDiscount"        NUMERIC(10, 2),
    "maxUses"            INTEGER NOT NULL DEFAULT 1,
    "maxUsesPerUser"     INTEGER NOT NULL DEFAULT 1,
    "currentUses"        INTEGER NOT NULL DEFAULT 0 CHECK ("currentUses" <= "maxUses"),
    "minDepositAmount"   NUMERIC(10, 2),
    "validServices"      TEXT[] NOT NULL DEFAULT '{}'::text[],
    "newUsersOnly"       BOOLEAN NOT NULL DEFAULT FALSE,
    "startsAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expiresAt"          TIMESTAMPTZ,
    "referrer_id"        TEXT REFERENCES "users"("id") ON DELETE SET NULL,
    "referralBonus"      NUMERIC(10, 2),
    "name"               TEXT,
    "description"        TEXT,
    "created_by"         TEXT,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "coupons_type_amount_chk" CHECK (
        ("type" = 'PROMO' AND "discountValue" IS NOT NULL) OR
        ("type" = 'GIFT' AND "giftAmount" IS NOT NULL) OR
        ("type" = 'REFERRAL' AND "referralBonus" IS NOT NULL)
    )
);

DROP TRIGGER IF EXISTS trg_coupons_updated_at ON "coupons";
CREATE TRIGGER trg_coupons_updated_at BEFORE UPDATE ON "coupons" FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS "coupon_redemptions" (
    "id"                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "coupon_id"         TEXT REFERENCES "coupons"("id") ON DELETE SET NULL,
    "user_id"           TEXT REFERENCES "users"("id") ON DELETE SET NULL,
    "deposit_id"        TEXT REFERENCES "deposit_requests"("id") ON DELETE SET NULL,
    "appliedAmount"     NUMERIC(10, 2) NOT NULL,
    "originalAmount"    NUMERIC(10, 2),
    "finalAmount"       NUMERIC(10, 2),
    "ip_address"        TEXT,
    "user_agent"        TEXT,
    "device_fingerprint" TEXT,
    "redeemed_at"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "coupon_redemptions_coupon_id_user_id_deposit_id_key" UNIQUE NULLS NOT DISTINCT ("coupon_id", "user_id", "deposit_id")
);

CREATE TABLE IF NOT EXISTS "verification_attempts" (
    "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "token_hash"  TEXT NOT NULL,
    "ipAddress"   TEXT NOT NULL,
    "success"     BOOLEAN NOT NULL,
    "attemptedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "userId"      TEXT REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "verification_attempts_ip_attempted_idx" ON "verification_attempts" ("ipAddress", "attemptedAt");

COMMIT;
