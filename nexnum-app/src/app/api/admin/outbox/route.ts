/**
 * Admin API: Outbox Status & Controls
 * 
 * Monitoring endpoint for outbox worker health and manual controls.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/jwt'
import { getOutboxWorkerStatus, processOutboxNow, startOutboxWorker, stopOutboxWorker } from '@/lib/outbox-worker'
import { cleanupProcessedEvents } from '@/lib/outbox'

export async function GET(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)
        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const status = await getOutboxWorkerStatus()

        return NextResponse.json({
            success: true,
            outbox: status
        })
    } catch (error) {
        console.error('Outbox status error:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to get outbox status' },
            { status: 500 }
        )
    }
}

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)
        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const action = body.action as string

        switch (action) {
            case 'start':
                startOutboxWorker()
                return NextResponse.json({ success: true, message: 'Worker started' })

            case 'stop':
                stopOutboxWorker()
                return NextResponse.json({ success: true, message: 'Worker stopped' })

            case 'process':
                const count = await processOutboxNow()
                return NextResponse.json({ success: true, message: `Processed ${count} events` })

            case 'cleanup':
                const days = body.days || 7
                const result = await cleanupProcessedEvents(days)
                return NextResponse.json({
                    success: true,
                    message: `Cleaned up ${result.count} old events`
                })

            default:
                return NextResponse.json(
                    { error: 'Invalid action. Use: start, stop, process, cleanup' },
                    { status: 400 }
                )
        }
    } catch (error) {
        console.error('Outbox control error:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to execute action' },
            { status: 500 }
        )
    }
}
