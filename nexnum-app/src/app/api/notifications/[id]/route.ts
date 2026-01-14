import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/jwt'
import { NotificationService } from '@/lib/notifications/notification-service'

/**
 * PATCH /api/notifications/[id] - Mark single notification as read
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser(req.headers)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    try {
        await NotificationService.markAsRead(id, user.userId)
        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('[Notifications API] Error:', error)
        return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 })
    }
}

/**
 * DELETE /api/notifications/[id] - Delete a notification
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser(req.headers)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    try {
        await NotificationService.deleteNotification(id, user.userId)
        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('[Notifications API] Error:', error)
        return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 })
    }
}
