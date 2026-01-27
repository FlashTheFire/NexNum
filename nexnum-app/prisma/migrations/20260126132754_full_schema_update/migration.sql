/*
  Warnings:

  - The primary key for the `country_lookups` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `code` on the `country_lookups` table. All the data in the column will be lost.
  - You are about to drop the column `pricing_id` on the `offer_reservations` table. All the data in the column will be lost.
  - You are about to drop the column `cached_countries` on the `providers` table. All the data in the column will be lost.
  - You are about to drop the column `cached_services` on the `providers` table. All the data in the column will be lost.
  - The primary key for the `service_lookups` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `code` on the `service_lookups` table. All the data in the column will be lost.
  - You are about to drop the `outbox_events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `provider_pricing` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[country_code]` on the table `country_lookups` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[service_code]` on the table `service_lookups` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[google_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `country_code` to the `country_lookups` table without a default value. This is not possible if the table is not empty.
  - Added the required column `id` to the `country_lookups` table without a default value. This is not possible if the table is not empty.
  - Added the required column `offer_id` to the `offer_reservations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `id` to the `service_lookups` table without a default value. This is not possible if the table is not empty.
  - Added the required column `service_code` to the `service_lookups` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ActivationState" AS ENUM ('INIT', 'RESERVED', 'ACTIVE', 'RECEIVED', 'EXPIRED', 'CANCELLED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ApiTier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- DropForeignKey
ALTER TABLE "offer_reservations" DROP CONSTRAINT "offer_reservations_pricing_id_fkey";

-- DropForeignKey
ALTER TABLE "provider_pricing" DROP CONSTRAINT "provider_pricing_country_id_fkey";

-- DropForeignKey
ALTER TABLE "provider_pricing" DROP CONSTRAINT "provider_pricing_provider_id_fkey";

-- DropForeignKey
ALTER TABLE "provider_pricing" DROP CONSTRAINT "provider_pricing_service_id_fkey";

-- DropIndex
DROP INDEX "offer_reservations_pricing_id_idx";

-- AlterTable
ALTER TABLE "country_lookups" DROP CONSTRAINT "country_lookups_pkey",
DROP COLUMN "code",
ADD COLUMN     "country_code" TEXT NOT NULL,
ADD COLUMN     "id" INTEGER NOT NULL,
ADD CONSTRAINT "country_lookups_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "numbers" ADD COLUMN     "country_icon_url" TEXT,
ADD COLUMN     "error_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "last_polled_at" TIMESTAMP(3),
ADD COLUMN     "next_poll_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "phone_country_code" TEXT,
ADD COLUMN     "phone_national_number" TEXT,
ADD COLUMN     "poll_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "profit" DECIMAL(8,4) NOT NULL DEFAULT 0.0,
ADD COLUMN     "provider_cost" DECIMAL(8,4) NOT NULL DEFAULT 0.0,
ADD COLUMN     "service_icon_url" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "offer_reservations" DROP COLUMN "pricing_id",
ADD COLUMN     "offer_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "providers" DROP COLUMN "cached_countries",
DROP COLUMN "cached_services",
ADD COLUMN     "api_pair" TEXT,
ADD COLUMN     "deposit_currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "deposit_received" DECIMAL(18,8),
ADD COLUMN     "deposit_spent" DECIMAL(18,8),
ADD COLUMN     "normalization_mode" TEXT NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "normalization_rate" DECIMAL(18,8);

-- AlterTable
ALTER TABLE "service_lookups" DROP CONSTRAINT "service_lookups_pkey",
DROP COLUMN "code",
ADD COLUMN     "id" INTEGER NOT NULL,
ADD COLUMN     "service_code" TEXT NOT NULL,
ADD CONSTRAINT "service_lookups_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified" TIMESTAMP(3),
ADD COLUMN     "google_id" TEXT,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "preferred_currency" TEXT,
ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "twoFactorBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorSecret" TEXT;

-- AlterTable
ALTER TABLE "wallet_transactions" ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN     "balance" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "reserved" DECIMAL(12,2) NOT NULL DEFAULT 0.00;

-- DropTable
DROP TABLE "outbox_events";

-- DropTable
DROP TABLE "provider_pricing";

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sms_received" BOOLEAN NOT NULL DEFAULT true,
    "promotions" BOOLEAN NOT NULL DEFAULT true,
    "billing" BOOLEAN NOT NULL DEFAULT true,
    "security" BOOLEAN NOT NULL DEFAULT true,
    "system" BOOLEAN NOT NULL DEFAULT true,
    "sound_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "country_name" TEXT NOT NULL,
    "amount" DECIMAL(8,2) NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT,
    "activation_id" TEXT,
    "idempotency_key" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events_v2" (
    "id" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "error" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_events_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "state" "ActivationState" NOT NULL DEFAULT 'RESERVED',
    "price" DECIMAL(8,2) NOT NULL,
    "provider_cost" DECIMAL(8,4) NOT NULL DEFAULT 0.0,
    "profit" DECIMAL(8,4) NOT NULL DEFAULT 0.0,
    "reserved_tx_id" TEXT,
    "captured_tx_id" TEXT,
    "refund_tx_id" TEXT,
    "provider_activation_id" TEXT,
    "provider_id" TEXT,
    "service_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "country_name" TEXT,
    "operator_id" TEXT,
    "phone_number" TEXT,
    "expires_at" TIMESTAMP(3),
    "number_id" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_events" (
    "id" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "activation_id" TEXT,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "rate" DECIMAL(10,4) NOT NULL,
    "is_base" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "auto_update" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "base_currency" TEXT NOT NULL DEFAULT 'USD',
    "display_currency" TEXT NOT NULL DEFAULT 'USD',
    "points_enabled" BOOLEAN NOT NULL DEFAULT false,
    "points_name" TEXT NOT NULL DEFAULT 'Points',
    "points_rate" DECIMAL(65,30) NOT NULL DEFAULT 100.0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "permissions" TEXT[],
    "tier" "ApiTier" NOT NULL DEFAULT 'FREE',
    "rate_limit" INTEGER NOT NULL DEFAULT 60,
    "usage_count" BIGINT NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "last_used_ip" TEXT,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "ip_whitelist" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "last_tried_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "response_code" INTEGER,
    "response_body" TEXT,
    "duration_ms" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banned_icons" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banned_icons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_idx" ON "notifications"("user_id", "read");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_idempotency_key_key" ON "purchase_orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "purchase_orders_status_expires_at_idx" ON "purchase_orders"("status", "expires_at");

-- CreateIndex
CREATE INDEX "purchase_orders_user_id_idx" ON "purchase_orders"("user_id");

-- CreateIndex
CREATE INDEX "outbox_events_v2_status_created_at_idx" ON "outbox_events_v2"("status", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_v2_aggregate_type_aggregate_id_idx" ON "outbox_events_v2"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE UNIQUE INDEX "activations_number_id_key" ON "activations"("number_id");

-- CreateIndex
CREATE UNIQUE INDEX "activations_idempotency_key_key" ON "activations"("idempotency_key");

-- CreateIndex
CREATE INDEX "activations_user_id_idx" ON "activations"("user_id");

-- CreateIndex
CREATE INDEX "activations_state_idx" ON "activations"("state");

-- CreateIndex
CREATE INDEX "activations_state_created_at_idx" ON "activations"("state", "created_at");

-- CreateIndex
CREATE INDEX "activations_provider_id_idx" ON "activations"("provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_events_provider_event_id_key" ON "provider_events"("provider_event_id");

-- CreateIndex
CREATE INDEX "provider_events_activation_id_idx" ON "provider_events"("activation_id");

-- CreateIndex
CREATE INDEX "provider_events_processed_idx" ON "provider_events"("processed");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_user_id_idx" ON "api_keys"("user_id");

-- CreateIndex
CREATE INDEX "api_keys_prefix_idx" ON "api_keys"("prefix");

-- CreateIndex
CREATE INDEX "api_keys_is_active_idx" ON "api_keys"("is_active");

-- CreateIndex
CREATE INDEX "webhooks_user_id_idx" ON "webhooks"("user_id");

-- CreateIndex
CREATE INDEX "webhooks_is_active_idx" ON "webhooks"("is_active");

-- CreateIndex
CREATE INDEX "webhook_deliveries_webhook_id_idx" ON "webhook_deliveries"("webhook_id");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries"("status");

-- CreateIndex
CREATE INDEX "webhook_deliveries_next_retry_at_idx" ON "webhook_deliveries"("next_retry_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_key" ON "password_resets"("token");

-- CreateIndex
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

-- CreateIndex
CREATE INDEX "password_resets_expires_at_idx" ON "password_resets"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE INDEX "email_verification_tokens_expires_at_idx" ON "email_verification_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "banned_icons_hash_key" ON "banned_icons"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "country_lookups_country_code_key" ON "country_lookups"("country_code");

-- CreateIndex
CREATE INDEX "offer_reservations_offer_id_idx" ON "offer_reservations"("offer_id");

-- CreateIndex
CREATE INDEX "providers_is_active_priority_idx" ON "providers"("is_active", "priority");

-- CreateIndex
CREATE INDEX "service_aggregates_total_stock_idx" ON "service_aggregates"("total_stock");

-- CreateIndex
CREATE INDEX "service_aggregates_service_name_idx" ON "service_aggregates"("service_name");

-- CreateIndex
CREATE UNIQUE INDEX "service_lookups_service_code_key" ON "service_lookups"("service_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
