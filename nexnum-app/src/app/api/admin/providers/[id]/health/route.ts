import { NextRequest, NextResponse } from 'next/server'
import { healthMonitor } from '@/lib/providers/health-monitor'
import { requireAdmin } from '@/lib/auth/requireAdmin'

/**
 * GET - Get health status for a provider
 * POST - Reset health / close circuit breaker
 */

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params

    try {
        const health = await healthMonitor.getHealth(id)
        return NextResponse.json({ success: true, health })
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const auth = await requireAdmin(req)
    if (auth.error) return auth.error

    const { id } = await params

    try {
        // Reset circuit breaker
        await healthMonitor.closeCircuit(id)

        const health = await healthMonitor.getHealth(id)

        return NextResponse.json({
            success: true,
            message: 'Circuit breaker reset successfully',
            health
        })
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
