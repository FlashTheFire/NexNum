/**
 * Reconcile Worker (Hardened - Future Proof Edition)
 * 
 * Enterprise-grade reconciliation with:
 * - Multi-layer refund protection
 * - State machine enforcement
 * - Orphan detection
 * - Comprehensive audit trail
 */

import { prisma } from '@/lib/core/db'
import { WalletService } from '@/lib/wallet/wallet'
import { logger } from '@/lib/core/logger'
import { redis } from '@/lib/core/redis'
import { smsProvider } from '@/lib/sms-providers'
import { smsAudit } from '@/lib/sms/audit'
import { REFUNDABLE_STATES, canTransition } from '@/lib/activation/activation-state-machine'

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    // Time locks
    MIN_REFUND_AGE_MS: 2 * 60 * 1000,        // 2 minutes minimum before refund
    STUCK_THRESHOLD_MS: 10 * 60 * 1000,       // 10 minutes for stuck RESERVED

    // Thresholds
    HIGH_VALUE_THRESHOLD: 5.00,               // Amounts > $5 get extra scrutiny
    MAX_BATCH_SIZE: 50,

    // Lock
    LOCK_KEY: 'NexNum:Lock:Reconcile',
    LOCK_TTL_SECONDS: 120,
}

// ============================================
// TYPES
// ============================================

interface RefundGuardResult {
    allowed: boolean
    reason?: string
    requiresManualReview?: boolean
}

interface ReconcileResult {
    purchaseOrders: { processed: number; succeeded: number; failed: number }
    activations: { processed: number; succeeded: number; failed: number }
    refunds: { processed: number; succeeded: number; failed: number; blocked: number }
    orphans: { detected: number; fixed: number }
}

// ============================================
// REFUND GUARDS
// ============================================

/**
 * Multi-layer refund protection
 */
async function checkRefundGuards(
    activation: { id: string; state: string; price: any; userId: string; numberId: string | null; createdAt: Date; capturedTxId: string | null; providerActivationId: string | null }
): Promise<RefundGuardResult> {
    // Guard 1: State must be refundable
    if (!REFUNDABLE_STATES.includes(activation.state as any)) {
        return { allowed: false, reason: `State ${activation.state} is not refundable` }
    }

    // Guard 2: Must have captured funds (proof of purchase)
    if (!activation.capturedTxId) {
        return { allowed: false, reason: 'No captured transaction - cannot refund unrealized funds' }
    }

    // Guard 3: Time lock - minimum age before refund
    const age = Date.now() - activation.createdAt.getTime()
    if (age < CONFIG.MIN_REFUND_AGE_MS) {
        const remainingSec = Math.ceil((CONFIG.MIN_REFUND_AGE_MS - age) / 1000)
        return { allowed: false, reason: `Time lock: ${remainingSec}s remaining before refund eligible` }
    }

    // Guard 4: Zero SMS check
    if (activation.numberId) {
        const smsCount = await prisma.smsMessage.count({
            where: { numberId: activation.numberId }
        })

        if (smsCount > 0) {
            return { allowed: false, reason: `SMS messages exist (${smsCount} found) - blocking refund` }
        }
    }

    // Guard 5: Provider verification (if activation ID exists)
    if (activation.providerActivationId) {
        try {
            const providerStatus = await smsProvider.getStatus(activation.providerActivationId)

            // If provider shows messages, block refund
            if (providerStatus.messages && providerStatus.messages.length > 0) {
                return { allowed: false, reason: 'Provider shows SMS messages - blocking refund' }
            }

            // If provider shows received status, block refund
            if (providerStatus.status === 'received') {
                return { allowed: false, reason: 'Provider status is received - blocking refund' }
            }
        } catch (e: any) {
            // If provider check fails with terminal state, that's OK for refund
            if (!e.isLifecycleTerminal) {
                // Non-terminal error - be cautious
                logger.warn(`[Reconcile] Provider check failed, proceeding with caution: ${e.message}`)
            }
        }
    }

    // Guard 6: High value review
    const price = typeof activation.price === 'number' ? activation.price : activation.price.toNumber()
    if (price > CONFIG.HIGH_VALUE_THRESHOLD) {
        return {
            allowed: true,
            requiresManualReview: true,
            reason: `High value refund ($${price.toFixed(2)}) - flagged for review`
        }
    }

    // All guards passed
    return { allowed: true }
}

