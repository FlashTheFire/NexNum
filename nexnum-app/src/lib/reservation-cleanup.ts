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

import { prisma } from './db'
import { publishOutboxEvent } from './outbox'

// Configuration
const CLEANUP_INTERVAL_MS = 30000 // 30 seconds
const BATCH_SIZE = 100

let isRunning = false
let cleanupInterval: NodeJS.Timeout | null = null

interface CleanupResult {
    expired: number
    stockRestored: number
    errors: number
}

/**
 * Find and expire stale reservations
 */
async function cleanupExpiredReservations(): Promise<CleanupResult> {
    const result: CleanupResult = { expired: 0, stockRestored: 0, errors: 0 }

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

        console.log(`[RESERVATION-CLEANUP] Found ${expiredReservations.length} expired reservations`)

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

                result.expired++
                result.stockRestored += reservation.quantity

            } catch (error) {
                console.error(`[RESERVATION-CLEANUP] Failed to expire reservation ${reservation.id}:`, error)
                result.errors++
            }
        }

        console.log(`[RESERVATION-CLEANUP] Expired ${result.expired} reservations, restored ${result.stockRestored} stock`)

    } catch (error) {
        console.error('[RESERVATION-CLEANUP] Batch error:', error)
    }

    return result
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
        console.log(`[RESERVATION-CLEANUP] Purged ${result.count} old reservations`)
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

        // Purge old records once per hour (every ~120 iterations)
        if (Math.random() < 0.01) {
            await purgeOldReservations()
        }
    } catch (error) {
        console.error('[RESERVATION-CLEANUP] Error:', error)
    }
}

/**
 * Start the cleanup worker
 */
export function startReservationCleanup(): void {
    if (isRunning) {
        console.log('[RESERVATION-CLEANUP] Already running')
        return
    }

    isRunning = true
    console.log(`[RESERVATION-CLEANUP] Starting worker (interval: ${CLEANUP_INTERVAL_MS}ms)`)

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
    console.log('[RESERVATION-CLEANUP] Worker stopped')
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
    return cleanupExpiredReservations()
}
