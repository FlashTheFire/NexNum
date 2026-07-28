-- Migration: 001_redis_to_pg.sql
-- Purpose: Replace Redis primary-store with PostgreSQL for all persistent data.
-- Applies on top of the existing shared NexNum schema managed by nexnum-app.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. USER SESSIONS  (replaces user_data:{telegram_id}:profile:main)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
    user_id              VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    selected_country_id  INTEGER,
    selected_service_code VARCHAR(50),
    menu_state           JSONB        DEFAULT '{}'::jsonb,
    temp_data            JSONB        DEFAULT '{}'::jsonb,
    last_activity        TIMESTAMPTZ  DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  DEFAULT NOW(),
    forum_id             INTEGER,
    forum_message_id     INTEGER,
    forum_archived       BOOLEAN      DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity
    ON user_sessions (last_activity);

-- ---------------------------------------------------------------------------
-- 2. USER REFERRALS  (replaces user_data:{telegram_id}:referral)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_referrals (
    user_id        VARCHAR(255) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    referrer_id    VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
    referral_code  VARCHAR(50) UNIQUE,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_referrals_referrer
    ON user_referrals (referrer_id);

CREATE INDEX IF NOT EXISTS idx_user_referrals_code
    ON user_referrals (referral_code);

-- ---------------------------------------------------------------------------
-- 3. DEPOSIT REQUESTS  (replaces deposit_data:{deposit_id} in Redis)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deposit_requests (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount           NUMERIC(15,2) NOT NULL,
    currency         VARCHAR(10)  NOT NULL DEFAULT 'USD',
    gateway          VARCHAR(50)  NOT NULL,
    code             VARCHAR(100),
    status           VARCHAR(20)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT')),
    idempotency_key  VARCHAR(255) UNIQUE,
    metadata         JSONB        DEFAULT '{}'::jsonb,
    created_at       TIMESTAMPTZ  DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deposit_requests_user
    ON deposit_requests (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deposit_requests_status
    ON deposit_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deposit_requests_idempotency
    ON deposit_requests (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. PURCHASE ORDERS EXTENSION
-- (adds tracking fields to the existing purchase_orders table)
-- ---------------------------------------------------------------------------
-- The existing table is managed by nexnum-app via Prisma.
-- We extend it with columns the bot's order tracker needs.
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

CREATE INDEX IF NOT EXISTS idx_purchase_orders_activation
    ON purchase_orders (activation_id)
    WHERE activation_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. OPERATION LOCKS  (replaces Redis SET NX EX distributed locks)
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
-- 6. FINANCIAL SUMMARY VIEW  (convenience read for admin/reporting)
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
-- 7. AUTO-UPDATED TRIGGER HELPERS
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

-- ---------------------------------------------------------------------------
-- 8. SUPPORT TICKETS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_tickets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_type VARCHAR(50)  DEFAULT 'general',
    subject     TEXT,
    message     TEXT         NOT NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PENDING', 'CLOSED', 'RESOLVED')),
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user
    ON support_tickets (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status
    ON support_tickets (status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 9. ACCOUNT LINK TOKENS (Web App -> Telegram Bot 1-Click Linking)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_link_tokens (
    token       VARCHAR(64) PRIMARY KEY,
    user_id     VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_link_tokens_expires
    ON account_link_tokens (expires_at);

COMMIT;
