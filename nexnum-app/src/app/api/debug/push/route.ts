
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/jwt'
import { NotificationService } from '@/lib/notifications/notification-service'

export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser(req.headers)
        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 })
        }

        // Create a test notification
        // This will triggers DB creation + Queue Push -> Worker -> Device
        await NotificationService.createNotification({
            userId: user.userId,
            type: 'system',
            title: 'Test Notification 🔔',
            message: 'This is a test alert from NexNum. If you see this, background push is working!',
            data: {
                url: '/dashboard',
                testTimestamp: Date.now()
            }
        })

        return NextResponse.json({ success: true, message: 'Test notification enqueued' })

    } catch (error) {
        console.error('[Debug] Failed to send test push:', error)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
