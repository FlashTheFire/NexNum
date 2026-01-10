/**
 * Admin API: Reservation Cleanup Status & Controls
 */

import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/jwt'
import {
    getReservationCleanupStatus,
    cleanupNow,
    startReservationCleanup,
    stopReservationCleanup
} from '@/lib/activation/reservation-cleanup'

export async function GET(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)
        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const status = await getReservationCleanupStatus()

        return NextResponse.json({
            success: true,
            reservations: status
        })
    } catch (error) {
        console.error('Reservation status error:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to get status' },
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
                startReservationCleanup()
                return NextResponse.json({ success: true, message: 'Cleanup worker started' })

            case 'stop':
                stopReservationCleanup()
                return NextResponse.json({ success: true, message: 'Cleanup worker stopped' })

            case 'cleanup':
                const result = await cleanupNow()
                return NextResponse.json({
                    success: true,
                    message: `Expired ${result.expired} reservations, restored ${result.stockRestored} stock`,
                    result
                })

            default:
                return NextResponse.json(
                    { error: 'Invalid action. Use: start, stop, cleanup' },
                    { status: 400 }
                )
        }
    } catch (error) {
        console.error('Reservation control error:', error)
        return NextResponse.json(
            { success: false, error: 'Failed to execute action' },
            { status: 500 }
        )
    }
}
