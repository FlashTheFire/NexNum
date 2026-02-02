-- Add Payment Gateway Configuration to system_settings
-- Migration: add_payment_gateway_settings

-- General Payment Settings
ALTER TABLE "system_settings" ADD COLUMN "payments_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "system_settings" ADD COLUMN "upi_provider_mode" TEXT NOT NULL DEFAULT 'DISABLED';

-- 3rd Party UPI Gateway Configuration
ALTER TABLE "system_settings" ADD COLUMN "upi_api_token" TEXT;
ALTER TABLE "system_settings" ADD COLUMN "upi_create_order_url" TEXT;
ALTER TABLE "system_settings" ADD COLUMN "upi_check_status_url" TEXT;
ALTER TABLE "system_settings" ADD COLUMN "upi_qr_base_url" TEXT;

-- Direct Paytm Integration (Future-Ready)
ALTER TABLE "system_settings" ADD COLUMN "paytm_merchant_id" TEXT;
ALTER TABLE "system_settings" ADD COLUMN "paytm_merchant_key" TEXT;
ALTER TABLE "system_settings" ADD COLUMN "paytm_website" TEXT;
ALTER TABLE "system_settings" ADD COLUMN "paytm_industry_type" TEXT;
ALTER TABLE "system_settings" ADD COLUMN "paytm_channel_id" TEXT;
ALTER TABLE "system_settings" ADD COLUMN "paytm_callback_url" TEXT;
ALTER TABLE "system_settings" ADD COLUMN "paytm_environment" TEXT NOT NULL DEFAULT 'STAGING';

-- Transaction Limits
ALTER TABLE "system_settings" ADD COLUMN "deposit_min_amount" DECIMAL(10,2) NOT NULL DEFAULT 10;
ALTER TABLE "system_settings" ADD COLUMN "deposit_max_amount" DECIMAL(10,2) NOT NULL DEFAULT 50000;
ALTER TABLE "system_settings" ADD COLUMN "deposit_timeout_mins" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "system_settings" ADD COLUMN "max_pending_deposits" INTEGER NOT NULL DEFAULT 3;

-- Deposit Bonus
ALTER TABLE "system_settings" ADD COLUMN "deposit_bonus_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;
