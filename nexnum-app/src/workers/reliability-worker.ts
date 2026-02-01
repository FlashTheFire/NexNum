import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'

/**
 * Calculates reliability scores for all providers based on real order history.
 * Formula: Success Rate = (Completed Orders / Total Orders) * 100
 * Only counts orders from the last 7 days to keep stats fresh.
 */
export async function calculateProviderReliability() {
    const startTime = Date.now()
    logger.info('[RELIABILITY] Starting provider reliability calculation...')

    try {
        const providers = await prisma.provider.findMany({
            where: { isActive: true }
        })

        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        let updated = 0

        for (const provider of providers) {
            // 1. Get stats from Number history (assuming 'purchasedAt' indicates an attempt)
            // 'status' could be: available, sold, refunded, banned
            // A "Success" is a Sold number that wasn't refunded/banned.

            // Total Attempts: All numbers occupied/sold by this provider in last 7 days
            const totalOrders = await prisma.number.count({
                where: {
                    provider: provider.name,
                    purchasedAt: { gte: sevenDaysAgo }
                }
            })

            if (totalOrders === 0) {
                // Keep default or previous if no recent data
                continue
            }

            // Failures: Numbers that were refunded or marked as error
            // (Assumes you have a status for failure, e.g. 'refunded' or 'failed')
            // If explicit status missing, we look for errorCount > 0
            const failedOrders = await prisma.number.count({
                where: {
                    provider: provider.name,
                    purchasedAt: { gte: sevenDaysAgo },
                    status: { in: ['refunded', 'failed', 'banned'] }
                }
            })

            const successCount = totalOrders - failedOrders
            const rawRate = (successCount / totalOrders) * 100

            // Dampening factor: small sample size shouldn't swing rate wildly
            // If < 10 orders, bias towards 95%
            const effectiveRate = totalOrders < 10
                ? (rawRate * 0.5) + (95 * 0.5)
                : rawRate

            await prisma.provider.update({
                where: { id: provider.id },
                data: {
                    successRate: effectiveRate,
                    totalOrders: totalOrders
                }
            })
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
