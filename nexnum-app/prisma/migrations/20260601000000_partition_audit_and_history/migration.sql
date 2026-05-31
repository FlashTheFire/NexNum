-- Rename existing tables
ALTER TABLE "audit_logs" RENAME TO "audit_logs_old";
ALTER TABLE "activation_state_history" RENAME TO "activation_state_history_old";

-- Remove foreign keys and constraints on old tables to avoid conflicts during recreation
ALTER TABLE "audit_logs_old" DROP CONSTRAINT IF EXISTS "audit_logs_user_id_fkey";
ALTER TABLE "activation_state_history_old" DROP CONSTRAINT IF EXISTS "activation_state_history_activation_id_fkey";
ALTER TABLE "audit_logs_old" DROP CONSTRAINT IF EXISTS "audit_logs_pkey";
ALTER TABLE "activation_state_history_old" DROP CONSTRAINT IF EXISTS "activation_state_history_pkey";

-- Remove old indexes to prevent name conflicts during recreation
DROP INDEX IF EXISTS "audit_logs_user_id_idx";
DROP INDEX IF EXISTS "audit_logs_action_idx";
DROP INDEX IF EXISTS "activation_state_history_activation_id_idx";
DROP INDEX IF EXISTS "activation_state_history_created_at_idx";

-- Recreate parent partitioned tables
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id", "created_at"),
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
) PARTITION BY RANGE (created_at);

CREATE TABLE "activation_state_history" (
    "id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "state" "ActivationState" NOT NULL,
    "previous_state" "ActivationState",
    "reason" TEXT,
    "metadata" JSONB,
    "trace_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_state_history_pkey" PRIMARY KEY ("id", "created_at"),
    CONSTRAINT "activation_state_history_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "activations"("id") ON DELETE CASCADE ON UPDATE CASCADE
) PARTITION BY RANGE (created_at);

-- Create default partitions
CREATE TABLE "audit_logs_default" PARTITION OF "audit_logs" DEFAULT;
CREATE TABLE "activation_state_history_default" PARTITION OF "activation_state_history" DEFAULT;

-- Create pre-provisioned monthly partitions (May to Sept 2026)
CREATE TABLE "audit_logs_y2026m05" PARTITION OF "audit_logs" FOR VALUES FROM ('2026-05-01 00:00:00') TO ('2026-06-01 00:00:00');
CREATE TABLE "audit_logs_y2026m06" PARTITION OF "audit_logs" FOR VALUES FROM ('2026-06-01 00:00:00') TO ('2026-07-01 00:00:00');
CREATE TABLE "audit_logs_y2026m07" PARTITION OF "audit_logs" FOR VALUES FROM ('2026-07-01 00:00:00') TO ('2026-08-01 00:00:00');
CREATE TABLE "audit_logs_y2026m08" PARTITION OF "audit_logs" FOR VALUES FROM ('2026-08-01 00:00:00') TO ('2026-09-01 00:00:00');
CREATE TABLE "audit_logs_y2026m09" PARTITION OF "audit_logs" FOR VALUES FROM ('2026-09-01 00:00:00') TO ('2026-10-01 00:00:00');

CREATE TABLE "activation_state_history_y2026m05" PARTITION OF "activation_state_history" FOR VALUES FROM ('2026-05-01 00:00:00') TO ('2026-06-01 00:00:00');
CREATE TABLE "activation_state_history_y2026m06" PARTITION OF "activation_state_history" FOR VALUES FROM ('2026-06-01 00:00:00') TO ('2026-07-01 00:00:00');
CREATE TABLE "activation_state_history_y2026m07" PARTITION OF "activation_state_history" FOR VALUES FROM ('2026-07-01 00:00:00') TO ('2026-08-01 00:00:00');
CREATE TABLE "activation_state_history_y2026m08" PARTITION OF "activation_state_history" FOR VALUES FROM ('2026-08-01 00:00:00') TO ('2026-09-01 00:00:00');
CREATE TABLE "activation_state_history_y2026m09" PARTITION OF "activation_state_history" FOR VALUES FROM ('2026-09-01 00:00:00') TO ('2026-10-01 00:00:00');

-- Recreate indexes
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

CREATE INDEX "activation_state_history_activation_id_idx" ON "activation_state_history"("activation_id");
CREATE INDEX "activation_state_history_created_at_idx" ON "activation_state_history"("created_at");

-- Copy historical data
INSERT INTO "audit_logs" ("id", "user_id", "action", "resource_type", "resource_id", "metadata", "ip_address", "created_at")
SELECT "id", "user_id", "action", "resource_type", "resource_id", "metadata", "ip_address", "created_at" FROM "audit_logs_old";

INSERT INTO "activation_state_history" ("id", "activation_id", "state", "previous_state", "reason", "metadata", "trace_id", "created_at")
SELECT "id", "activation_id", "state", "previous_state", "reason", "metadata", "trace_id", "created_at" FROM "activation_state_history_old";

-- Drop old tables
DROP TABLE "audit_logs_old";
DROP TABLE "activation_state_history_old";
