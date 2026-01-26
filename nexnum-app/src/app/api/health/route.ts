import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { queue } from '@/lib/core/queue'

interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy'
    timestamp: string
    version: string
    checks: {
        database: { ok: boolean; latencyMs?: number; error?: string }
        redis: { ok: boolean; latencyMs?: number; error?: string }
        queue: { ok: boolean; error?: string }
    }
}

export async function GET() {
    const start = Date.now()
    const checks: HealthStatus['checks'] = {
        database: { ok: false },
        redis: { ok: false },
        queue: { ok: false }
    }

    // 1. Database Check
    try {
        const dbStart = Date.now()
        await prisma.$queryRaw`SELECT 1`
        checks.database = { ok: true, latencyMs: Date.now() - dbStart }
    } catch (e: any) {
        checks.database = { ok: false, error: e.message }
    }

    // 2. Redis Check
    try {
        const redisStart = Date.now()
        await redis.ping()
        checks.redis = { ok: true, latencyMs: Date.now() - redisStart }
    } catch (e: any) {
        checks.redis = { ok: false, error: e.message }
    }

    // 3. Queue Check (via pg-boss table existence)
    try {
        const queueCheck = await prisma.$queryRaw`SELECT 1 FROM pgboss.job LIMIT 1`
        checks.queue = { ok: true }
    } catch (e: any) {
        // Table might not exist yet, that's ok in fresh installs
        checks.queue = { ok: false, error: 'Queue schema not initialized' }
    }

    // Determine overall status
    const allOk = checks.database.ok && checks.redis.ok
    const anyFailed = !checks.database.ok || !checks.redis.ok

    const status: HealthStatus = {
        status: allOk ? 'healthy' : (anyFailed ? 'unhealthy' : 'degraded'),
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        checks
    }

    return NextResponse.json(status, {
        status: status.status === 'healthy' ? 200 : 503,
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
    })
}
