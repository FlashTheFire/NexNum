import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { queue } from '@/lib/core/queue'

/**
 * Professional Health Check API
 * Used by Docker, Kubernetes, and PM2 to monitor service health.
 * Performs deep checks of core dependencies.
 */
export async function GET() {
    const status: any = {
        status: 'UP',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV,
        services: {
            database: 'UNKNOWN',
            queue: 'UNKNOWN',
            memory: 'OK'
        }
    }

    try {
        // 1. Check Database (Prisma)
        await prisma.$queryRaw`SELECT 1`
        status.services.database = 'UP'
    } catch (e: any) {
        status.status = 'DEGRADED'
        status.services.database = 'DOWN'
        status.services.database_error = e.message
    }

    try {
        // 2. Check Queue (PgBoss Status)
        // We use a light check - if the service is ready in memory
        status.services.queue = (queue as any).isReady ? 'UP' : 'DOWN'
    } catch (e) {
        status.services.queue = 'DOWN'
    }

    // 3. System Metrics
    const used = process.memoryUsage().heapUsed / 1024 / 1024
    status.services.memory = `${Math.round(used * 100) / 100} MB`

    // Determine final status code
    const statusCode = status.status === 'UP' ? 200 : 503

    return NextResponse.json(status, { status: statusCode })
}

// Next.js Config: Force Dynamic usage and allow long timeouts for deep checks
export const dynamic = 'force-dynamic'
export const maxDuration = 10 
