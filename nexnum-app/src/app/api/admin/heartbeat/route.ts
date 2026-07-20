/**
 * POST /api/admin/heartbeat - Manually trigger pricing heartbeat (ADMIN ONLY)
 * GET /api/admin/heartbeat - Get heartbeat status (ADMIN ONLY)
 */

import { NextResponse } from 'next/server'
import { AuthGuard } from '@/lib/auth/guard'
import { ResponseFactory } from '@/lib/api/response-factory'
import { runPricingHeartbeat } from '@/lib/tasks/pricing-heartbeat'
import { redis } from '@/lib/core/redis'

export async function POST() {
    const { error } = await AuthGuard.requireAdmin()
    if (error) return error

    // Run the heartbeat manually
    const result = await runPricingHeartbeat()

    return ResponseFactory.success({
        message: result.success ? 'Heartbeat completed successfully' : 'Heartbeat failed',
        ...result
    })
}

export async function GET() {
    const { error } = await AuthGuard.requireAdmin()
    if (error) return error

    // M-NEW-1 follow-up: heartbeat config also lives in Redis now (no systemSettings model)
    const [lastRun, enabledRaw, intervalRaw] = await Promise.all([
        redis.get('heartbeat:lastRun'),
        redis.get('system:heartbeat_enabled'),
        redis.get('system:heartbeat_interval_mins'),
    ])

    return ResponseFactory.success({
        enabled: enabledRaw === null ? true : enabledRaw === 'true',
        intervalMins: intervalRaw ? parseInt(intervalRaw, 10) : 60,
        lastRun: lastRun || null
    })
}
