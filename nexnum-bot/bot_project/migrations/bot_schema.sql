-- Migration: bot_schema.sql
-- Purpose: Ensures all bot-specific tables, columns, indexes, views, and triggers exist in PostgreSQL.
-- Fully idempotent and safe to run against any fresh or existing database.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. USER SESSIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
    user_id               VARCHAR(255) PRIMARY KEY,
    data                  JSONB        DEFAULT '{}'::jsonb,
    selected_country_id   INTEGER,
    selected_service_code VARCHAR(50),
    menu_state            JSONB        DEFAULT '{}'::jsonb,
    temp_data             JSONB        DEFAULT '{}'::jsonb,
    last_activity         TIMESTAMPTZ  DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  DEFAULT NOW(),
    forum_id              INTEGER,
    forum_message_id      INTEGER,
    forum_archived        BOOLEAN      DEFAULT FALSE
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_sessions' AND column_name = 'data') THEN
        ALTER TABLE user_sessions ADD COLUMN data JSONB DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_sessions' AND column_name = 'selected_country_id') THEN
        ALTER TABLE user_sessions ADD COLUMN selected_country_id INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_sessions' AND column_name = 'selected_service_code') THEN
        ALTER TABLE user_sessions ADD COLUMN selected_service_code VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_sessions' AND column_name = 'menu_state') THEN
        ALTER TABLE user_sessions ADD COLUMN menu_state JSONB DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_sessions' AND column_name = 'temp_data') THEN
        ALTER TABLE user_sessions ADD COLUMN temp_data JSONB DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_sessions' AND column_name = 'last_activity') THEN
        ALTER TABLE user_sessions ADD COLUMN last_activity TIMESTAMPTZ DEFAULT NOW();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_sessions' AND column_name = 'forum_id') THEN
        ALTER TABLE user_sessions ADD COLUMN forum_id INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_sessions' AND column_name = 'forum_message_id') THEN
        ALTER TABLE user_sessions ADD COLUMN forum_message_id INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_sessions' AND column_name = 'forum_archived') THEN
        ALTER TABLE user_sessions ADD COLUMN forum_archived BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity
    ON user_sessions (last_activity);

