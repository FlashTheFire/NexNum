/**
 * Pricing Heartbeat Task
 * 
 * Background task that periodically updates exchange rates and re-computes
 * multi-currency prices in MeiliSearch to keep search results accurate.
 * 
 * @module lib/tasks/pricing-heartbeat
 */

import { prisma } from '@/lib/core/db'
import { getCurrencyService } from '@/lib/currency/currency-service'
import { meili, INDEXES } from '@/lib/search/search'
import { redis, CACHE_KEYS } from '@/lib/core/redis'

interface HeartbeatResult {
    success: boolean
    updatedCount: number
    duration: number
    error?: string
}

/**
 * Run the pricing heartbeat task
 * - Fetches latest exchange rates
 * - Updates all offer prices in MeiliSearch with new currency values
 */
export async function runPricingHeartbeat(): Promise<HeartbeatResult> {
    const startTime = Date.now()

    try {
        // 1. Check if heartbeat is enabled
        const settings = await prisma.systemSettings.findFirst()
        // 1. Check if heartbeat is enabled (field added by migration)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const settingsAny = settings as any
        if (!settingsAny?.heartbeatEnabled) {
            return {
                success: true,
                updatedCount: 0,
                duration: Date.now() - startTime,
                error: 'Heartbeat disabled'
            }
        }

        // 2. Get currency service
        const currencyService = getCurrencyService()

        // 3. Get all offers from MeiliSearch
        const index = meili.index(INDEXES.OFFERS)

        // Fetch all documents in batches
        const BATCH_SIZE = 1000
        let offset = 0
        let totalUpdated = 0
        const updatedDocuments: any[] = []

        while (true) {
            const results = await index.getDocuments({
                limit: BATCH_SIZE,
                offset,
                fields: ['id', 'pointPrice', 'rawPrice']
            })

            if (results.results.length === 0) break

            // 4. Re-compute multi-currency prices for each offer
            for (const doc of results.results) {
                const pointPrice = Number(doc.pointPrice) || 0
                const currencyPrices = await currencyService.pointsToAllFiat(pointPrice)

                updatedDocuments.push({
                    id: doc.id,
                    currencyPrices,
                    lastPriceUpdate: Date.now()
                })
            }

            offset += BATCH_SIZE
            if (results.results.length < BATCH_SIZE) break
        }

        // 5. Push updates to MeiliSearch
        if (updatedDocuments.length > 0) {
            await index.updateDocuments(updatedDocuments, { primaryKey: 'id' })
            totalUpdated = updatedDocuments.length
        }

        // 6. Update last run timestamp in Redis
        const now = new Date()
        await redis.set('heartbeat:lastRun', now.toISOString())
        // Note: heartbeatLastRun field will exist after Prisma migration

        console.log(`[PricingHeartbeat] Updated ${totalUpdated} offers in ${Date.now() - startTime}ms`)

        return {
            success: true,
            updatedCount: totalUpdated,
            duration: Date.now() - startTime
        }

    } catch (error) {
        console.error('[PricingHeartbeat] Error:', error)
        return {
            success: false,
            updatedCount: 0,
            duration: Date.now() - startTime,
            error: error instanceof Error ? error.message : 'Unknown error'
        }
    }
}

/**
 * Schedule the heartbeat task to run at the configured interval
 */
let heartbeatInterval: NodeJS.Timeout | null = null

export function startHeartbeatScheduler(intervalMins: number = 60) {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
    }

    const intervalMs = intervalMins * 60 * 1000

    console.log(`[PricingHeartbeat] Scheduler started with ${intervalMins}min interval`)

    heartbeatInterval = setInterval(async () => {
        await runPricingHeartbeat()
    }, intervalMs)

    // Run immediately on start
    runPricingHeartbeat()
}

export function stopHeartbeatScheduler() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = null
        console.log('[PricingHeartbeat] Scheduler stopped')
    }
}
