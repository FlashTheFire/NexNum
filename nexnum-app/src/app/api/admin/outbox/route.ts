/**
 * Admin API: Outbox Status & Controls
 * 
 * Monitoring endpoint for outbox worker health and manual controls.
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/jwt'
import { processOutboxEvents, cleanupProcessedEvents, getOutboxStats } from '@/lib/activation/outbox'

export async function GET(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)
        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const stats = await getOutboxStats()

        return NextResponse.json({
            success: true,
            outbox: {
                running: true, // Always running under MasterWorker
                intervalMs: 10000,
                stats
            }
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
            case 'stop':
                return NextResponse.json({ success: false, message: 'Worker is now managed by the system scheduler.' })

            case 'process':
                const result = await processOutboxEvents(50)
                return NextResponse.json({ success: true, message: `Processed ${result.succeeded} events` })

            case 'cleanup':
                const days = body.days || 7
                const cleanResult = await cleanupProcessedEvents(days)
                return NextResponse.json({
                    success: true,
                    message: `Cleaned up ${cleanResult.count} old events`
                })

            default:
                return NextResponse.json(
                    { error: 'Invalid action. Use: process, cleanup' },
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
