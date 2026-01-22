import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api/api-middleware'
import { getCachedBalance } from '@/lib/cache/user-cache'
import { metrics, METRIC, trackCacheHit } from '@/lib/monitoring/metrics'

export async function GET(request: NextRequest) {
    const auth = await authenticateApiKey(request)
    if (!auth.success) return auth.error!

    try {
        const start = Date.now()
        const { balance, currency, fromCache } = await getCachedBalance(auth.context!.userId)
        const duration = Date.now() - start

        // Track metrics
        trackCacheHit(fromCache)
        metrics.recordTiming(METRIC.DB_QUERY_TIME, duration)

        return apiSuccess({
            balance,
            currency,
            _meta: {
                cached: fromCache,
                latencyMs: duration
            }
        })
    } catch (error) {
        console.error('API Balance Error:', error)
        metrics.increment(METRIC.ERROR_COUNT)
        return apiError('Failed to retrieve balance', 500)
    }
}
