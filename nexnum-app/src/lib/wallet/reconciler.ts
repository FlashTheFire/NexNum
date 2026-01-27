import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'
import { Prisma } from '@prisma/client'

/**
 * Wallet Reconciler
 * 
 * Performs automated double-entry audits:
 * Sum(Transactions) should equal Current Balance.
 */
export class WalletReconciler {

    /**
     * Audit a single user's wallet
     */
    static async auditUserWallet(userId: string) {
        const wallet = await prisma.wallet.findUnique({
            where: { userId },
            include: {
                transactions: {
                    select: { amount: true }
                }
            }
        })

        if (!wallet) return { valid: true }

        // Sum transactions
        const txSum = wallet.transactions.reduce(
            (acc, tx) => acc.plus(tx.amount),
            new Prisma.Decimal(0)
        )

        const diff = wallet.balance.sub(txSum).abs()
        const isValid = diff.lessThan(0.0001) // Floating point margin

        if (!isValid) {
            logger.error(`[AUDIT] Financial discrepancy detected for user ${userId}!`, {
                balance: wallet.balance.toNumber(),
                transactionSum: txSum.toNumber(),
                drift: diff.toNumber()
            })

            // In a pro system, we'd fire an alert/event here
            await prisma.auditLog.create({
                data: {
                    userId: 'SYSTEM',
                    action: 'wallet.audit_failed',
                    resourceType: 'wallet',
                    resourceId: wallet.id,
                    metadata: {
                        userId,
                        balance: wallet.balance.toNumber(),
                        transactionSum: txSum.toNumber(),
                        drift: diff.toNumber()
                    },
                    ipAddress: '127.0.0.1'
                }
            })
        }

        return {
            userId,
            isValid,
            balance: wallet.balance.toNumber(),
            sum: txSum.toNumber(),
            drift: diff.toNumber()
        }
    }

    /**
     * Audit all active wallets
     */
    static async auditAll(limit = 100) {
        const wallets = await prisma.wallet.findMany({
            take: limit,
            orderBy: { createdAt: 'desc' }
        })

        logger.info(`[AUDIT] Starting financial audit for ${wallets.length} wallets...`)

        const results = []
        for (const wallet of wallets) {
            results.push(await this.auditUserWallet(wallet.userId))
        }

        const failures = results.filter(r => !r.isValid)
        if (failures.length > 0) {
            logger.warn(`[AUDIT] Audit complete. Found ${failures.length} discrepancies!`)
        } else {
            logger.success(`[AUDIT] Audit complete. All ${wallets.length} wallets are consistent.`)
        }

        return {
            total: wallets.length,
            failures: failures.length,
            results
        }
    }

    /**
     * Audit System Float (Global Liquidity)
     * Sum(User Balances) + Sum(User Reservations) should equal the platform's expected liquidity.
     */
    static async auditSystemFloat() {
        // In a real system, we'd compare this against an external ledger or Bank API
        // For NexNum, we audit internal consistency: 
        // 1. Total Balance
        // 2. Total Reserved
        // 3. Total Transactions (all time)

        const totals = await prisma.wallet.aggregate({
            _sum: {
                balance: true,
                reserved: true
            }
        })

        const transactionSum = await prisma.walletTransaction.aggregate({
            _sum: {
                amount: true
            }
        })

        const balanceSum = totals._sum.balance || new Prisma.Decimal(0)
        const reservedSum = totals._sum.reserved || new Prisma.Decimal(0)
        const totalTx = transactionSum._sum.amount || new Prisma.Decimal(0)

        // Float Logic: Total Balance across all wallets MUST equal Total Net Transactions
        const drift = balanceSum.sub(totalTx).abs()
        const isConsistent = drift.lessThan(0.01)

        if (!isConsistent) {
            logger.error('[AUDIT] SYSTEM FLOAT DISCREPANCY!', {
                totalBalances: balanceSum.toNumber(),
                totalTransactions: totalTx.toNumber(),
                drift: drift.toNumber()
            })

            await prisma.auditLog.create({
                data: {
                    userId: 'SYSTEM',
                    action: 'financial.float_discrepancy',
                    resourceType: 'system',
                    resourceId: 'global',
                    metadata: {
                        totalBalances: balanceSum.toNumber(),
                        totalTransactions: totalTx.toNumber(),
                        drift: drift.toNumber()
                    },
                    ipAddress: '127.0.0.1'
                }
            })
        }

        return {
            isConsistent,
            totalBalances: balanceSum.toNumber(),
            totalReserved: reservedSum.toNumber(),
            totalTransactions: totalTx.toNumber(),
            drift: drift.toNumber()
        }
    }
}
