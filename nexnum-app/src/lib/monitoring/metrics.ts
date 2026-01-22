/**
 * Application Metrics
 * 
 * Lightweight metrics collection for observability.
 * Tracks request latency, cache hits, and database performance.
 */

import { redis } from '@/lib/core/redis'

// ============================================================================
// Metrics Storage (In-Memory for simplicity, use Redis for multi-instance)
// ============================================================================

interface MetricData {
    count: number
    total: number
    min: number
    max: number
    lastUpdated: number
}

class MetricsCollector {
    private metrics = new Map<string, MetricData>()
    private counters = new Map<string, number>()

    // Track a timing metric (e.g., request latency)
    recordTiming(name: string, durationMs: number): void {
        const existing = this.metrics.get(name) || {
            count: 0,
            total: 0,
            min: Infinity,
            max: 0,
            lastUpdated: 0
        }

        existing.count++
        existing.total += durationMs
        existing.min = Math.min(existing.min, durationMs)
        existing.max = Math.max(existing.max, durationMs)
        existing.lastUpdated = Date.now()

        this.metrics.set(name, existing)
    }

    // Increment a counter
    increment(name: string, value: number = 1): void {
        const existing = this.counters.get(name) || 0
        this.counters.set(name, existing + value)
    }

    // Get metric stats
    getStats(name: string): { avg: number; min: number; max: number; count: number } | null {
        const data = this.metrics.get(name)
        if (!data || data.count === 0) return null

        return {
            avg: Math.round(data.total / data.count),
            min: data.min === Infinity ? 0 : data.min,
            max: data.max,
            count: data.count
        }
    }

    // Get counter value
    getCounter(name: string): number {
        return this.counters.get(name) || 0
    }

    // Get all metrics for dashboard
    getAllMetrics(): Record<string, any> {
        const result: Record<string, any> = {
            timings: {},
            counters: {}
        }

        for (const [name, data] of this.metrics) {
            if (data.count > 0) {
                result.timings[name] = {
                    avg: Math.round(data.total / data.count),
                    min: data.min === Infinity ? 0 : data.min,
                    max: data.max,
                    count: data.count
                }
            }
        }

        for (const [name, value] of this.counters) {
            result.counters[name] = value
        }

        return result
    }

    // Reset all metrics (call periodically to avoid memory growth)
    reset(): void {
        this.metrics.clear()
        this.counters.clear()
    }
}

export const metrics = new MetricsCollector()

// ============================================================================
// Metric Names
// ============================================================================

export const METRIC = {
    // Request timing
    REQUEST_LATENCY: 'http.request.latency',
    DB_QUERY_TIME: 'db.query.time',
    CACHE_READ_TIME: 'cache.read.time',

    // Counters
    CACHE_HIT: 'cache.hit',
    CACHE_MISS: 'cache.miss',
    REQUEST_COUNT: 'http.request.count',
    ERROR_COUNT: 'http.error.count',
    DB_QUERY_COUNT: 'db.query.count',
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Track cache hit/miss
 */
export function trackCacheHit(hit: boolean): void {
    metrics.increment(hit ? METRIC.CACHE_HIT : METRIC.CACHE_MISS)
}

/**
 * Calculate cache hit rate percentage
 */
export function calculateHitRate(hits: number, misses: number): number {
    const total = hits + misses
    if (total === 0) return 0
    return Math.round((hits / total) * 100 * 100) / 100
}

/**
 * Get current cache hit rate
 */
export function getCacheHitRate(): number {
    const hits = metrics.getCounter(METRIC.CACHE_HIT)
    const misses = metrics.getCounter(METRIC.CACHE_MISS)
    return calculateHitRate(hits, misses)
}

// ============================================================================
// Health Check Data
// ============================================================================

export async function getHealthMetrics(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    uptime: number
    redis: { connected: boolean; latency?: number }
    database: { connected: boolean; latency?: number }
    cache: { hitRate: number }
    requests: { total: number; errors: number; avgLatency: number }
}> {
    const startTime = process.env.START_TIME ? parseInt(process.env.START_TIME) : Date.now()

    // Check Redis
    let redisOk = false
    let redisLatency: number | undefined
    try {
        const redisStart = Date.now()
        await redis.ping()
        redisLatency = Date.now() - redisStart
        redisOk = true
    } catch {
        redisOk = false
    }

    // Check Database (via Prisma health query)
    let dbOk = false
    let dbLatency: number | undefined
    try {
        const { prisma } = await import('@/lib/core/db')
        const dbStart = Date.now()
        await prisma.$queryRaw`SELECT 1`
        dbLatency = Date.now() - dbStart
        dbOk = true
    } catch {
        dbOk = false
    }

    // Calculate status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (!redisOk && !dbOk) status = 'unhealthy'
    else if (!redisOk || !dbOk) status = 'degraded'

    const requestStats = metrics.getStats(METRIC.REQUEST_LATENCY)

    return {
        status,
        uptime: Math.round((Date.now() - startTime) / 1000),
        redis: {
            connected: redisOk,
            latency: redisLatency
        },
        database: {
            connected: dbOk,
            latency: dbLatency
        },
        cache: {
            hitRate: getCacheHitRate()
        },
        requests: {
            total: metrics.getCounter(METRIC.REQUEST_COUNT),
            errors: metrics.getCounter(METRIC.ERROR_COUNT),
            avgLatency: requestStats?.avg || 0
        }
    }
}
