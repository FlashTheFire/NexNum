/*
  Warnings:

  - You are about to drop the column `isActive` on the `providers` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[service_code]` on the table `service_aggregates` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "activations" DROP CONSTRAINT "activations_user_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";

-- DropIndex
DROP INDEX "providers_is_active_priority_idx";

-- AlterTable
CREATE SEQUENCE country_lookups_id_seq;
ALTER TABLE "country_lookups" ALTER COLUMN "id" SET DEFAULT nextval('country_lookups_id_seq');
ALTER SEQUENCE country_lookups_id_seq OWNED BY "country_lookups"."id";

-- AlterTable
ALTER TABLE "providers" DROP COLUMN "isActive",
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sync_buffer_percent" DECIMAL(5,2) NOT NULL DEFAULT 0.0;

-- AlterTable
CREATE SEQUENCE service_lookups_id_seq;
ALTER TABLE "service_lookups" ALTER COLUMN "id" SET DEFAULT nextval('service_lookups_id_seq');
ALTER SEQUENCE service_lookups_id_seq OWNED BY "service_lookups"."id";

-- AlterTable
ALTER TABLE "system_settings" ADD COLUMN     "captcha_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "crypto_api_base_url" TEXT,
ADD COLUMN     "crypto_api_token" TEXT,
ADD COLUMN     "crypto_provider_mode" TEXT NOT NULL DEFAULT 'DISABLED',
ADD COLUMN     "crypto_usdt_bep20_address" TEXT,
ADD COLUMN     "crypto_usdt_trx_address" TEXT,
ADD COLUMN     "crypto_webhook_secret" TEXT,
ADD COLUMN     "email_from" TEXT,
ADD COLUMN     "heartbeat_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "heartbeat_interval_mins" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "heartbeat_last_run_at" TIMESTAMP(3),
ADD COLUMN     "inr_to_usd_rate" DECIMAL(10,4) NOT NULL DEFAULT 96.28,
ADD COLUMN     "rates_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "smtp_host" TEXT,
ADD COLUMN     "smtp_pass" TEXT,
ADD COLUMN     "smtp_port" INTEGER,
ADD COLUMN     "smtp_user" TEXT,
ADD COLUMN     "sync_buffer_percent" DECIMAL(5,2) NOT NULL DEFAULT 2.0;

-- AlterTable
ALTER TABLE "wallet_transactions" ADD COLUMN     "currency_snapshot" JSONB;

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN     "balance_snapshot" JSONB;

-- CreateTable
CREATE TABLE "banned_icons" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banned_icons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_attempts" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "verification_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banned_icons_hash_key" ON "banned_icons"("hash");

-- CreateIndex
CREATE INDEX "verification_attempts_token_idx" ON "verification_attempts"("token");

-- CreateIndex
CREATE INDEX "verification_attempts_ipAddress_idx" ON "verification_attempts"("ipAddress");

-- CreateIndex
CREATE INDEX "verification_attempts_ipAddress_attemptedAt_idx" ON "verification_attempts"("ipAddress", "attemptedAt");

-- CreateIndex
CREATE INDEX "verification_attempts_token_attemptedAt_idx" ON "verification_attempts"("token", "attemptedAt");

-- CreateIndex
CREATE INDEX "providers_is_active_idx" ON "providers"("is_active");

-- CreateIndex
CREATE INDEX "providers_priority_idx" ON "providers"("priority");

-- CreateIndex
CREATE INDEX "providers_is_active_priority_idx" ON "providers"("is_active", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "service_aggregates_service_code_key" ON "service_aggregates"("service_code");

-- CreateIndex
CREATE INDEX "service_aggregates_lowest_price_idx" ON "service_aggregates"("lowest_price");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_attempts" ADD CONSTRAINT "verification_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
