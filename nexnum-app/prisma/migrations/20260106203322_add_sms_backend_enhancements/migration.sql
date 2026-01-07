-- AlterTable
ALTER TABLE "sms_messages" ADD COLUMN     "confidence" DECIMAL(3,2),
ADD COLUMN     "extracted_code" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "raw_payload" JSONB;

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

-- CreateIndex
CREATE INDEX "provider_health_logs_provider_id_checked_at_idx" ON "provider_health_logs"("provider_id", "checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_idempotency_key_key" ON "webhook_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "webhook_events_provider_created_at_idx" ON "webhook_events"("provider", "created_at");

-- CreateIndex
CREATE INDEX "webhook_events_processed_idx" ON "webhook_events"("processed");

-- CreateIndex
CREATE INDEX "sms_messages_provider_idx" ON "sms_messages"("provider");

-- AddForeignKey
ALTER TABLE "provider_health_logs" ADD CONSTRAINT "provider_health_logs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
