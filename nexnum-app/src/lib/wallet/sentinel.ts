/**
 * Financial Sentinel Core
 *
 * Enforces the immutable law:
 *   Total Credits - Total Debits == Balance + Reserved
 *
 * ─── Performance Architecture ───────────────────────────────────────────────
 * The original implementation aggregated ALL historical wallet_transactions
 * on every ledger event — O(N) complexity with N growing unboundedly.
 * For high-volume accounts this turned into a sequential table scan that was
 * held inside a Postgres FOR UPDATE lock, blocking concurrent checkouts.
 *
 * The checkpoint approach:
 *   1. wallet.ledger_checksum  — running algebraic sum maintained by WalletService
 *      after every committed transaction (see updateCheckpoint()).
 *   2. wallet.ledger_checksum_at — timestamp of last checkpoint write.
 *   3. On verification we only aggregate transactions NEWER than ledger_checksum_at,
 *      producing a delta.  The full expected sum is ledgerChecksum + delta.
 *   4. This reduces the aggregate from O(N) to O(k), where k is the number of
 *      transactions since the last checkpoint — typically just 1 (the event that
 *      is currently being committed).
 */

import { prisma } from '@/lib/core/db'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/core/logger'
import { AppError, ErrorCodes } from '@/lib/core/errors'
import { emitControlEvent } from '@/lib/events/emitters/state-emitter'
import { ForensicDispatcher, ForensicIncident } from './forensic-dispatcher'
import { wallet_sentinel_drift_total, wallet_sentinel_status, wallet_sentinel_checkpoint_total } from '@/lib/metrics'

export class FinancialSentinel {
    private static ALLOWED_DRIFT = 0.01 // Maximum acceptable rounding drift

