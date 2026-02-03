-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ActivationState" AS ENUM ('INIT', 'RESERVED', 'ACTIVE', 'RECEIVED', 'EXPIRED', 'CANCELLED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ApiTier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PROMO', 'GIFT', 'REFERRAL');

-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DEPLETED', 'DISABLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "google_id" TEXT,
    "github_id" TEXT,
    "twitter_id" TEXT,
    "discord_id" TEXT,
    "facebook_id" TEXT,
    "telegram_id" TEXT,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "email_verified" TIMESTAMP(3),
    "token_version" INTEGER NOT NULL DEFAULT 1,
    "preferred_currency" TEXT NOT NULL DEFAULT 'USD',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorBackupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

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
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "balance" DECIMAL(18,8) NOT NULL DEFAULT 0.00,
    "reserved" DECIMAL(18,8) NOT NULL DEFAULT 0.00,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "idempotency_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "numbers" (
    "id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "phone_country_code" TEXT,
    "phone_national_number" TEXT,
    "country_code" TEXT NOT NULL,
    "country_name" TEXT,
    "country_icon_url" TEXT,
    "service_name" TEXT,
    "service_code" TEXT,
    "service_icon_url" TEXT,
    "price" DECIMAL(8,2) NOT NULL,
    "provider_cost" DECIMAL(8,4) NOT NULL DEFAULT 0.0,
    "profit" DECIMAL(8,4) NOT NULL DEFAULT 0.0,
    "status" TEXT NOT NULL DEFAULT 'available',
    "owner_id" TEXT,
    "activation_id" TEXT,
    "provider" TEXT,
    "idempotency_key" TEXT,
    "expires_at" TIMESTAMP(3),
    "purchased_at" TIMESTAMP(3),
    "poll_count" INTEGER NOT NULL DEFAULT 0,
    "next_poll_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "last_polled_at" TIMESTAMP(3),
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),

    CONSTRAINT "numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" TEXT NOT NULL,
    "number_id" TEXT NOT NULL,
    "sender" TEXT,
    "content" TEXT,
    "code" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT,
    "raw_payload" JSONB,
    "extracted_code" TEXT,
    "confidence" DECIMAL(3,2),

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_lookups" (
    "id" INTEGER NOT NULL,
    "service_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon_url" TEXT,

    CONSTRAINT "service_lookups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "country_lookups" (
    "id" INTEGER NOT NULL,
    "country_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "flag_url" TEXT,

    CONSTRAINT "country_lookups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "logo_url" TEXT,
    "website_url" TEXT,
    "api_base_url" TEXT NOT NULL,
    "authType" TEXT NOT NULL DEFAULT 'bearer',
    "provider_type" TEXT NOT NULL DEFAULT 'rest',
    "auth_key" TEXT,
    "auth_header" TEXT,
    "auth_query_param" TEXT,
    "endpoints" JSONB NOT NULL,
    "mappings" JSONB NOT NULL,
    "price_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    "fixed_markup" DECIMAL(18,8) NOT NULL DEFAULT 0.0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "normalization_mode" TEXT NOT NULL DEFAULT 'AUTO',
    "normalization_rate" DECIMAL(18,8),
    "api_pair" TEXT,
    "deposit_spent" DECIMAL(18,8),
    "deposit_received" DECIMAL(18,8),
    "deposit_currency" TEXT NOT NULL DEFAULT 'USD',
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "low_balance_alert" DECIMAL(10,2) NOT NULL DEFAULT 10.0,
    "last_balance_sync" TIMESTAMP(3),
    "success_rate" DECIMAL(5,2) NOT NULL DEFAULT 100.0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "use_global_sync" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "last_sync_at" TIMESTAMP(3),
    "sync_status" TEXT,
    "sync_count" INTEGER NOT NULL DEFAULT 0,
    "last_metadata_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_countries" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "flag_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_services" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_test_results" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "http_status" INTEGER,
    "response_time" INTEGER,
    "request_url" TEXT,
    "response_data" TEXT,
    "error" TEXT,
    "tested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_health_logs" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "successRate" DECIMAL(5,2) NOT NULL,
    "avgLatency" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_health_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "offer_reservations" (
    "id" TEXT NOT NULL,
    "offer_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT,
    "provider_reservation_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "offer_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_aggregates" (
    "id" TEXT NOT NULL,
    "service_code" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "lowest_price" DECIMAL(8,2) NOT NULL,
    "total_stock" BIGINT NOT NULL,
    "country_count" INTEGER NOT NULL,
    "provider_count" INTEGER NOT NULL,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "state" "ActivationState" NOT NULL DEFAULT 'RESERVED',
    "price" DECIMAL(18,8) NOT NULL,
    "provider_cost" DECIMAL(18,8) NOT NULL DEFAULT 0.0,
    "profit" DECIMAL(18,8) NOT NULL DEFAULT 0.0,
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
    "trace_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activation_state_history" (
    "id" TEXT NOT NULL,
    "activation_id" TEXT NOT NULL,
    "state" "ActivationState" NOT NULL,
    "previous_state" "ActivationState",
    "reason" TEXT,
    "metadata" JSONB,
    "trace_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_state_history_pkey" PRIMARY KEY ("id")
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
    "payments_enabled" BOOLEAN NOT NULL DEFAULT false,
    "upi_provider_mode" TEXT NOT NULL DEFAULT 'DISABLED',
    "upi_api_token" TEXT,
    "upi_create_order_url" TEXT,
    "upi_check_status_url" TEXT,
    "upi_qr_base_url" TEXT,
    "paytm_merchant_id" TEXT,
    "paytm_merchant_key" TEXT,
    "paytm_website" TEXT,
    "paytm_industry_type" TEXT,
    "paytm_channel_id" TEXT,
    "paytm_callback_url" TEXT,
    "paytm_environment" TEXT NOT NULL DEFAULT 'STAGING',
    "deposit_min_amount" DECIMAL(10,2) NOT NULL DEFAULT 10,
    "deposit_max_amount" DECIMAL(10,2) NOT NULL DEFAULT 50000,
    "deposit_timeout_mins" INTEGER NOT NULL DEFAULT 30,
    "max_pending_deposits" INTEGER NOT NULL DEFAULT 3,
    "deposit_bonus_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
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
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "status" "CouponStatus" NOT NULL DEFAULT 'ACTIVE',
    "discountType" TEXT,
    "discountValue" DECIMAL(10,2),
    "giftAmount" DECIMAL(10,2),
    "maxDiscount" DECIMAL(10,2),
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "maxUsesPerUser" INTEGER NOT NULL DEFAULT 1,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "minDepositAmount" DECIMAL(10,2),
    "validServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "newUsersOnly" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "referrer_id" TEXT,
    "referralBonus" DECIMAL(10,2),
    "name" TEXT,
    "description" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_redemptions" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "deposit_id" TEXT,
    "appliedAmount" DECIMAL(10,2) NOT NULL,
    "originalAmount" DECIMAL(10,2),
    "finalAmount" DECIMAL(10,2),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "device_fingerprint" TEXT,
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_github_id_key" ON "users"("github_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_twitter_id_key" ON "users"("twitter_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_discord_id_key" ON "users"("discord_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_facebook_id_key" ON "users"("facebook_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

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
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_idempotency_key_key" ON "purchase_orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "purchase_orders_status_expires_at_idx" ON "purchase_orders"("status", "expires_at");

-- CreateIndex
CREATE INDEX "purchase_orders_user_id_idx" ON "purchase_orders"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "numbers_idempotency_key_key" ON "numbers"("idempotency_key");

-- CreateIndex
CREATE INDEX "numbers_owner_id_idx" ON "numbers"("owner_id");

-- CreateIndex
CREATE INDEX "numbers_status_idx" ON "numbers"("status");

-- CreateIndex
CREATE INDEX "numbers_status_created_at_idx" ON "numbers"("status", "created_at");

-- CreateIndex
CREATE INDEX "numbers_owner_id_status_idx" ON "numbers"("owner_id", "status");

-- CreateIndex
CREATE INDEX "numbers_provider_status_idx" ON "numbers"("provider", "status");

-- CreateIndex
CREATE INDEX "numbers_expires_at_idx" ON "numbers"("expires_at");

-- CreateIndex
CREATE INDEX "sms_messages_number_id_idx" ON "sms_messages"("number_id");

-- CreateIndex
CREATE INDEX "sms_messages_provider_idx" ON "sms_messages"("provider");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "service_lookups_service_code_key" ON "service_lookups"("service_code");

-- CreateIndex
CREATE UNIQUE INDEX "country_lookups_country_code_key" ON "country_lookups"("country_code");

-- CreateIndex
CREATE UNIQUE INDEX "providers_name_key" ON "providers"("name");

-- CreateIndex
CREATE INDEX "providers_is_active_priority_idx" ON "providers"("isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "provider_countries_provider_id_external_id_key" ON "provider_countries"("provider_id", "external_id");

-- CreateIndex
CREATE INDEX "provider_countries_provider_id_idx" ON "provider_countries"("provider_id");

-- CreateIndex
CREATE INDEX "provider_countries_code_idx" ON "provider_countries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "provider_services_provider_id_external_id_key" ON "provider_services"("provider_id", "external_id");

-- CreateIndex
CREATE INDEX "provider_services_provider_id_idx" ON "provider_services"("provider_id");

-- CreateIndex
CREATE INDEX "provider_services_code_idx" ON "provider_services"("code");

-- CreateIndex
CREATE INDEX "provider_test_results_provider_id_idx" ON "provider_test_results"("provider_id");

-- CreateIndex
CREATE INDEX "provider_health_logs_provider_id_checked_at_idx" ON "provider_health_logs"("provider_id", "checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_idempotency_key_key" ON "webhook_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "webhook_events_provider_created_at_idx" ON "webhook_events"("provider", "created_at");

-- CreateIndex
CREATE INDEX "webhook_events_processed_idx" ON "webhook_events"("processed");

-- CreateIndex
CREATE INDEX "outbox_events_v2_status_created_at_idx" ON "outbox_events_v2"("status", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_v2_aggregate_type_aggregate_id_idx" ON "outbox_events_v2"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE UNIQUE INDEX "offer_reservations_idempotency_key_key" ON "offer_reservations"("idempotency_key");

-- CreateIndex
CREATE INDEX "offer_reservations_user_id_idx" ON "offer_reservations"("user_id");

-- CreateIndex
CREATE INDEX "offer_reservations_offer_id_idx" ON "offer_reservations"("offer_id");

-- CreateIndex
CREATE INDEX "offer_reservations_status_expires_at_idx" ON "offer_reservations"("status", "expires_at");

-- CreateIndex
CREATE INDEX "service_aggregates_total_stock_idx" ON "service_aggregates"("total_stock");

-- CreateIndex
CREATE INDEX "service_aggregates_service_name_idx" ON "service_aggregates"("service_name");

-- CreateIndex
CREATE UNIQUE INDEX "activations_number_id_key" ON "activations"("number_id");

-- CreateIndex
CREATE UNIQUE INDEX "activations_idempotency_key_key" ON "activations"("idempotency_key");

-- CreateIndex
CREATE INDEX "activations_user_id_state_idx" ON "activations"("user_id", "state");

-- CreateIndex
CREATE INDEX "activations_state_expires_at_idx" ON "activations"("state", "expires_at");

-- CreateIndex
CREATE INDEX "activations_state_created_at_idx" ON "activations"("state", "created_at");

-- CreateIndex
CREATE INDEX "activations_provider_id_state_idx" ON "activations"("provider_id", "state");

-- CreateIndex
CREATE INDEX "activation_state_history_activation_id_idx" ON "activation_state_history"("activation_id");

-- CreateIndex
CREATE INDEX "activation_state_history_created_at_idx" ON "activation_state_history"("created_at");

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
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_code_idx" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_type_status_idx" ON "coupons"("type", "status");

-- CreateIndex
CREATE INDEX "coupons_referrer_id_idx" ON "coupons"("referrer_id");

-- CreateIndex
CREATE INDEX "coupons_expiresAt_idx" ON "coupons"("expiresAt");

-- CreateIndex
CREATE INDEX "coupon_redemptions_user_id_idx" ON "coupon_redemptions"("user_id");

-- CreateIndex
CREATE INDEX "coupon_redemptions_coupon_id_idx" ON "coupon_redemptions"("coupon_id");

-- CreateIndex
CREATE INDEX "coupon_redemptions_redeemed_at_idx" ON "coupon_redemptions"("redeemed_at");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_redemptions_coupon_id_user_id_deposit_id_key" ON "coupon_redemptions"("coupon_id", "user_id", "deposit_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "numbers" ADD CONSTRAINT "numbers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_number_id_fkey" FOREIGN KEY ("number_id") REFERENCES "numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_countries" ADD CONSTRAINT "provider_countries_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_services" ADD CONSTRAINT "provider_services_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_test_results" ADD CONSTRAINT "provider_test_results_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_health_logs" ADD CONSTRAINT "provider_health_logs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_reservations" ADD CONSTRAINT "offer_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activations" ADD CONSTRAINT "activations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_state_history" ADD CONSTRAINT "activation_state_history_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "activations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
