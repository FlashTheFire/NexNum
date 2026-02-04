/**
 * POST /api/admin/heartbeat - Manually trigger pricing heartbeat
 * GET /api/admin/heartbeat - Get heartbeat status
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'
import { runPricingHeartbeat } from '@/lib/tasks/pricing-heartbeat'
import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'

export const POST = apiHandler(async () => {
    // Run the heartbeat manually
    const result = await runPricingHeartbeat()

    return ResponseFactory.success({
        message: result.success ? 'Heartbeat completed successfully' : 'Heartbeat failed',
        ...result
    })
}, { requiresAuth: true })

export const GET = apiHandler(async () => {
    // Get current heartbeat status
    const settings = await prisma.systemSettings.findFirst()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const settingsAny = settings as any

    const lastRunFromRedis = await redis.get('heartbeat:lastRun')

    return ResponseFactory.success({
        enabled: settingsAny?.heartbeatEnabled ?? false,
        intervalMins: settingsAny?.heartbeatIntervalMins ?? 60,
        lastRun: settingsAny?.heartbeatLastRun || lastRunFromRedis || null
    })
}, { requiresAuth: true })
