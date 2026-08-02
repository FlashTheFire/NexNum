-- Migration: bot_schema.sql
-- Purpose: Ensures all bot-specific tables, columns, indexes, views, and triggers exist in PostgreSQL.
-- Fully idempotent and safe to run against any fresh or existing database.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS account_origin VARCHAR(50) DEFAULT 'web';

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

ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS selected_country_id INTEGER;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS selected_service_code VARCHAR(50);
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS menu_state JSONB DEFAULT '{}'::jsonb;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS temp_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS forum_id INTEGER;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS forum_message_id INTEGER;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS forum_archived BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity
    ON user_sessions (last_activity);

-- If user_referrals was created with old PK (telegram_id), migrate to user_id PK
DO $$
BEGIN
    -- Check if the table exists AND has telegram_id as PK (old schema)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'user_referrals' AND tc.constraint_type = 'PRIMARY KEY'
        AND kcu.column_name = 'telegram_id'
    ) THEN
        -- Old schema: PK was telegram_id. Drop and let CREATE TABLE below recreate with user_id PK.
        DROP TABLE user_referrals;
    END IF;
END $$;

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

ALTER TABLE user_referrals ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(255);
ALTER TABLE user_referrals ADD COLUMN IF NOT EXISTS total_earnings NUMERIC(12,2) DEFAULT 0.0;
ALTER TABLE user_referrals ADD COLUMN IF NOT EXISTS total_referred_count INTEGER DEFAULT 0;
ALTER TABLE user_referrals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

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

ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'USD';
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS gateway VARCHAR(50) DEFAULT 'upi';
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS payment_gateway VARCHAR(50);
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS code VARCHAR(100);
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS transaction_code VARCHAR(100);
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PENDING';
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

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
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS sms_code VARCHAR(50);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS raw_response JSONB DEFAULT '{}'::jsonb;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS provider_name VARCHAR(100);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS service_type VARCHAR(50);

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
