
import { NextResponse } from 'next/server'
import { runMasterWorker } from '@/workers/master-worker'

export const dynamic = 'force-dynamic'

/**
 * Unified Worker Endpoint
 * Runs all background tasks: Outbox, Notification, Inbox.
 * Call this every 1-10 seconds via external Cron.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization')
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const result = await runMasterWorker()

        // Return 500 if critical errors occurred, but still return result structure
        const status = result.errors.length > 0 ? 207 : 200 // 207 Multi-Status if partial failure? Or just 200.

        return NextResponse.json({
            success: result.errors.length === 0,
            data: result
        }, { status: 200 }) // Always 200 to prevent Cron from retrying immediately if logic failed?
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
