import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'

interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy'
    timestamp: string
    version: string
    uptime: number
    checks: {
        database: CheckResult
        redis: CheckResult
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
 */
export async function GET() {
    const checks: HealthStatus['checks'] = {
        database: { status: 'down' },
        redis: { status: 'down' }
    }

    // Check Database
    try {
        const dbStart = Date.now()
        await prisma.$queryRaw`SELECT 1`
        checks.database = {
            status: 'up',
            latency: Date.now() - dbStart
        }
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
        checks.redis = {
            status: 'up',
            latency: Date.now() - redisStart
        }
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

    const httpStatus = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503

    return NextResponse.json(health, { status: httpStatus })
}
