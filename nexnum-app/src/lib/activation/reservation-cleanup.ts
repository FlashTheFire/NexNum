/**
 * Reservation Cleanup Worker
 * 
 * Expires stale reservations and restores stock to prevent:
 * - Ghost reservations locking stock forever
 * - Inconsistent inventory counts
 * - Abandoned purchase flows holding numbers
 * 
 * Should run every 30-60 seconds.
 */

import { prisma } from '@/lib/core/db'
import { publishOutboxEvent } from './outbox'
import { logger } from '@/lib/core/logger'
import { WalletService } from '@/lib/wallet/wallet'
import { EventDispatcher } from '@/lib/core/event-dispatcher'
import { ActivationKernel } from './activation-kernel'

// Configuration
const CLEANUP_INTERVAL_MS = 30000 // 30 seconds
const BATCH_SIZE = 100

let isRunning = false
let cleanupInterval: NodeJS.Timeout | null = null

interface CleanupResult {
    expiredReservations: number
    expiredNumbers: number
    staleActivations: number
    stockRestored: number
    fundsRecovered: number
    errors: number
}

/**
 * Find and expire stale reservations
 */
async function cleanupExpiredReservations(): Promise<CleanupResult> {
    const result: CleanupResult = {
        expiredReservations: 0,
        expiredNumbers: 0,
        staleActivations: 0,
        stockRestored: 0,
        fundsRecovered: 0,
        errors: 0
    }

    try {
        // Find expired PENDING reservations (Catalog items)
        const expiredReservations = await prisma.offerReservation.findMany({
            where: {
                status: 'PENDING',
                expiresAt: { lt: new Date() }
            },
            take: BATCH_SIZE
        })

        if (expiredReservations.length === 0) {
            return result
        }

        logger.info(`[RESERVATION-CLEANUP] Found ${expiredReservations.length} expired offer reservations`)

        for (const reservation of expiredReservations) {
            try {
                await prisma.$transaction(async (tx) => {
                    // Mark reservation as expired
                    await tx.offerReservation.update({
                        where: { id: reservation.id },
                        data: { status: 'EXPIRED' }
                    })

                    // Publish outbox event for MeiliSearch sync
                    await publishOutboxEvent({
                        aggregateType: 'offer',
                        aggregateId: reservation.offerId,
                        eventType: 'offer.updated',
                        payload: {
                            reason: 'reservation_expired',
                            reservationId: reservation.id,
                            stockRestored: reservation.quantity
                        }
                    })
                })

                result.expiredReservations++
                result.stockRestored += reservation.quantity

            } catch (error) {
                logger.error(`[RESERVATION-CLEANUP] Failed to expire reservation ${reservation.id}`, { error })
                result.errors++
            }
        }

        logger.info(`[RESERVATION-CLEANUP] Expired ${result.expiredReservations} reservations, restored ${result.stockRestored} stock`)

    } catch (error) {
        logger.error('[RESERVATION-CLEANUP] Batch error', { error })
    }

    return result
}

import { smsProvider } from '@/lib/providers'
import { ActivationService } from './activation-service'

/**
 * Find and mark expired numbers as EXPIRED
 * Enhanced: Performs a final check and active cancellation via provider
 */