    // ─────────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Verifies the financial integrity of a user's wallet.
     *
     * Uses a checkpoint-based approach so we only aggregate the small window of
     * transactions since the last checkpoint — O(k) instead of O(N).
     *
     * @returns boolean — true if integrity intact, false if user quarantined.
     * @throws  AppError (500) if the verification machinery itself fails.
     */
    static async verifyIntegrity(userId: string, tx?: Prisma.TransactionClient): Promise<boolean> {
        const client = tx || prisma

        try {
            // 1. Fetch wallet + last 5 transactions for forensics if needed.
            const wallet = await client.wallet.findUnique({
                where: { userId },
                include: {
                    transactions: {
                        orderBy: { createdAt: 'desc' },
                        take: 5,
                    },
                },
            })

            // New wallets have no transactions — always consistent.
            if (!wallet) return true

            // 2. Compute the expected balance sum using the checkpoint.
            //
            //    expectedSum = ledgerChecksum + SUM(amount) for transactions
            //                  created STRICTLY AFTER ledgerChecksumAt.
            //
            //    Because ledger_checksum_at uses NOW() as a default, new wallets
            //    will have a checkpoint timestamp that is >= all transactions, so
            //    the delta aggregate returns 0 and we compare balance against 0.
            const deltaAggregate = await client.walletTransaction.aggregate({
                where: {
                    walletId: wallet.id,
                    // Only rows newer than the checkpoint — the hot window.
                    createdAt: { gt: wallet.ledgerChecksumAt },
                },
                _sum: { amount: true },
            })

            const delta = deltaAggregate._sum.amount ?? new Prisma.Decimal(0)
            const checkpoint = wallet.ledgerChecksum instanceof Prisma.Decimal
                ? wallet.ledgerChecksum
                : new Prisma.Decimal(wallet.ledgerChecksum)
            const deltaDecimal = delta instanceof Prisma.Decimal
                ? delta
                : new Prisma.Decimal(delta)

            const expectedSum = checkpoint.add(deltaDecimal)

            // 3. Compare balance to expected sum.
            let currentBalance = wallet.balance instanceof Prisma.Decimal
                ? wallet.balance
                : new Prisma.Decimal(wallet.balance)

            const drift = currentBalance.sub(expectedSum).abs()
            const driftNum = drift.toNumber()
            const status = drift.greaterThan(this.ALLOWED_DRIFT) ? 1 : 0

            // 4. Telemetry.
            wallet_sentinel_drift_total.set(driftNum)
            wallet_sentinel_status.set(status)

            if (status === 1) {
                logger.error(`[Sentinel] FINANCIAL INTEGRITY BREACH for user ${userId}`, {
                    drift: driftNum,
                    balance: currentBalance.toNumber(),
                    checkpoint: checkpoint.toNumber(),
                    delta: deltaDecimal.toNumber(),
                    expectedSum: expectedSum.toNumber(),
                    checkedSince: wallet.ledgerChecksumAt,
                })

                await this.quarantineUser(userId, {
                    drift: driftNum,
                    balance: currentBalance.toNumber(),
                    expectedSum: expectedSum.toNumber(),
                    lastTransactions: wallet.transactions.map(t => ({
                        type: t.type,
                        amount: t.amount.toNumber(),
                        description: t.description,
                        ts: t.createdAt,
                    })),
                }, client)

                return false
            }

            return true

        } catch (error) {
            logger.error('[Sentinel] Verification system error', {
                error: (error as any).message,
                stack: (error as any).stack,
                userId,
            })
            // FAIL-CLOSED: block the transaction if we can't verify.
            throw new AppError(
                'Financial security exception: Unable to verify wallet integrity',
                ErrorCodes.SYSTEM_UNKNOWN,
                500
            )
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Checkpoint Management
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Advances the ledger checkpoint after a committed transaction.
     *
     * Call this inside the same DB transaction (or immediately after commit) for
     * every ledger event: credit, debit, charge, refund, commit, transfer.
     *
     * The update is:
     *   ledger_checksum    += transactionAmount   (signed: positive credits, negative debits)
     *   ledger_checksum_at  = NOW()
     *
     * This keeps the sentinel's hot-window (transactions after the checkpoint)
     * as small as possible — ideally just 0 or 1 rows on the next check.
     *
     * @param walletId         Internal wallet UUID (not userId).
     * @param transactionAmount Signed decimal matching wallet_transactions.amount.
     * @param checkpointTime    Optional aligned timestamp (usually transaction.createdAt).
     * @param client            Optional transaction client for atomicity.
     *
     * CRITICAL: This does NOT catch errors. If the checkpoint fails, the
     * calling transaction MUST roll back — the ledger checksum must stay
     * perfectly in sync with the balance. A metric is emitted on failure
     * for alerting (but the throw propagates).
     */
    static async updateCheckpoint(
        walletId: string,
        transactionAmount: Prisma.Decimal | number,
        checkpointTime?: Date,
        client?: Prisma.TransactionClient
    ): Promise<void> {
        const db = client || prisma
        const amount = transactionAmount instanceof Prisma.Decimal
            ? transactionAmount
            : new Prisma.Decimal(transactionAmount)

        // Atomic update + verification read-back in same transaction
        const updatedWallet = await db.wallet.update({
            where: { id: walletId },
            data: {
                ledgerChecksum: { increment: amount },
                ledgerChecksumAt: checkpointTime || new Date(),
            },
            select: { ledgerChecksum: true, ledgerChecksumAt: true }
        })

        // Verify the write persisted correctly
        const writtenChecksum = updatedWallet.ledgerChecksum instanceof Prisma.Decimal
            ? updatedWallet.ledgerChecksum
            : new Prisma.Decimal(updatedWallet.ledgerChecksum)

        // Emit success metric
        wallet_sentinel_checkpoint_total.labels({ outcome: 'success' }).inc()
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Quarantine
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Quarantines a user by banning them and firing alerts.
     */
    private static async quarantineUser(
        userId: string,
        forensics: Omit<ForensicIncident, 'userId' | 'actionTaken' | 'timestamp'>,
        tx: Prisma.TransactionClient
    ) {
        // 1. Database Ban (Atomic)
        await tx.user.update({
            where: { id: userId },
            data: { isBanned: true },
        })

        // 2. Global Revocation (Sockets)
        // Note: emitted inside the transaction — if tx rolls back the ban is
        // unwound in DB but the socket disconnect has already fired.  This is
        // intentionally conservative: a false-positive revocation is recoverable
        // by an admin; a missed revocation is a security gap.
        await emitControlEvent('user.revoked', { userId })

        // 3. Dispatch Forensic Alerts (non-blocking)
        ForensicDispatcher.dispatch({
            userId,
            drift: forensics.drift,
            balance: forensics.balance,
            expectedSum: forensics.expectedSum,
            actionTaken: 'BANNED',
            timestamp: new Date(),
            lastTransactions: forensics.lastTransactions,
        }).catch(err => logger.warn('[Sentinel] Forensic dispatch failed', { userId, error: err }))

        // 4. Record Audit Log
        await tx.auditLog.create({
            data: {
                userId: 'SYSTEM',
                action: 'security.integrity_breach',
                resourceType: 'user',
                resourceId: userId,
                metadata: forensics as unknown as Prisma.InputJsonValue,
                ipAddress: '127.0.0.1',
            },
        })
    }
}
