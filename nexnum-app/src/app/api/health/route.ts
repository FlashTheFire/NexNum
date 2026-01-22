import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { getHealthMetrics, metrics, METRIC } from '@/lib/monitoring/metrics'

interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy'
    timestamp: string
    version: string
    uptime: number
    checks: {
        database: CheckResult
        redis: CheckResult
    }
    metrics?: {
        cache: { hitRate: number; hits: number; misses: number }
        requests: { total: number; errors: number; avgLatencyMs: number }
    }
}

interface CheckResult {
    status: 'up' | 'down'
    latency?: number
    error?: string
}

const startTime = Date.now()

/**
 * Health check endpoint for load balancers and monitoring
 * GET /api/health
 * GET /api/health?detailed=true - Include metrics
 */
export async function GET(request: Request) {
    const url = new URL(request.url)
    const detailed = url.searchParams.get('detailed') === 'true'

    const checks: HealthStatus['checks'] = {
        database: { status: 'down' },
        redis: { status: 'down' }
    }

    // Check Database
    try {
        const dbStart = Date.now()
        await prisma.$queryRaw`SELECT 1`
        const dbLatency = Date.now() - dbStart
        checks.database = {
            status: 'up',
            latency: dbLatency
        }
        metrics.recordTiming(METRIC.DB_QUERY_TIME, dbLatency)
    } catch (error) {
        checks.database = {
            status: 'down',
            error: error instanceof Error ? error.message : 'Unknown error'
        }
    }

    // Check Redis
    try {
        const redisStart = Date.now()
        await redis.ping()
        const redisLatency = Date.now() - redisStart
        checks.redis = {
            status: 'up',
            latency: redisLatency
        }
        metrics.recordTiming(METRIC.CACHE_READ_TIME, redisLatency)
    } catch (error) {
        checks.redis = {
            status: 'down',
            error: error instanceof Error ? error.message : 'Unknown error'
        }
    }

    // Determine overall status
    const allUp = Object.values(checks).every(c => c.status === 'up')
    const anyDown = Object.values(checks).some(c => c.status === 'down')

    const health: HealthStatus = {
        status: allUp ? 'healthy' : anyDown ? 'unhealthy' : 'degraded',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        checks
    }

    // Add metrics if detailed view requested
    if (detailed) {
        const hits = metrics.getCounter(METRIC.CACHE_HIT)
        const misses = metrics.getCounter(METRIC.CACHE_MISS)
        const requestStats = metrics.getStats(METRIC.REQUEST_LATENCY)

        health.metrics = {
            cache: {
                hitRate: hits + misses > 0 ? Math.round((hits / (hits + misses)) * 100) : 0,
                hits,
                misses
            },
            requests: {
                total: metrics.getCounter(METRIC.REQUEST_COUNT),
                errors: metrics.getCounter(METRIC.ERROR_COUNT),
                avgLatencyMs: requestStats?.avg || 0
            }
        }
    }

    const httpStatus = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503

    return NextResponse.json(health, { status: httpStatus })
}

