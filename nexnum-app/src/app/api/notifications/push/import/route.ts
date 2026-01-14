import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/jwt'
import { NotificationService } from '@/lib/notifications/notification-service'
import { logger } from '@/lib/core/logger'

/**
 * POST /api/notifications/push/import
 * Admin-only endpoint to import push subscriptions.
 */
export async function POST(req: NextRequest) {
    const user = await getCurrentUser(req.headers)

    // Strict Admin Check
    if (!user || user.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    try {
        const body = await req.json()
        const { targetUserId, subscription } = body

        if (!targetUserId || !subscription || !subscription.endpoint) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
        }

        // Use service to upsert
        await NotificationService.importSubscription(targetUserId, subscription)

        logger.info('[API] Imported subscription', { adminId: user.userId, targetUserId })
        return NextResponse.json({ success: true })
    } catch (error: any) {
        logger.error('[API] Subscription import failed', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
