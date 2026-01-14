
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/jwt'
import { prisma } from '@/lib/core/db'
import { NotificationService } from '@/lib/notifications/notification-service'

export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser(req.headers)
        if (!user || user.role !== 'ADMIN') {
            return new NextResponse('Unauthorized: Admin only', { status: 403 })
        }

        const body = await req.json()
        const { title, message, url } = body

        if (!title || !message) {
            return new NextResponse('Missing title or message', { status: 400 })
        }

        // 1. Get all unique users with active subscriptions
        const subscriptions = await prisma.pushSubscription.findMany({
            select: { userId: true },
            distinct: ['userId']
        })

        const userIds = subscriptions.map(s => s.userId)

        console.log(`[Broadcast] Starting broadcast to ${userIds.length} users...`)

        // 2. Enqueue notifications
        const results = {
            total: userIds.length,
            success: 0,
            failed: 0,
            logs: [] as string[]
        }

        for (const targetId of userIds) {
            try {
                await NotificationService.createNotification({
                    userId: targetId,
                    type: 'system',
                    title: title,
                    message: message,
                    data: {
                        url: url || '/dashboard',
                        broadcastId: Date.now()
                    }
                })
                results.success++
                results.logs.push(`✓ Queued for User ${targetId.slice(0, 8)}...`)
            } catch (err: any) {
                results.failed++
                results.logs.push(`✗ Failed for User ${targetId.slice(0, 8)}...: ${err.message}`)
            }
        }

        return NextResponse.json({
            success: true,
            data: results
        })

    } catch (error) {
        console.error('[Broadcast] Critical failure:', error)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
