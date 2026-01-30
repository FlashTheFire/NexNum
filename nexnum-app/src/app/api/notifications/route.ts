
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/jwt'
import { NotificationService } from '@/lib/notifications/notification-service'
import { logger } from '@/lib/core/logger'

/**
 * GET /api/notifications - Get user's notifications (Cursor Paginator)
 */
export async function GET(req: NextRequest) {
    const user = await getCurrentUser(req.headers)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const cursor = searchParams.get('cursor') || undefined

    try {
        // Fetch items (limit + 1 to check for next page)
        const notifications = await NotificationService.getNotifications(user.userId, limit, cursor)
        const unreadCount = await NotificationService.getUnreadCount(user.userId)

        let nextCursor: string | undefined = undefined
        if (notifications.length > limit) {
            const nextItem = notifications.pop()
            nextCursor = notifications[notifications.length - 1].id // Use last item of current page as cursor
            // No wait, if we pop, we removed the last one. 
            // Logic check: take(limit + 1). If length > limit, pop last (which is the +1 item).
            // NO. Prisma cursor pagination: next cursor is the ID of the last item in the *returned page*.
            // The +1 item IS the start of the next page, but typically cursors point to the *last fetched item*.

            // Correction:
            // We fetched limit + 1. 
            // The items to show are notifications.slice(0, limit).
            // If notifications.length > limit, there is a next page.
            // The cursor for the next fetch is the ID of the LAST item in the valid set (index limit-1).
            // Actually, Prisma's `skip: 1` strategy means we pass the ID of the item we *just saw*.

            // Let's stick to standard practice:
            // 1. Fetch N+1.
            // 2. If length > N, nextCursor = id of item[N-1] (the last real item).

            // Wait, if I use `cursor` pointing to the last item, standard prisma usage is:
            // fetch(..., cursor: {id: last_id}, skip: 1).
            // So yes, `nextCursor` should be the ID of the last item in the *current* page (excluding the +1 check item).

            // Wait, if I popped the +1, the array now has `limit` items.
            // The last item is `notifications[limit-1]`.
            // Yes. That ID is the cursor for next page.

            // Re-reading logic below:
            // nextItem is popped (the 11th item).
            // nextCursor = notifications[notifications.length - 1].id (the 10th item).
            // Correct.
        }

        return NextResponse.json({
            success: true,
            notifications: notifications.map(n => ({
                id: n.id,
                type: n.type,
                title: n.title,
                message: n.message,
                data: n.data,
                read: n.read,
                createdAt: n.createdAt.toISOString(),
            })),
            nextCursor,
            unreadCount,
        })
    } catch (error: any) {
        logger.error('Failed to fetch notifications', { error, context: 'API_NOTIFICATIONS' })
        return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
    }
}

/**
 * POST /api/notifications - Mark all as read
 */
export async function POST(req: NextRequest) {
    const user = await getCurrentUser(req.headers)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const body = await req.json().catch(() => ({}))

        if (body.action === 'markAllAsRead') {
            await NotificationService.markAllAsRead(user.userId)
            return NextResponse.json({ success: true, message: 'All notifications marked as read' })
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    } catch (error: any) {
        logger.error('Failed to update notifications', { error, context: 'API_NOTIFICATIONS' })
        return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
    }
}