-- ---------------------------------------------------------------------------
-- 2. USER REFERRALS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_referrals (
    user_id              VARCHAR(255) PRIMARY KEY,
    telegram_id          VARCHAR(255),
    referrer_id          VARCHAR(255),
    referral_code        VARCHAR(50) UNIQUE,
    total_earnings       NUMERIC(12,2) DEFAULT 0.0,
    total_referred_count INTEGER DEFAULT 0,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_referrals' AND column_name = 'telegram_id') THEN
        ALTER TABLE user_referrals ADD COLUMN telegram_id VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_referrals' AND column_name = 'total_earnings') THEN
        ALTER TABLE user_referrals ADD COLUMN total_earnings NUMERIC(12,2) DEFAULT 0.0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_referrals' AND column_name = 'total_referred_count') THEN
        ALTER TABLE user_referrals ADD COLUMN total_referred_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_referrals' AND column_name = 'updated_at') THEN
        ALTER TABLE user_referrals ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_referrals_referrer
    ON user_referrals (referrer_id);

CREATE INDEX IF NOT EXISTS idx_user_referrals_code
    ON user_referrals (referral_code);

-- ---------------------------------------------------------------------------
-- 3. DEPOSIT REQUESTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deposit_requests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          VARCHAR(255) NOT NULL,
    amount           NUMERIC(15,2) NOT NULL,
    currency         VARCHAR(10) NOT NULL DEFAULT 'USD',
    gateway          VARCHAR(50) DEFAULT 'upi',
    payment_gateway  VARCHAR(50),
    code             VARCHAR(100),
    transaction_code VARCHAR(100),
    status           VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    idempotency_key  VARCHAR(255) UNIQUE,
    metadata         JSONB DEFAULT '{}'::jsonb,
    completed_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposit_requests' AND column_name = 'payment_gateway') THEN
        ALTER TABLE deposit_requests ADD COLUMN payment_gateway VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposit_requests' AND column_name = 'transaction_code') THEN
        ALTER TABLE deposit_requests ADD COLUMN transaction_code VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposit_requests' AND column_name = 'completed_at') THEN
        ALTER TABLE deposit_requests ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_deposit_requests_user
    ON deposit_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deposit_requests_status
    ON deposit_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deposit_requests_idempotency
    ON deposit_requests (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. PURCHASE ORDERS EXTENSION
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'phone_number') THEN
        ALTER TABLE purchase_orders ADD COLUMN phone_number VARCHAR(20);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'sms_code') THEN
        ALTER TABLE purchase_orders ADD COLUMN sms_code VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'raw_response') THEN
        ALTER TABLE purchase_orders ADD COLUMN raw_response JSONB DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'expires_at') THEN
        ALTER TABLE purchase_orders ADD COLUMN expires_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'completed_at') THEN
        ALTER TABLE purchase_orders ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'retry_count') THEN
        ALTER TABLE purchase_orders ADD COLUMN retry_count INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'provider_name') THEN
        ALTER TABLE purchase_orders ADD COLUMN provider_name VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'service_type') THEN
        ALTER TABLE purchase_orders ADD COLUMN service_type VARCHAR(50);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_user
    ON purchase_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status
    ON purchase_orders (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. OPERATION LOCKS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operation_locks (
    lock_key    VARCHAR(255) PRIMARY KEY,
    owner_id    VARCHAR(255) NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_operation_locks_expires
    ON operation_locks (expires_at);

-- ---------------------------------------------------------------------------
-- 6. SUPPORT TICKETS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_tickets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     VARCHAR(255) NOT NULL,
    ticket_type VARCHAR(50) DEFAULT 'general',
    subject     TEXT,
    message     TEXT NOT NULL,
    status      VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user
    ON support_tickets (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status
    ON support_tickets (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7. ACCOUNT LINK TOKENS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_link_tokens (
    token       VARCHAR(64) PRIMARY KEY,
    user_id     VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_link_tokens_expires
    ON account_link_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- 8. FINANCIAL SUMMARY VIEW
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_financial_summary AS
SELECT
    u.id                      AS user_id,
    u.telegram_id,
    u.created_at              AS user_created_at,
    w.balance,
    w.updated_at              AS wallet_updated_at,
    COUNT(DISTINCT po.id)     AS total_orders,
    COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'COMPLETED')  AS completed_orders,
    COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'PENDING')    AS pending_orders,
    COUNT(DISTINCT po.id) FILTER (WHERE po.status = 'CANCELLED')  AS cancelled_orders,
    COALESCE(SUM(po.amount) FILTER (WHERE po.status = 'COMPLETED'), 0) AS total_spent,
    COALESCE(SUM(po.amount) FILTER (WHERE po.status = 'PENDING'), 0)   AS pending_spent,
    COUNT(DISTINCT dr.id)     AS total_deposits,
    COUNT(DISTINCT dr.id) FILTER (WHERE dr.status = 'COMPLETED')  AS completed_deposits,
    COALESCE(SUM(dr.amount) FILTER (WHERE dr.status = 'COMPLETED'), 0) AS total_deposited
FROM users u
LEFT JOIN wallets w ON w.user_id = u.id
LEFT JOIN purchase_orders po ON po.user_id = u.id
LEFT JOIN deposit_requests dr ON dr.user_id = u.id
GROUP BY u.id, u.telegram_id, u.created_at, w.balance, w.updated_at;

-- ---------------------------------------------------------------------------
-- 9. AUTO-UPDATED TRIGGER HELPERS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_sessions_updated_at ON user_sessions;
CREATE TRIGGER trg_user_sessions_updated_at
    BEFORE UPDATE ON user_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_deposit_requests_updated_at ON deposit_requests;
CREATE TRIGGER trg_deposit_requests_updated_at
    BEFORE UPDATE ON deposit_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
