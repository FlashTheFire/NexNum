import { NextResponse } from 'next/server'
import { AuthGuard } from '@/lib/auth/guard'
import { queue, QUEUES } from '@/lib/core/queue'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const auth = await AuthGuard.requireAdmin()
    if (auth.error) return auth.error

    try {
        const status = await queue.getQueueStatus(QUEUES.PROVIDER_SYNC)

        return NextResponse.json({
            success: true,
            status
        })

    } catch (error) {
        return NextResponse.json({ error: 'Failed to fetch sync status' }, { status: 500 })
    }
}

