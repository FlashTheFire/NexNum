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
ALTER TABLE user_referrals ADD COLUMN IF NOT EXISTS referrer_id VARCHAR(255);
ALTER TABLE user_referrals ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50);
ALTER TABLE user_referrals ADD COLUMN IF NOT EXISTS total_earnings NUMERIC(12,2) DEFAULT 0.0;
ALTER TABLE user_referrals ADD COLUMN IF NOT EXISTS total_referred_count INTEGER DEFAULT 0;
ALTER TABLE user_referrals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE user_referrals ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_user_referrals_referrer_id
    ON user_referrals (referrer_id);

-- ---------------------------------------------------------------------------
-- 3. DEPOSIT REQUESTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deposit_requests (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        VARCHAR(255) NOT NULL,
    gateway        VARCHAR(50)  NOT NULL,
    amount         NUMERIC(12,2) NOT NULL,
    currency       VARCHAR(10)  DEFAULT 'INR',
    status         VARCHAR(50)  DEFAULT 'PENDING',
    payment_url    TEXT,
    tx_hash        VARCHAR(255),
    gateway_id     VARCHAR(255),
    qr_code        TEXT,
    meta_data      JSONB        DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ  DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS payment_url TEXT;
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(255);
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS gateway_id VARCHAR(255);
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS qr_code TEXT;
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS meta_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE deposit_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_deposit_requests_user_id
    ON deposit_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_status
    ON deposit_requests (status);

-- ---------------------------------------------------------------------------
-- 4. SUPPORT TICKETS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_tickets (
    ticket_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     VARCHAR(255) NOT NULL,
    subject     VARCHAR(255),
    category    VARCHAR(50)  DEFAULT 'general',
    status      VARCHAR(50)  DEFAULT 'OPEN',
    priority    VARCHAR(50)  DEFAULT 'medium',
    messages    JSONB        DEFAULT '[]'::jsonb,
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW(),
    closed_at   TIMESTAMPTZ
);

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'general';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'medium';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id
    ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
    ON support_tickets (status);

-- ---------------------------------------------------------------------------
-- 5. BOT CONFIG / SYSTEM PARAMS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot_config (
    key        VARCHAR(100) PRIMARY KEY,
    value      JSONB        NOT NULL,
    updated_at TIMESTAMPTZ  DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 6. ACCOUNT LINK TOKENS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_link_tokens (
    token       VARCHAR(64) PRIMARY KEY,
    telegram_id VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_account_link_tokens_expires_at
    ON account_link_tokens (expires_at);

-- ---------------------------------------------------------------------------
-- 7. BROADCAST HISTORY
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS broadcast_history (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id     VARCHAR(255) NOT NULL,
    message_text TEXT NOT NULL,
    sent_count   INTEGER DEFAULT 0,
    fail_count   INTEGER DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 8. UNIFIED USER DASHBOARD VIEW
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_user_financial_summary AS
SELECT 
    u.id AS user_id,
    u.telegram_id,
    u.created_at AS user_joined_at,
    COALESCE(w.balance, 0.0) AS wallet_balance,
    COALESCE(COUNT(DISTINCT po.id), 0) AS total_orders_placed,
    COALESCE(SUM(CASE WHEN po.status = 'COMPLETED' THEN po.amount ELSE 0 END), 0.0) AS total_spent,
    COALESCE(COUNT(DISTINCT dr.id), 0) AS total_deposits_count,
    COALESCE(SUM(CASE WHEN dr.status = 'COMPLETED' THEN dr.amount ELSE 0 END), 0.0) AS total_deposited
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
