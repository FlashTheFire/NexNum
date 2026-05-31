-- Migration: add_wallet_ledger_checksum
-- Adds a checkpoint-based integrity verification system to the wallet.
--
-- Background:
--   The original FinancialSentinel aggregated ALL wallet_transactions rows on
--   every ledger event — O(N) complexity inside a Postgres FOR UPDATE lock.
--   For high-volume accounts this caused multi-second lock contention.
--
-- Solution:
--   `ledger_checksum`    — a running algebraic sum of all committed transaction
--                          amounts, maintained by WalletService after each event.
--   `ledger_checksum_at` — UTC timestamp of the last checkpoint write.
--
--   The Sentinel now only aggregates transactions AFTER `ledger_checksum_at`
--   (the "hot window") and adds that delta to `ledger_checksum`.
--   Complexity drops from O(N) to O(k), where k ≈ 1 in steady state.
--
-- Backfill note (run once after deploying):
--   UPDATE wallets w
--   SET    ledger_checksum    = COALESCE(
--              (SELECT SUM(amount) FROM wallet_transactions WHERE wallet_id = w.id),
--              0
--          ),
--          ledger_checksum_at = NOW();

ALTER TABLE "wallets"
    ADD COLUMN IF NOT EXISTS "ledger_checksum"    DECIMAL(18, 8) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS "ledger_checksum_at" TIMESTAMP(3)   NOT NULL DEFAULT NOW();

-- Index to accelerate the hot-window aggregate (transactions after checkpoint).
-- The sentinel query is:
--   WHERE wallet_id = ? AND created_at > ?
-- The existing @@index([walletId, createdAt]) on wallet_transactions already
-- covers this perfectly — no additional index needed.
