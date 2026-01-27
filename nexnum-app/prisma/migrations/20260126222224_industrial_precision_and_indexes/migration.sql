-- DropIndex
DROP INDEX "activations_provider_id_idx";

-- DropIndex
DROP INDEX "activations_state_idx";

-- DropIndex
DROP INDEX "activations_user_id_idx";

-- DropIndex
DROP INDEX "wallet_transactions_wallet_id_idx";

-- AlterTable
ALTER TABLE "activations" ADD COLUMN     "trace_id" TEXT,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(18,8),
ALTER COLUMN "provider_cost" SET DATA TYPE DECIMAL(18,8),
ALTER COLUMN "profit" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "providers" ALTER COLUMN "fixed_markup" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "wallet_transactions" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,8);

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "balance" SET DATA TYPE DECIMAL(18,8),
ALTER COLUMN "reserved" SET DATA TYPE DECIMAL(18,8);

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

-- CreateIndex
CREATE INDEX "activation_state_history_activation_id_idx" ON "activation_state_history"("activation_id");

-- CreateIndex
CREATE INDEX "activation_state_history_created_at_idx" ON "activation_state_history"("created_at");

-- CreateIndex
CREATE INDEX "activations_user_id_state_idx" ON "activations"("user_id", "state");

-- CreateIndex
CREATE INDEX "activations_state_expires_at_idx" ON "activations"("state", "expires_at");

-- CreateIndex
CREATE INDEX "activations_provider_id_state_idx" ON "activations"("provider_id", "state");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");

-- AddForeignKey
ALTER TABLE "activation_state_history" ADD CONSTRAINT "activation_state_history_activation_id_fkey" FOREIGN KEY ("activation_id") REFERENCES "activations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
