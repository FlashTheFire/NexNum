import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'

/**
 * Calculates reliability scores for all providers based on ALL-TIME order history.
 * 
 * OPTIMIZATION (V3):
 * Switching to Raw SQL Aggregation.
 * - Previous JS-Loop method would crash on large datasets ("All Time" requirement).
 * - SQL calculates 1M+ rows in milliseconds.
 * 
 * FORMULA:
 * - Total Considered = Total - Ignored
 * - Ignored = Cancelled < 10 mins
 * - Success = RECEIVED
 */
export async function calculateProviderReliability() {
    const startTime = Date.now()
    logger.info('[RELIABILITY] Starting ALL-TIME Deep Analysis (SQL Engine)...')

    try {
        const providers = await prisma.provider.findMany({
            where: { isActive: true },
            select: { id: true, name: true }
        })

        let updated = 0

        for (const provider of providers) {
            // Raw SQL for high-performance extraction of "Duration" logic
            // Postgres 'age' or subtraction works for timestamps.

            /* 
               We need Counts for:
               1. Successful (state = RECEIVED)
               2. Ignored (state = CANCELLED AND duration < 10 min)
               3. Total (All records)
            */

            const stats = await prisma.$queryRaw<Array<{
                total: bigint,
                successful: bigint,
                ignored: bigint
            }>>`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN state = 'RECEIVED' THEN 1 ELSE 0 END) as successful,
                    SUM(CASE 
                        WHEN state = 'CANCELLED' AND (EXTRACT(EPOCH FROM (updated_at - created_at)) / 60) < 10 
                        THEN 1 
                        ELSE 0 
                    END) as ignored
                FROM activations 
                WHERE provider_id = ${provider.id}
            `;

            const row = stats[0]
            if (!row || Number(row.total) === 0) continue;

            const total = Number(row.total)
            const successful = Number(row.successful || 0)
            const ignored = Number(row.ignored || 0)

            const totalConsidered = total - ignored

            let activeRate = 98.0

            if (totalConsidered > 0) {
                const rawRate = (successful / totalConsidered) * 100

                // Bayesian Smoothing for < 20 orders
                if (totalConsidered < 20) {
                    const confidence = totalConsidered / 20
                    activeRate = (rawRate * confidence) + (95 * (1 - confidence))
                } else {
                    activeRate = rawRate
                }
            }

            // Cap at 100, floor at 0
            activeRate = Math.min(100, Math.max(0, activeRate))

            await prisma.provider.update({
                where: { id: provider.id },
                data: {
                    successRate: activeRate,
                    totalOrders: totalConsidered // We display "Valid Orders" not raw attempts
                }
            })

            // Log details if significant
            if (totalConsidered > 5) {
                logger.debug(`[RELIABILITY] ${provider.name}: ${activeRate.toFixed(1)}% (Orders:${totalConsidered} Ignored:${ignored})`)
            }

            updated++
        }

        const duration = (Date.now() - startTime) / 1000
        logger.info(`[RELIABILITY] Full Scale Analysis Complete. Updated ${updated} providers in ${duration}s`)
        return updated

    } catch (error) {
        logger.error('[RELIABILITY] Calculation failed', { error })
        return 0
    }
}
