import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'
import { ActivationState } from '@prisma/client'

/**
 * Calculates reliability scores for all providers based on ACTIVATION history.
 * 
 * THE FORMULA (Fair Reliability):
 * Reliability = (Successful Orders / (Total Considered Orders)) * 100
 * 
 * Rules:
 * 1. Scope: Last 7 Days.
 * 2. Success: State === RECEIVED
 * 3. Failure: State IN [EXPIRED, FAILED, REFUNDED]
 * 4. IGNORED: State === CANCELLED **AND** Duration < 10 Minutes (User changed mind)
 * 5. Counted Failure: State === CANCELLED **AND** Duration >= 10 Minutes (Provider probably failed to send SMS)
 */
export async function calculateProviderReliability() {
    const startTime = Date.now()
    logger.info('[RELIABILITY] Starting Deep Analysis...')

    try {
        const providers = await prisma.provider.findMany({
            where: { isActive: true },
            select: { id: true, name: true }
        })

        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        let updated = 0

        for (const provider of providers) {
            // Fetch all Activations for this provider in last 7 days
            // We need timestamps to calculate duration
            const history = await prisma.activation.findMany({
                where: {
                    providerId: provider.id, // Links to Provider UUID
                    createdAt: { gte: sevenDaysAgo }
                },
                select: {
                    state: true,
                    createdAt: true,
                    updatedAt: true
                }
            })

            if (history.length === 0) {
                // No data? Keep static or reset if needed. Skipping for now to preserve manual defaults.
                continue
            }

            let successful = 0
            let ignored = 0
            let failures = 0

            for (const order of history) {
                if (order.state === ActivationState.RECEIVED || (order.state as any) === 'COMPLETED') {
                    successful++
                    continue
                }

                if (order.state === ActivationState.CANCELLED) {
                    const durationMs = new Date(order.updatedAt).getTime() - new Date(order.createdAt).getTime()
                    const durationMin = durationMs / 1000 / 60

                    if (durationMin < 10) {
                        ignored++
                        continue // User cancelled quickly - ignore
                    } else {
                        failures++ // User waited 10min+, then cancelled -> Provider fault
                    }
                } else if (
                    order.state === ActivationState.EXPIRED ||
                    order.state === ActivationState.FAILED ||
                    order.state === ActivationState.REFUNDED
                ) {
                    failures++
                } else {
                    // Pending states (INIT, RESERVED, ACTIVE) are not final yet
                    continue
                }
            }

            const totalConsidered = successful + failures

            // Calculate Score
            let activeRate = 98.0

            if (totalConsidered > 0) {
                const rawRate = (successful / totalConsidered) * 100

                // Bayesian Averaging for small sample sizes (< 20 orders)
                // We weight towards baseline of 95%
                if (totalConsidered < 20) {
                    const confidence = totalConsidered / 20
                    activeRate = (rawRate * confidence) + (95 * (1 - confidence))
                } else {
                    activeRate = rawRate
                }
            }

            // Database Update
            // Note: successRate field must exist in schema
            await prisma.provider.update({
                where: { id: provider.id },
                data: {
                    successRate: activeRate,
                    totalOrders: totalConsidered // Store considered orders (not raw total)
                }
            })

            // Log analysis for audit
            if (totalConsidered > 5) {
                logger.debug(`[RELIABILITY] Provider ${provider.name}: ${activeRate.toFixed(1)}% (S:${successful} F:${failures} Ignored:${ignored})`)
            }

            updated++
        }

        const duration = (Date.now() - startTime) / 1000
        logger.info(`[RELIABILITY] Updated ${updated} providers in ${duration}s`)
        return updated

    } catch (error) {
        logger.error('[RELIABILITY] Calculation failed', { error })
        return 0
    }
}
