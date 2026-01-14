
import { queue, QUEUES } from '@/lib/core/queue'
import { prisma } from '@/lib/core/db'
import webpush from 'web-push'
import { logger } from '@/lib/core/logger'

// Initialize VAPID
if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:support@nexnum.com',
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    )
}

interface NotificationJob {
    notificationId: string
    userId: string
    title: string
    message: string
    data?: any
}

interface ProcessResult {
    processed: number
    succeeded: number
    failed: number
}

/**
 * Process a batch of pending push notifications
 * Intended to be called via Cron/API
 */
export async function processPushBatch(batchSize = 20): Promise<ProcessResult> {
    const result: ProcessResult = { processed: 0, succeeded: 0, failed: 0 }

    // Fetch batch of jobs
    const jobs = await queue.fetch(QUEUES.NOTIFICATION_DELIVERY, batchSize) as any[]

    if (!jobs || jobs.length === 0) {
        return result
    }

    logger.debug(`[PushWorker] Processing batch of ${jobs.length} jobs`)

    for (const job of jobs) {
        const { notificationId, userId, title, message, data } = job.data
        result.processed++

        try {
            // 1. Check Preferences
            // Fetch prefs fresh to ensure we respect latest user choice
            const prefs = await prisma.notificationPreferences.findUnique({
                where: { userId }
            })

            const pushEnabled = prefs ? prefs.pushEnabled : true

            if (!pushEnabled) {
                logger.debug('[PushWorker] Push suppressed by user preference', { userId, notificationId })
                await queue.complete(QUEUES.NOTIFICATION_DELIVERY, job.id) // Done
                continue
            }

            // 2. Fetch Subscriptions
            const subscriptions = await prisma.pushSubscription.findMany({
                where: { userId }
            })

            if (subscriptions.length === 0) {
                // No subscription is not an error, just nothing to do
                await queue.complete(QUEUES.NOTIFICATION_DELIVERY, job.id)
                continue
            }

            // 3. Send to all endpoints
            const payload = JSON.stringify({
                title,
                body: message,
                icon: '/icons/icon-192x192.png',
                badge: '/icons/badge-72x72.png',
                data: {
                    ...data,
                    url: data?.url || '/dashboard',
                }
            })

            const sendResults = await Promise.allSettled(
                subscriptions.map(async (sub) => {
                    try {
                        await webpush.sendNotification({
                            endpoint: sub.endpoint,
                            keys: {
                                p256dh: sub.p256dh,
                                auth: sub.auth
                            }
                        }, payload)
                        return { status: 'fulfilled', subId: sub.id }
                    } catch (error: any) {
                        return { status: 'rejected', subId: sub.id, error }
                    }
                })
            )

            // 4. Handle Results & Cleanup
            for (const res of sendResults) {
                if (res.status === 'rejected') {
                    const err = (res as any).reason
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        // Permanent failure - Cleanup
                        const subId = (res as any).subId
                        await prisma.pushSubscription.delete({ where: { id: subId } })
                        logger.info('[PushWorker] Removed stale subscription', { subId })
                    }
                }
            }

            // Success (at least processed without crash)
            await queue.complete(QUEUES.NOTIFICATION_DELIVERY, job.id)
            result.succeeded++
        } catch (error: any) {
            logger.error(`[PushWorker] Job ${job.id} failed:`, error)
            await queue.fail(QUEUES.NOTIFICATION_DELIVERY, job.id, error)
            result.failed++
        }
    }

    return result
}