async function cleanupExpiredNumbers(): Promise<number> {
    let expiredCount = 0

    try {
        const expiredNumbers = await prisma.number.findMany({
            where: {
                status: { in: ['active', 'received'] },
                expiresAt: { lt: new Date() }
            },
            take: BATCH_SIZE
        })

        if (expiredNumbers.length === 0) return 0

        logger.info(`[NUMBER-CLEANUP] Processing ${expiredNumbers.length} potentially expired numbers`)

        for (const num of expiredNumbers) {
            try {
                // 1. Final Status Check
                if (num.activationId) {
                    try {
                        const status = await smsProvider.getStatus(num.activationId)
                        if (status.messages.length > 0) {
                            // SMS found at the last second! Mark as completed instead of expiring.
                            await prisma.number.update({
                                where: { id: num.id },
                                data: { status: 'completed' }
                            })

                            if (num.activationId) {
                                // Sync Activation state via Kernel
                                const activation = await prisma.activation.findFirst({
                                    where: { providerActivationId: num.activationId }
                                })
                                if (activation) {
                                    await ActivationKernel.transition(activation.id, 'RECEIVED', {
                                        reason: 'Cleanup: Number saved by late SMS check'
                                    })
                                }
                            }

                            logger.info(`[NUMBER-CLEANUP] Number ${num.phoneNumber} saved by late SMS!`)
                            continue
                        }

                        // NEW: Final DB Check - If we have messages locally, DO NOT EXPIRE.
                        const localMsgCount = await prisma.smsMessage.count({
                            where: { numberId: num.id }
                        })
                        if (localMsgCount > 0) {
                            await prisma.number.update({
                                where: { id: num.id },
                                data: { status: 'completed' }
                            })

                            if (num.activationId) {
                                await prisma.activation.updateMany({
                                    where: { providerActivationId: num.activationId },
                                    data: { state: 'RECEIVED' }
                                })
                            }
                            logger.info(`[NUMBER-CLEANUP] Number ${num.phoneNumber} saved by local DB messages!`)
                            continue
                        }

                        // 2. Active Cancellation
                        await smsProvider.setCancel(num.activationId)
                        logger.info(`[NUMBER-CLEANUP] Cancelled at provider: ${num.activationId}`)
                    } catch (err: any) {
                        logger.warn(`[NUMBER-CLEANUP] Provider check/cancel failed for ${num.id}: ${err.message}`)
                        // Continue anyway, we need to clear our DB
                    }
                }

                // 3. Mark as Expired in DB
                await prisma.$transaction(async (tx) => {
                    await tx.number.update({
                        where: { id: num.id },
                        data: { status: 'expired' }
                    })

                    // Handle Activation sync via Kernel
                    if (num.activationId) {
                        const activation = await tx.activation.findFirst({
                            where: { providerActivationId: num.activationId }
                        })
                        if (activation && activation.state === 'ACTIVE') {
                            await ActivationKernel.transition(activation.id, 'EXPIRED', {
                                reason: 'Cleanup: Number reached expiry time',
                                tx
                            })
                        }
                    }
                })

                // ENTERPRISE EVENT DISPATCH (Phase 39)
                if (num.ownerId) {
                    await EventDispatcher.dispatch(num.ownerId, 'activation.expired', {
                        numberId: num.id,
                        activationId: num.activationId,
                        phoneNumber: num.phoneNumber,
                        service: num.serviceName,
                        country: num.countryName,
                        reason: 'cleanup_routine'
                    })
                }

                expiredCount++
            } catch (e) {
                logger.error(`[NUMBER-CLEANUP] Failed to expire number ${num.id}`, { error: e })
            }
        }
    } catch (error) {
        logger.error('[NUMBER-CLEANUP] Batch error', { error })
    }

    return expiredCount
}

/**
 * FINANCIAL REAPER: Cleanup Stale Activations (Zombie Funds)
 * Finds activations stuck in RESERVED for > 10 minutes and rolls back funds.
 */
