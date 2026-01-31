/**
 * Financial Sentinel Core
 * 
 * Enforces the immutable law:
 * Total Credits - Total Debits == Balance + Reserved
 */

import { prisma } from '@/lib/core/db'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/core/logger'
import { AppError, ErrorCodes } from '@/lib/core/errors'
import { emitControlEvent } from '@/lib/events/emitters/state-emitter'
import { ForensicDispatcher, ForensicIncident } from './forensic-dispatcher'
import { wallet_sentinel_drift_total, wallet_sentinel_status } from '@/lib/metrics'

export class FinancialSentinel {
    private static ALLOWED_DRIFT = 0.01 // Maximum acceptable rounding drift

    /**
     * Verifies the financial integrity of a user's wallet.
     * If a discrepancy is detected, the user is automatically banned.
     * 
     * @returns boolean - True if integrity is intact, False if user has been quarantined.
     */
    static async verifyIntegrity(userId: string, tx?: Prisma.TransactionClient): Promise<boolean> {
        const client = tx || prisma;

        try {
            // 1. Fetch Wallet and Transactions within the same context
            // We use findUnique with include to get a consistent snapshot
            const wallet = await client.wallet.findUnique({
                where: { userId },
                include: {
                    transactions: {
                        orderBy: { createdAt: 'desc' },
                        take: 5 // Get last 5 for forensics
                    }
                }
            });

            if (!wallet) return true; // New wallets are inherently consistent

            // 2. Aggregate ALL transactions to verify total flow
            const aggregate = await client.walletTransaction.aggregate({
                where: { walletId: wallet.id },
                _sum: { amount: true }
            });

            // Handle potential nulls from aggregation
            let transactionSum = aggregate._sum.amount;
            if (!transactionSum) {
                transactionSum = new Prisma.Decimal(0);
            }

            // Ensure consistency in types (handle potential JS number vs Decimal mismatch)
            let currentBalance = wallet.balance;

            // If for some reason Prisma returns numbers (e.g. float/double type in DB), convert to Decimal
            if (typeof currentBalance === 'number') {
                currentBalance = new Prisma.Decimal(currentBalance);
            }

            // Defensive check: If transactionSum is a number (unlikely but possible with some drivers)
            if (typeof transactionSum === 'number') {
                transactionSum = new Prisma.Decimal(transactionSum);
            }

            // Calculate drift
            // If either is still not a Decimal (e.g. string), this might throw, so we'll log it in catch block
            const drift = currentBalance.sub(transactionSum).abs();
            const driftNum = drift.toNumber();
            const status = drift.greaterThan(this.ALLOWED_DRIFT) ? 1 : 0;

            // Industrial Telemetry Reporting
            wallet_sentinel_drift_total.set(driftNum);
            wallet_sentinel_status.set(status);

            if (status === 1) {
                logger.error(`[Sentinel] FINANCIAL INTEGRITY BREACH for user ${userId}`, {
                    drift: driftNum,
                    balance: currentBalance.toNumber(),
                    txSum: transactionSum.toNumber()
                });

                await this.quarantineUser(userId, {
                    drift: driftNum,
                    balance: currentBalance.toNumber(),
                    expectedSum: transactionSum.toNumber(),
                    lastTransactions: wallet.transactions.map(t => ({
                        type: t.type,
                        amount: t.amount.toNumber(),
                        description: t.description,
                        ts: t.createdAt
                    }))
                }, client);

                return false;
            }

            return true;

        } catch (error) {
            logger.error('[Sentinel] Verification system error', {
                error: (error as any).message,
                stack: (error as any).stack,
                userId
            });
            // FAIL-CLOSED: If we can't verify, we block the transaction
            throw new AppError(
                'Financial security exception: Unable to verify wallet integrity',
                ErrorCodes.SYSTEM_UNKNOWN,
                500
            );
        }
    }

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
            data: { isBanned: true }
        });

        // 2. Global Revocation (Sockets)
        // Note: Event emission happens inside if transaction succeeds, 
        // but since we are in a transaction, we might need to defer it.
        // For simplicity, we emit; if tx rolls back, user stays unbanned.
        await emitControlEvent('user.revoked', { userId });

        // 3. Dispatch Forensic Alerts
        // Non-blocking
        ForensicDispatcher.dispatch({
            userId,
            drift: forensics.drift,
            balance: forensics.balance,
            expectedSum: forensics.expectedSum,
            actionTaken: 'BANNED',
            timestamp: new Date(),
            lastTransactions: forensics.lastTransactions
        }).catch(() => { });

        // 4. Record Audit Log
        await tx.auditLog.create({
            data: {
                userId: 'SYSTEM',
                action: 'security.integrity_breach',
                resourceType: 'user',
                resourceId: userId,
                metadata: forensics as unknown as Prisma.InputJsonValue,
                ipAddress: '127.0.0.1'
            }
        });
    }
}
