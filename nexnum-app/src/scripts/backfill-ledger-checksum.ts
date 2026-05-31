/**
 * Sentinel Ledger Checksum — Backfill Script
 *
 * Purpose
 * ───────
 * After the Phase 1 migration adds `ledger_checksum` and `ledger_checksum_at`
 * to the `wallets` table (with DEFAULT 0 / NOW()), existing wallet rows have
 * a checksum of 0 and a checkpoint timestamp of their creation time (or NOW).
 *
 * This means the sentinel will try to sum ALL historical transactions on the
 * next verifyIntegrity call, which defeats the Phase 1 O(k) optimisation.
 *
 * This script performs a safe, idempotent, batched backfill:
 *   1. For each wallet: compute SUM(wallet_transactions.amount) for all rows.
 *   2. Write that sum into ledger_checksum.
 *   3. Set ledger_checksum_at = NOW() so the hot-window starts empty.
 *
 * Safety design
 * ─────────────
 * - Processes wallets in batches of 100 to avoid overwhelming the DB.
 * - Idempotent: re-running the script is safe (it simply re-computes the
 *   running sum from the full history, which is correct).
 * - Logs progress and any per-wallet errors without stopping the batch.
 * - Exits with code 1 if more than ALLOWED_ERROR_RATE (5%) of wallets fail.
 *
 * Usage
 * ─────
 *   npx tsx src/scripts/backfill-ledger-checksum.ts
 *
 * Run this exactly once after deploying the Phase 1 migration.
 * Safe to run in production during low-traffic windows; it uses read
 * committed isolation and does not lock rows for extended periods.
 */

import { prisma } from '../lib/core/db'
import { PrismaClient, Prisma } from '@prisma/client'

const BATCH_SIZE = 100
const ALLOWED_ERROR_RATE = 0.05 // 5%

export async function backfill(client: PrismaClient = prisma): Promise<void> {
    console.log('[Backfill] Starting ledger checksum backfill…')

    // 1. Count total wallets
    const totalWallets = await client.wallet.count()
    console.log(`[Backfill] Total wallets to process: ${totalWallets}`)

    if (totalWallets === 0) {
        console.log('[Backfill] Nothing to do — no wallets found.')
        return
    }

    let processed = 0
    let errored = 0
    let cursor: string | undefined = undefined
    const checkpointAt = new Date()

    while (processed + errored < totalWallets) {
        // 2. Fetch next batch of wallet IDs
        const batch: { id: string }[] = await client.wallet.findMany({
            select: { id: true },
            take: BATCH_SIZE,
            skip: cursor ? 1 : 0,
            cursor: cursor ? { id: cursor } : undefined,
            orderBy: { id: 'asc' },
        })

        if (batch.length === 0) break

        cursor = batch[batch.length - 1].id

        // 3. Process each wallet in the batch
        await Promise.allSettled(
            batch.map(async ({ id: walletId }: { id: string }) => {
                try {
                    // Sum ALL historical transactions for this wallet
                    const agg = await client.walletTransaction.aggregate({
                        where: { walletId },
                        _sum: { amount: true },
                    })

                    const checksum = agg._sum.amount ?? new Prisma.Decimal(0)

                    // Atomically write checksum + advance checkpoint timestamp
                    await client.wallet.update({
                        where: { id: walletId },
                        data: {
                            ledgerChecksum: checksum,
                            ledgerChecksumAt: checkpointAt,
                        },
                    })

                    processed++
                } catch (err) {
                    errored++
                    console.error(`[Backfill] ERROR processing wallet ${walletId}:`, (err as Error).message)
                }
            })
        )

        const pct = (((processed + errored) / totalWallets) * 100).toFixed(1)
        console.log(`[Backfill] Progress: ${processed + errored}/${totalWallets} (${pct}%) — ${errored} errors`)
    }

    // 4. Summary
    const errorRate = errored / totalWallets
    console.log('\n[Backfill] ─── Summary ───────────────────────────────────')
    console.log(`  Total:     ${totalWallets}`)
    console.log(`  Processed: ${processed}`)
    console.log(`  Errored:   ${errored}`)
    console.log(`  Error rate: ${(errorRate * 100).toFixed(2)}%`)

    if (errorRate > ALLOWED_ERROR_RATE) {
        console.error(`[Backfill] ERROR RATE (${(errorRate * 100).toFixed(2)}%) exceeds threshold (${ALLOWED_ERROR_RATE * 100}%). Investigation required.`)
        process.exit(1)
    }

    if (errored === 0) {
        console.log('[Backfill] ✅ Backfill completed successfully.')
    } else {
        console.warn(`[Backfill] ⚠️  Completed with ${errored} errors. Check logs and re-run to retry failed wallets.`)
    }
}

if (!process.env.VITEST) {
    backfill()
        .catch((err) => {
            console.error('[Backfill] Fatal error:', err)
            process.exit(1)
        })
        .finally(() => prisma.$disconnect())
}
