import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { meili } from '@/lib/search/search'
import { registry, system_memory_usage, process_cpu_usage, system_uptime } from '@/lib/metrics'
import os from 'os'

export const dynamic = 'force-dynamic'

export async function GET() {
    const start = Date.now()
    const health = {
        database: { status: 'unknown', latency: 0 },
        redis: { status: 'unknown', latency: 0 },
        meilisearch: { status: 'unknown', latency: 0 },
        system: {
            uptime: os.uptime(),
            memory: {
                total: os.totalmem(),
                free: os.freemem(),
                used: os.totalmem() - os.freemem(),
                usage_percent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)
            },
            cpu: {
                load: os.loadavg(),
                cores: os.cpus().length
            }
        }
    }

    // 1. Database Check
    const dbStart = Date.now()
    try {
        await prisma.$queryRaw`SELECT 1`
        health.database = { status: 'healthy', latency: Date.now() - dbStart }
    } catch (e) {
        health.database = { status: 'unhealthy', latency: Date.now() - dbStart }
        console.error('Health Check DB Failed:', e)
    }

    // 2. Redis Check
    const redisStart = Date.now()
    try {
        await redis.ping()
        health.redis = { status: 'healthy', latency: Date.now() - redisStart }
    } catch (e) {
        health.redis = { status: 'unhealthy', latency: Date.now() - redisStart }
        console.error('Health Check Redis Failed:', e)
    }

    // 3. MeiliSearch Check
    const meiliStart = Date.now()
    try {
        const stats = await meili.health()
        health.meilisearch = { status: stats.status === 'available' ? 'healthy' : 'degraded', latency: Date.now() - meiliStart }
    } catch (e) {
        health.meilisearch = { status: 'unhealthy', latency: Date.now() - meiliStart }
        console.error('Health Check MeiliSearch Failed:', e)
    }

    // Update Prometheus System Metrics
    system_memory_usage.set({ type: 'used' }, health.system.memory.used)
    system_memory_usage.set({ type: 'total' }, health.system.memory.total)
    process_cpu_usage.set(health.system.cpu.load[0]) // 1 min load avg
    system_uptime.set(health.system.uptime)

    return NextResponse.json({
        ok: true,
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
        services: health
    })
}
