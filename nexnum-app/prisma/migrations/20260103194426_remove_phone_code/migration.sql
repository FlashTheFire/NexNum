-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "is_banned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "numbers" (
    "id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "country_name" TEXT,
    "service_name" TEXT,
    "service_code" TEXT,
    "price" DECIMAL(8,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'available',
    "owner_id" TEXT,
    "activation_id" TEXT,
    "provider" TEXT,
    "idempotency_key" TEXT,
    "expires_at" TIMESTAMP(3),
    "purchased_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

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
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon_url" TEXT,

    CONSTRAINT "service_lookups_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "country_lookups" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "flag_url" TEXT,

    CONSTRAINT "country_lookups_pkey" PRIMARY KEY ("code")
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
    "fixed_markup" DECIMAL(8,2) NOT NULL DEFAULT 0.0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "low_balance_alert" DECIMAL(10,2) NOT NULL DEFAULT 10.0,
    "last_balance_sync" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "last_sync_at" TIMESTAMP(3),
    "sync_status" TEXT,
    "sync_count" INTEGER NOT NULL DEFAULT 0,
    "last_metadata_sync_at" TIMESTAMP(3),
    "cached_countries" JSONB,
    "cached_services" JSONB,
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
CREATE TABLE "provider_pricing" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "country_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "operator" TEXT,
    "cost" DECIMAL(8,4) NOT NULL,
    "provider_raw_cost" DECIMAL(8,6),
    "sellPrice" DECIMAL(8,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "last_sync_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_pricing_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "outbox_events" (
    "id" BIGSERIAL NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_reservations" (
    "id" TEXT NOT NULL,
    "pricing_id" TEXT NOT NULL,
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

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_idx" ON "wallet_transactions"("wallet_id");

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
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "providers_name_key" ON "providers"("name");

-- CreateIndex
CREATE INDEX "providers_is_active_idx" ON "providers"("is_active");

-- CreateIndex
CREATE INDEX "providers_priority_idx" ON "providers"("priority");

-- CreateIndex
CREATE INDEX "provider_countries_provider_id_idx" ON "provider_countries"("provider_id");

-- CreateIndex
CREATE INDEX "provider_countries_code_idx" ON "provider_countries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "provider_countries_provider_id_external_id_key" ON "provider_countries"("provider_id", "external_id");

-- CreateIndex
CREATE INDEX "provider_services_provider_id_idx" ON "provider_services"("provider_id");

-- CreateIndex
CREATE INDEX "provider_services_code_idx" ON "provider_services"("code");

-- CreateIndex
CREATE UNIQUE INDEX "provider_services_provider_id_external_id_key" ON "provider_services"("provider_id", "external_id");

-- CreateIndex
CREATE INDEX "provider_pricing_provider_id_idx" ON "provider_pricing"("provider_id");

-- CreateIndex
CREATE INDEX "provider_pricing_country_id_idx" ON "provider_pricing"("country_id");

-- CreateIndex
CREATE INDEX "provider_pricing_service_id_idx" ON "provider_pricing"("service_id");

-- CreateIndex
CREATE INDEX "provider_pricing_sellPrice_idx" ON "provider_pricing"("sellPrice");

-- CreateIndex
CREATE INDEX "provider_pricing_stock_idx" ON "provider_pricing"("stock");

-- CreateIndex
CREATE UNIQUE INDEX "provider_pricing_provider_id_country_id_service_id_operator_key" ON "provider_pricing"("provider_id", "country_id", "service_id", "operator");

-- CreateIndex
CREATE INDEX "provider_test_results_provider_id_idx" ON "provider_test_results"("provider_id");

-- CreateIndex
CREATE INDEX "outbox_events_processed_created_at_idx" ON "outbox_events"("processed", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE UNIQUE INDEX "offer_reservations_idempotency_key_key" ON "offer_reservations"("idempotency_key");

-- CreateIndex
CREATE INDEX "offer_reservations_user_id_idx" ON "offer_reservations"("user_id");

-- CreateIndex
CREATE INDEX "offer_reservations_pricing_id_idx" ON "offer_reservations"("pricing_id");

-- CreateIndex
CREATE INDEX "offer_reservations_status_expires_at_idx" ON "offer_reservations"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "service_aggregates_service_code_key" ON "service_aggregates"("service_code");

-- CreateIndex
CREATE INDEX "service_aggregates_lowest_price_idx" ON "service_aggregates"("lowest_price");

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "provider_pricing" ADD CONSTRAINT "provider_pricing_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_pricing" ADD CONSTRAINT "provider_pricing_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "provider_countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_pricing" ADD CONSTRAINT "provider_pricing_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "provider_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_test_results" ADD CONSTRAINT "provider_test_results_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_reservations" ADD CONSTRAINT "offer_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_reservations" ADD CONSTRAINT "offer_reservations_pricing_id_fkey" FOREIGN KEY ("pricing_id") REFERENCES "provider_pricing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
