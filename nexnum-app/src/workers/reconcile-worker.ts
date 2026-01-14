import { prisma } from '@/lib/core/db'
import { WalletService } from '@/lib/wallet/wallet'
import { logger } from '@/lib/core/logger'
import { redis } from '@/lib/core/redis'

interface ReconcileResult {
    purchaseOrders: { processed: number; succeeded: number; failed: number }
    activations: { processed: number; succeeded: number; failed: number }
    refunds: { processed: number; succeeded: number; failed: number }
}

/**
 * Reconcile Worker
 * 1. Scans for stuck/expired PENDING purchase orders and releases funds
 * 2. Scans for stuck RESERVED activations and marks them FAILED
 * 3. Processes refundable states (EXPIRED, FAILED, CANCELLED) -> REFUNDED
 */
export async function processReconciliationBatch(): Promise<ReconcileResult> {
    // 0. Distributed Lock Guard (Single Instance Only)
    const lockKey = 'NexNum:Lock:Reconcile'
    const locked = await redis.set(lockKey, 'locked', 'EX', 60, 'NX') // 60s lock
    if (!locked) {
        logger.debug('[Reconcile] Skipped: Another instance is running')
        return {
            purchaseOrders: { processed: 0, succeeded: 0, failed: 0 },
            activations: { processed: 0, succeeded: 0, failed: 0 },
            refunds: { processed: 0, succeeded: 0, failed: 0 }
        }
    }

    try {
        const now = new Date()
        const stuckThreshold = new Date(now.getTime() - 10 * 60 * 1000) // 10 minutes ago

        const results: ReconcileResult = {
            purchaseOrders: { processed: 0, succeeded: 0, failed: 0 },
            activations: { processed: 0, succeeded: 0, failed: 0 },
            refunds: { processed: 0, succeeded: 0, failed: 0 }
        }

        // 1. Handle stuck PurchaseOrders (Legacy)
        const expiredOrders = await prisma.purchaseOrder.findMany({
            where: {
                status: 'PENDING',
                expiresAt: { lt: now }
            },
            take: 50
        })

        for (const order of expiredOrders) {
            results.purchaseOrders.processed++
            try {
                await prisma.$transaction(async (tx) => {
                    await WalletService.rollback(
                        order.userId,
                        order.amount.toNumber(),
                        order.id,
                        'Reconciliation Expired',
                        tx as any
                    )
                    await tx.purchaseOrder.update({
                        where: { id: order.id },
                        data: { status: 'FAILED' }
                    })
                })
                results.purchaseOrders.succeeded++
            } catch (err) {
                logger.error(`[Reconcile] PurchaseOrder ${order.id} failed`, err)
                results.purchaseOrders.failed++
            }
        }

        // 2. Handle stuck Activations in RESERVED state
        const stuckActivations = await prisma.activation.findMany({
            where: {
                state: 'RESERVED',
                createdAt: { lt: stuckThreshold }
            },
            take: 50
        })

        for (const activation of stuckActivations) {
            results.activations.processed++
            try {
                await prisma.$transaction(async (tx) => {
                    // Rollback reservation
                    await WalletService.rollback(
                        activation.userId,
                        activation.price.toNumber(),
                        activation.id,
                        'Reconciliation: Stuck RESERVED',
                        tx as any
                    )
                    // Mark as FAILED
                    await tx.activation.update({
                        where: { id: activation.id },
                        data: { state: 'FAILED' }
                    })
                })
                results.activations.succeeded++
                logger.info(`[Reconcile] Activation ${activation.id} -> FAILED (stuck)`)
            } catch (err) {
                logger.error(`[Reconcile] Activation ${activation.id} failed`, err)
                results.activations.failed++
            }
        }

        // 3. Process pending refunds (EXPIRED, FAILED, CANCELLED without refund yet)
        // STRICT: Only refund if we actually captured money (capturedTxId exists)
        const pendingRefunds = await prisma.activation.findMany({
            where: {
                state: { in: ['EXPIRED', 'FAILED', 'CANCELLED'] },
                refundTxId: null, // No refund processed yet
                capturedTxId: { not: null } // Proof of purchase
            },
            take: 50
        })

        for (const activation of pendingRefunds) {
            results.refunds.processed++
            try {
                await prisma.$transaction(async (tx) => {
                    // 3.1. Row-Level Lock (using update as a lock mechanism or raw query if strictly needed)
                    // Prisma doesn't support FOR UPDATE natively easily without raw.
                    // But we can just refetch. To lock, we might assume the optimistic concurrency or just rely on the atomic transaction.
                    // For now, let's just refetch.
                    const freshActivation = await tx.activation.findUnique({ where: { id: activation.id } })

                    if (!freshActivation) return // Deleted?

                    // 3.2. GUARD: Zero-SMS Check
                    // Only check if we have a numberId. If no number assigned, clearly no SMS.
                    if (freshActivation.numberId) {
                        const smsCount = await tx.smsMessage.count({ where: { numberId: freshActivation.numberId } })

                        if (smsCount > 0) {
                            logger.warn(`[Reconcile] Blocked Refund for ${activation.id}: SMS messages exist. Marking as RECEIVED.`)
                            await tx.activation.update({
                                where: { id: activation.id },
                                data: { state: 'RECEIVED' }
                            })
                            return
                        }
                    }

                    const refundTx = await WalletService.refund(
                        activation.userId,
                        activation.price.toNumber(),
                        'refund',
                        activation.id,
                        `Reconciliation Refund: ${activation.state}`,
                        `refund_${activation.id}`,
                        tx as any
                    )
                    await tx.activation.update({
                        where: { id: activation.id },
                        data: {
                            state: 'REFUNDED',
                            refundTxId: refundTx.id
                        }
                    })
                })
                results.refunds.succeeded++
                logger.info(`[Reconcile] Activation ${activation.id} -> REFUNDED`)
            } catch (err) {
                logger.error(`[Reconcile] Refund for ${activation.id} failed`, err)
                results.refunds.failed++
            }
        }

        return results
    } finally {
        await redis.del(lockKey)
    }
}
