-- AddColumn: purchase_orders.phone_number
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'phone_number') THEN
        ALTER TABLE "purchase_orders" ADD COLUMN "phone_number" TEXT;
    END IF;
END $$;

-- AddColumn: purchase_orders.sms_code
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'sms_code') THEN
        ALTER TABLE "purchase_orders" ADD COLUMN "sms_code" TEXT;
    END IF;
END $$;

-- AddColumn: purchase_orders.completed_at
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'completed_at') THEN
        ALTER TABLE "purchase_orders" ADD COLUMN "completed_at" TIMESTAMP(3);
    END IF;
END $$;

-- AddColumn: purchase_orders.retry_count
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'retry_count') THEN
        ALTER TABLE "purchase_orders" ADD COLUMN "retry_count" INTEGER DEFAULT 0;
    END IF;
END $$;

-- AddColumn: purchase_orders.raw_response
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_orders' AND column_name = 'raw_response') THEN
        ALTER TABLE "purchase_orders" ADD COLUMN "raw_response" JSONB;
    END IF;
END $$;

-- AddTable: deposit_requests (for Prisma DepositRequest model)
CREATE TABLE IF NOT EXISTS "deposit_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "gateway" TEXT DEFAULT 'upi',
    "payment_gateway" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "transaction_code" TEXT,
    "idempotency_key" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    CONSTRAINT "deposit_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "deposit_requests_idempotency_key_key" ON "deposit_requests"("idempotency_key");
CREATE INDEX IF NOT EXISTS "deposit_requests_user_id_created_at_idx" ON "deposit_requests"("user_id", "created_at");

-- AddTable: support_tickets (for Prisma SupportTicket model)
CREATE TABLE IF NOT EXISTS "support_tickets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ticket_type" TEXT DEFAULT 'general',
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "support_tickets_user_id_created_at_idx" ON "support_tickets"("user_id", "created_at");

-- AddTable: user_referrals (PK=user_id to match bot's ON CONFLICT (user_id))
CREATE TABLE IF NOT EXISTS "user_referrals" (
    "user_id" TEXT NOT NULL,
    "telegram_id" TEXT,
    "referral_code" TEXT,
    "referrer_id" TEXT,
    "total_earnings" DECIMAL(12,2) DEFAULT 0.0,
    "total_referred_count" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    CONSTRAINT "user_referrals_pkey" PRIMARY KEY ("user_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_referrals_referral_code_key" ON "user_referrals"("referral_code");
CREATE INDEX IF NOT EXISTS "user_referrals_referrer_id_idx" ON "user_referrals"("referrer_id");

-- AddTable: user_sessions (shared by Prisma UserSession model + Bot session queries)
CREATE TABLE IF NOT EXISTS "user_sessions" (
    "user_id" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "selected_country_id" INTEGER,
    "selected_service_code" VARCHAR(50),
    "menu_state" JSONB DEFAULT '{}'::jsonb,
    "temp_data" JSONB DEFAULT '{}'::jsonb,
    "last_activity" TIMESTAMPTZ DEFAULT NOW(),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "forum_id" INTEGER,
    "forum_message_id" INTEGER,
    "forum_archived" BOOLEAN DEFAULT FALSE,
    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("user_id")
);

CREATE INDEX IF NOT EXISTS "idx_user_sessions_last_activity" ON "user_sessions" ("last_activity");

-- AddTable: account_link_tokens (for Prisma AccountLinkToken model + bot link_via_code)
CREATE TABLE IF NOT EXISTS "account_link_tokens" (
    "token" VARCHAR(64) NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT "account_link_tokens_pkey" PRIMARY KEY ("token")
);

CREATE INDEX IF NOT EXISTS "idx_account_link_tokens_expires" ON "account_link_tokens" ("expires_at");

-- AddTable: operation_locks (bot advisory lock persistence)
CREATE TABLE IF NOT EXISTS "operation_locks" (
    "lock_key" VARCHAR(255) NOT NULL,
    "owner_id" VARCHAR(255) NOT NULL,
    "acquired_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expires_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "operation_locks_pkey" PRIMARY KEY ("lock_key")
);

CREATE INDEX IF NOT EXISTS "idx_operation_locks_expires" ON "operation_locks" ("expires_at");
