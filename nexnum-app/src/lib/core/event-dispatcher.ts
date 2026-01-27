/**
 * Enterprise Event Dispatcher
 * 
 * Central hub for broadcasting system-wide events.
 * Handles:
 * 1. Webhook Queuing (Background Delivery via pg-boss)
 * 2. Event Payload Signing (HMAC-SHA256)
 * 3. Event Correlation Traceability
 */

import { createHmac } from 'crypto'
import { prisma } from '@/lib/core/db'
import { queue, QUEUES } from '@/lib/core/queue'
import { logger } from '@/lib/core/logger'

export type NexNumEvent =
    | 'sms.received'
    | 'activation.expired'
    | 'activation.cancelled'
    | 'activation.received'
    | 'activation.failed'
    | 'activation.active'
    | 'balance.low'

export interface EventPayload {
    userId: string
    event: NexNumEvent
    timestamp: string
    data: Record<string, any>
}

export class EventDispatcher {
    /**
     * Dispatch an event to all registered channels (Webhooks, etc.)
     */
    static async dispatch(userId: string, event: NexNumEvent, data: any) {
        const payload: EventPayload = {
            userId,
            event,
            timestamp: new Date().toISOString(),
            data
        }

        logger.info(`[EventDispatcher] Dispatching ${event} for ${userId}`, { event })

        // 1. Find active webhooks for this user and event
        const webhooks = await prisma.webhook.findMany({
            where: {
                userId,
                isActive: true,
                events: { has: event }
            }
        })

        if (webhooks.length === 0) return

        // 2. Queue each webhook for background delivery
        for (const webhook of webhooks) {
            try {
                // Create Delivery Record
                const delivery = await prisma.webhookDelivery.create({
                    data: {
                        webhookId: webhook.id,
                        event,
                        payload: payload as any,
                        status: 'pending'
                    }
                })

                // Sign Payload
                const signature = this.signPayload(payload, webhook.secret)

                // Push to durable queue
                await queue.publish(QUEUES.WEBHOOK_PROCESSING, {
                    deliveryId: delivery.id,
                    url: webhook.url,
                    payload,
                    signature,
                    attempts: 0
                })

            } catch (error: any) {
                logger.error('[EventDispatcher] Failed to queue webhook', {
                    webhookId: webhook.id,
                    error: error.message
                })
            }
        }
    }

    /**
     * Generate HMAC signature for payload
     */
    static signPayload(payload: any, secret: string): string {
        const content = typeof payload === 'string' ? payload : JSON.stringify(payload)
        return createHmac('sha256', secret).update(content).digest('hex')
    }
}