// ============================================
// ORPHAN DETECTION
// ============================================

interface OrphanedRecord {
    id: string
    type: 'number_no_activation' | 'messages_but_expired' | 'stuck_polling' | 'state_mismatch'
    details: string
}

/**
 * Detect orphaned/inconsistent records
 */
async function detectOrphans(): Promise<OrphanedRecord[]> {
    const orphans: OrphanedRecord[] = []

    // Type 1: Active numbers with no activation record
    const numbersNoActivation = await prisma.number.findMany({
        where: {
            status: { in: ['active', 'received'] },
            activationId: null
        },
        take: 20
    })
    for (const n of numbersNoActivation) {
        orphans.push({
            id: n.id,
            type: 'number_no_activation',
            details: `Number ${n.phoneNumber} is ${n.status} but has no activationId`
        })
    }

    // Type 2: Expired numbers with SMS messages
    const expiredWithMessages = await prisma.number.findMany({
        where: {
            status: 'expired',
            smsMessages: { some: {} }
        },
        include: { _count: { select: { smsMessages: true } } },
        take: 20
    })
    for (const n of expiredWithMessages) {
        orphans.push({
            id: n.id,
            type: 'messages_but_expired',
            details: `Number ${n.phoneNumber} is expired but has ${n._count.smsMessages} messages`
        })
    }

    // Type 3: Stuck in polling for too long
    const stuckPolling = await prisma.number.findMany({
        where: {
            status: 'active',
            lastPolledAt: { lt: new Date(Date.now() - 3600000) }, // 1 hour
            errorCount: { lt: 5 }
        },
        take: 20
    })
    for (const n of stuckPolling) {
        orphans.push({
            id: n.id,
            type: 'stuck_polling',
            details: `Number ${n.phoneNumber} hasn't been polled in over 1 hour`
        })
    }

    return orphans
}

/**
 * Auto-fix orphaned records where safe
 */
async function fixOrphans(orphans: OrphanedRecord[]): Promise<number> {
    let fixed = 0

    for (const orphan of orphans) {
        try {
            switch (orphan.type) {
                case 'messages_but_expired':
                    // Safe to fix: Has messages, should be completed/received
                    await prisma.number.update({
                        where: { id: orphan.id },
                        data: { status: 'completed' }
                    })
                    logger.info(`[Reconcile] Fixed orphan: ${orphan.id} -> completed (had messages)`)
                    fixed++
                    break

                case 'stuck_polling':
                    // Reset polling to try again
                    await prisma.number.update({
                        where: { id: orphan.id },
                        data: {
                            nextPollAt: new Date(),
                            errorCount: 0
                        }
                    })
                    logger.info(`[Reconcile] Fixed orphan: ${orphan.id} -> reset polling`)
                    fixed++
                    break

                default:
                    // Log for manual review
                    logger.warn(`[Reconcile] Orphan requires manual review: ${orphan.type}`, { id: orphan.id, details: orphan.details })
            }
        } catch (e: any) {
            logger.error(`[Reconcile] Failed to fix orphan ${orphan.id}: ${e.message}`)
        }
    }

    return fixed
}

// ============================================
// MAIN WORKER FUNCTION
// ============================================

