/**
 * Webhook Delivery Worker
 * 
 * Consumes webhook jobs from the queue and performs HTTP delivery.
 * Features:
 * 1. Exponential Backoff Retries
 * 2. HMAC Signature Validation (x-nexnum-signature)
 * 3. Delivery Record Tracking
 */

import { queue, QUEUES } from '@/lib/core/queue'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'

interface WebhookJob {
    deliveryId: string
    url: string
    payload: any
    signature: string
    attempts: number
}

const MAX_ATTEMPTS = 5
const BACKOFF_MINUTES = [1, 5, 15, 60, 360] // Exponential backoff schedule

export async function registerWebhookWorker() {
    await queue.work<WebhookJob>(QUEUES.WEBHOOK_PROCESSING, async (jobs) => {
        for (const job of jobs) {
            const { deliveryId, url, payload, signature, attempts } = job.data
            const start = Date.now()

            try {
                logger.debug(`[WebhookWorker] Delivering ${deliveryId} to ${url}`, { attempts })

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'NexNum-Webhook/1.0',
                        'x-nexnum-signature': signature,
                        'x-nexnum-delivery': deliveryId
                    },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(10000) // 10s timeout
                })

                const durationMs = Date.now() - start
                const responseBody = await response.text().catch(() => '')

                // Update Delivery Record
                await prisma.webhookDelivery.update({
                    where: { id: deliveryId },
                    data: {
                        status: response.ok ? 'delivered' : 'failed',
                        responseCode: response.status,
                        responseBody: responseBody.substring(0, 1000), // Truncate
                        durationMs,
                        attempts: attempts + 1,
                        deliveredAt: response.ok ? new Date() : null
                    }
                })

                if (response.ok) {
                    logger.info(`[WebhookWorker] Delivered ${deliveryId} successfully`, { durationMs })

                    // Reset fail count on parent webhook
                    const delivery = await prisma.webhookDelivery.findUnique({
                        where: { id: deliveryId },
                        select: { webhookId: true }
                    })
                    if (delivery) {
                        await prisma.webhook.update({
                            where: { id: delivery.webhookId },
                            data: { failCount: 0, lastSuccessAt: new Date(), lastTriedAt: new Date() }
                        })
                    }
                } else {
                    throw new Error(`HTTP ${response.status}: ${responseBody.substring(0, 100)}`)
                }

            } catch (error: any) {
                const durationMs = Date.now() - start
                logger.warn(`[WebhookWorker] Delivery failed for ${deliveryId}`, { error: error.message })

                // Update Delivery as failed
                await prisma.webhookDelivery.update({
                    where: { id: deliveryId },
                    data: {
                        status: 'failed',
                        attempts: attempts + 1,
                        durationMs
                    }
                })

                // Handle Retries
                if (attempts + 1 < MAX_ATTEMPTS) {
                    const delayMinutes = BACKOFF_MINUTES[attempts] || 60
                    const nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000)

                    await queue.publish(QUEUES.WEBHOOK_PROCESSING, {
                        ...job.data,
                        attempts: attempts + 1
                    }, { startAfter: delayMinutes * 60 }) // pg-boss uses seconds for startAfter

                    await prisma.webhookDelivery.update({
                        where: { id: deliveryId },
                        data: { nextRetryAt }
                    })

                    logger.info(`[WebhookWorker] Scheduled retry for ${deliveryId} in ${delayMinutes}m`)
                } else {
                    // Permanent Failure
                    const delivery = await prisma.webhookDelivery.findUnique({
                        where: { id: deliveryId },
                        select: { webhookId: true }
                    })
                    if (delivery) {
                        await prisma.webhook.update({
                            where: { id: delivery.webhookId },
                            data: { failCount: { increment: 1 }, lastTriedAt: new Date() }
                        })
                    }
                    logger.error(`[WebhookWorker] Permanent failure for ${deliveryId} after ${MAX_ATTEMPTS} attempts`)
                }
            }
        }
    })
}