async function cleanupStaleActivations(): Promise<{ freed: number, amount: number }> {
    const STALE_THRESHOLD_MIN = 10
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MIN * 60 * 1000)

    let freedCount = 0
    let recoveredAmount = 0

    try {
        const staleActivations = await prisma.activation.findMany({
            where: {
                state: 'RESERVED',
                createdAt: { lt: cutoff }
            },
            take: BATCH_SIZE
        })

        if (staleActivations.length === 0) return { freed: 0, amount: 0 }

        logger.info(`[FINANCIAL-REAPER] Found ${staleActivations.length} stale reservations (Zombie Funds)`)

        for (const activation of staleActivations) {
            try {
                await prisma.$transaction(async (tx) => {
                    // 1. Rollback Wallet Reservation
                    await WalletService.rollback(
                        activation.userId,
                        activation.price.toNumber(),
                        activation.id,
                        `Anti-Zombie: Stale reservation recovery`,
                        tx as any
                    )

                    // 2. Mark Activation as FAILED via Kernel
                    await ActivationKernel.transition(activation.id, 'FAILED', {
                        reason: 'Cleanup: Zombie fund recovery (Stale Reserved state)',
                        tx
                    })
                })

                freedCount++
                recoveredAmount += activation.price.toNumber()
            } catch (err: any) {
                logger.error(`[FINANCIAL-REAPER] Failed to recover zombie funds for ${activation.id}`, { error: err.message })
            }
        }

        if (freedCount > 0) {
            logger.success(`[FINANCIAL-REAPER] Successfully recovered ${recoveredAmount} points from ${freedCount} zombie activations`)
        }
    } catch (error) {
        logger.error('[FINANCIAL-REAPER] Batch error', { error })
    }

    return { freed: freedCount, amount: recoveredAmount }
}

/**
 * Cleanup old EXPIRED/CANCELLED reservations (housekeeping)
 */
async function purgeOldReservations(olderThanDays = 7): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

    const result = await prisma.offerReservation.deleteMany({
        where: {
            status: { in: ['EXPIRED', 'CANCELLED'] },
            createdAt: { lt: cutoff }
        }
    })

    if (result.count > 0) {
        logger.info(`[RESERVATION-CLEANUP] Purged ${result.count} old reservations`)
    }

    return result.count
}

/**
 * Single cleanup iteration
 */
async function runCleanup(): Promise<void> {
    if (!isRunning) return

    try {
        const res = await cleanupExpiredReservations()
        const numExpired = await cleanupExpiredNumbers()
        const staleRes = await cleanupStaleActivations()

        // Purge old records once per hour (every ~120 iterations)
        if (Math.random() < 0.01) {
            await purgeOldReservations()
        }
    } catch (error) {
        logger.error('[RESERVATION-CLEANUP] Error', { error })
    }
}

/**
 * Start the cleanup worker
 */
export function startReservationCleanup(): void {
    if (isRunning) {
        logger.debug('[RESERVATION-CLEANUP] Already running')
        return
    }

    isRunning = true
    logger.info(`[RESERVATION-CLEANUP] Starting worker (interval: ${CLEANUP_INTERVAL_MS}ms)`)

    // Initial run
    runCleanup()

    // Schedule recurring cleanup
    cleanupInterval = setInterval(runCleanup, CLEANUP_INTERVAL_MS)
}

/**
 * Stop the cleanup worker
 */
export function stopReservationCleanup(): void {
    if (!isRunning) return

    isRunning = false
    if (cleanupInterval) {
        clearInterval(cleanupInterval)
        cleanupInterval = null
    }
    logger.info('[RESERVATION-CLEANUP] Worker stopped')
}

/**
 * Get cleanup worker status
 */
export async function getReservationCleanupStatus() {
    const [pending, expired, total] = await Promise.all([
        prisma.offerReservation.count({ where: { status: 'PENDING' } }),
        prisma.offerReservation.count({ where: { status: 'EXPIRED' } }),
        prisma.offerReservation.count()
    ])

    const stalePending = await prisma.offerReservation.count({
        where: {
            status: 'PENDING',
            expiresAt: { lt: new Date() }
        }
    })

    return {
        running: isRunning,
        intervalMs: CLEANUP_INTERVAL_MS,
        stats: {
            pending,
            stalePending, // These should be 0 if worker is running
            expired,
            total
        }
    }
}

/**
 * Manual trigger for cleanup (useful for testing)
 */
export async function cleanupNow(): Promise<CleanupResult> {
    const res = await cleanupExpiredReservations()
    const numExpired = await cleanupExpiredNumbers()

    return {
        ...res,
        expiredNumbers: numExpired
    }
}