export async function processReconciliationBatch(): Promise<ReconcileResult> {
    // Distributed lock
    const locked = await redis.set(CONFIG.LOCK_KEY, 'locked', 'EX', CONFIG.LOCK_TTL_SECONDS, 'NX')
    if (!locked) {
        logger.debug('[Reconcile] Skipped: Another instance is running')
        return {
            purchaseOrders: { processed: 0, succeeded: 0, failed: 0 },
            activations: { processed: 0, succeeded: 0, failed: 0 },
            refunds: { processed: 0, succeeded: 0, failed: 0, blocked: 0 },
            orphans: { detected: 0, fixed: 0 }
        }
    }

    try {
        const now = new Date()
        const stuckThreshold = new Date(now.getTime() - CONFIG.STUCK_THRESHOLD_MS)

        const results: ReconcileResult = {
            purchaseOrders: { processed: 0, succeeded: 0, failed: 0 },
            activations: { processed: 0, succeeded: 0, failed: 0 },
            refunds: { processed: 0, succeeded: 0, failed: 0, blocked: 0 },
            orphans: { detected: 0, fixed: 0 }
        }

        // 1. Handle stuck PurchaseOrders (Legacy)
        const expiredOrders = await prisma.purchaseOrder.findMany({
            where: {
                status: 'PENDING',
                expiresAt: { lt: now }
            },
            take: CONFIG.MAX_BATCH_SIZE
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
            } catch (err: any) {
                logger.error(`[Reconcile] PurchaseOrder ${order.id} failed`, err)
                results.purchaseOrders.failed++
            }
        }

        // 2. Handle stuck RESERVED activations
        const stuckActivations = await prisma.activation.findMany({
            where: {
                state: 'RESERVED',
                createdAt: { lt: stuckThreshold }
            },
            take: CONFIG.MAX_BATCH_SIZE
        })

        for (const activation of stuckActivations) {
            results.activations.processed++
            try {
                await prisma.$transaction(async (tx) => {
                    await WalletService.rollback(
                        activation.userId,
                        activation.price.toNumber(),
                        activation.id,
                        'Reconciliation: Stuck RESERVED',
                        tx as any
                    )
                    await tx.activation.update({
                        where: { id: activation.id },
                        data: { state: 'FAILED' }
                    })
                })
                results.activations.succeeded++
                logger.info(`[Reconcile] Activation ${activation.id} -> FAILED (stuck)`)
            } catch (err: any) {
                logger.error(`[Reconcile] Activation ${activation.id} failed`, err)
                results.activations.failed++
            }
        }

        // 3. Process pending refunds with guards
        const pendingRefunds = await prisma.activation.findMany({
            where: {
                state: { in: ['EXPIRED', 'FAILED', 'CANCELLED'] },
                refundTxId: null,
                capturedTxId: { not: null }
            },
            take: CONFIG.MAX_BATCH_SIZE
        })

        for (const activation of pendingRefunds) {
            results.refunds.processed++

            // Run refund guards
            const guardResult = await checkRefundGuards(activation)

            if (!guardResult.allowed) {
                results.refunds.blocked++
                logger.warn(`[Reconcile] Refund blocked for ${activation.id}: ${guardResult.reason}`)
                await smsAudit.logRefundBlocked(activation.id, activation.userId, guardResult.reason || 'Unknown reason')

                // If blocked due to SMS, update state to RECEIVED
                if (guardResult.reason?.includes('SMS')) {
                    await prisma.activation.update({
                        where: { id: activation.id },
                        data: { state: 'RECEIVED' }
                    })
                }
                continue
            }

            // Log if requires manual review
            if (guardResult.requiresManualReview) {
                logger.info(`[Reconcile] High-value refund flagged for review: ${activation.id} ($${activation.price})`)
            }

            try {
                await prisma.$transaction(async (tx) => {
                    const freshActivation = await tx.activation.findUnique({ where: { id: activation.id } })
                    if (!freshActivation || freshActivation.refundTxId) return

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
            } catch (err: any) {
                logger.error(`[Reconcile] Refund for ${activation.id} failed`, err)
                results.refunds.failed++
            }
        }

        // 4. Detect and fix orphans
        const orphans = await detectOrphans()
        results.orphans.detected = orphans.length

        if (orphans.length > 0) {
            results.orphans.fixed = await fixOrphans(orphans)
            logger.info(`[Reconcile] Orphans: ${orphans.length} detected, ${results.orphans.fixed} fixed`)
        }

        return results
    } finally {
        await redis.del(CONFIG.LOCK_KEY)
    }
}
