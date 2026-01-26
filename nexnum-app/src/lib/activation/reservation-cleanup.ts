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

// Configuration
const CLEANUP_INTERVAL_MS = 30000 // 30 seconds
const BATCH_SIZE = 100

let isRunning = false
let cleanupInterval: NodeJS.Timeout | null = null

interface CleanupResult {
    expiredReservations: number
    expiredNumbers: number
    stockRestored: number
    errors: number
}

/**
 * Find and expire stale reservations
 */
async function cleanupExpiredReservations(): Promise<CleanupResult> {
    const result: CleanupResult = { expiredReservations: 0, expiredNumbers: 0, stockRestored: 0, errors: 0 }

    try {
        // Find expired PENDING reservations
        const expiredReservations = await prisma.offerReservation.findMany({
            where: {
                status: 'PENDING',
                expiresAt: { lt: new Date() }
            },
            include: {
                pricing: true
            },
            take: BATCH_SIZE
        })

        if (expiredReservations.length === 0) {
            return result
        }

        logger.info(`[RESERVATION-CLEANUP] Found ${expiredReservations.length} expired reservations`)

        for (const reservation of expiredReservations) {
            try {
                await prisma.$transaction(async (tx) => {
                    // Mark reservation as expired
                    await tx.offerReservation.update({
                        where: { id: reservation.id },
                        data: { status: 'EXPIRED' }
                    })

                    // Restore stock to the pricing record
                    await tx.providerPricing.update({
                        where: { id: reservation.pricingId },
                        data: { stock: { increment: reservation.quantity } }
                    })

                    // Publish outbox event for MeiliSearch sync
                    await publishOutboxEvent({
                        aggregateType: 'offer',
                        aggregateId: reservation.pricingId,
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

    return {
        expiredReservations: result.expiredReservations,
        expiredNumbers: 0,
        stockRestored: result.stockRestored,
        errors: result.errors
    }
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
                                // Sync Activation state too
                                const activation = await prisma.activation.findFirst({
                                    where: { providerActivationId: num.activationId }
                                })
                                if (activation) {
                                    await prisma.activation.update({
                                        where: { id: activation.id },
                                        data: { state: 'RECEIVED' }
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
                        await smsProvider.cancelNumber(num.activationId)
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

                    // Handle Activation sync
                    if (num.activationId) {
                        const activation = await tx.activation.findFirst({
                            where: { providerActivationId: num.activationId }
                        })
                        if (activation && activation.state === 'ACTIVE') {
                            await tx.activation.update({
                                where: { id: activation.id },
                                data: { state: 'EXPIRED' }
                            })
                        }
                    }
                })

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
        await cleanupExpiredReservations()
        await cleanupExpiredNumbers()

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
