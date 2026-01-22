import { prisma } from '@/lib/core/db'
import { Webhook, Prisma } from '@prisma/client'
import crypto from 'crypto'
import { encrypt, decrypt } from '@/lib/security/encryption'

export interface CreateWebhookDto {
    userId: string
    url: string
    events: string[]
}

export interface UpdateWebhookDto {
    url?: string
    events?: string[]
    isActive?: boolean
}

export class WebhookService {
    /**
     * Create a new webhook
     */
    static async create(data: CreateWebhookDto): Promise<Webhook> {
        // Generate a random secret for HMAC signing
        const secret = crypto.randomBytes(32).toString('hex')

        return prisma.webhook.create({
            data: {
                userId: data.userId,
                url: data.url,
                events: data.events,
                secret: encrypt(secret), // Encrypt at rest
                isActive: true
            }
        })
    }

    /**
     * List user's webhooks
     */
    static async list(userId: string): Promise<Webhook[]> {
        return prisma.webhook.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        })
    }

    /**
     * Get single webhook (ensuring ownership)
     */
    static async get(id: string, userId: string): Promise<Webhook | null> {
        return prisma.webhook.findUnique({
            where: { id },
        }).then(wh => {
            if (wh && wh.userId === userId) return wh
            return null
        })
    }

    /**
     * Update webhook
     */
    static async update(id: string, userId: string, data: UpdateWebhookDto): Promise<Webhook> {
        // Ensure ownership
        const existing = await this.get(id, userId)
        if (!existing) throw new Error('Webhook not found')

        return prisma.webhook.update({
            where: { id },
            data
        })
    }

    /**
     * Delete webhook
     */
    static async delete(id: string, userId: string): Promise<void> {
        // Ensure ownership
        const existing = await this.get(id, userId)
        if (!existing) throw new Error('Webhook not found')

        await prisma.webhook.delete({
            where: { id }
        })
    }

    /**
     * Dispatch an event to all matching webhooks
     * This enqueues jobs for the worker to process
     */
    static async dispatch(userId: string, event: string, payload: any): Promise<void> {
        // Find active webhooks for this user that subscribe to this event
        const webhooks = await prisma.webhook.findMany({
            where: {
                userId,
                isActive: true,
                events: { has: event }
            }
        })

        if (webhooks.length === 0) return

        // In a real production system, we would push to a Redis queue here (e.g., BullMQ or pg-boss).
        // For this implementation, we'll create WebhookDelivery records immediately to track them,
        // (The actual HTTP delivery would be handled by a worker picking these up).

        // SPRINT 0: We will just log the "Intent to deliver" by creating pending deliveries.
        // The Worker will poll/subscribe to these.

        const deliveryPromises = webhooks.map(wh =>
            prisma.webhookDelivery.create({
                data: {
                    webhookId: wh.id,
                    event,
                    payload,
                    status: 'pending',
                    nextRetryAt: new Date() // Ready to process now
                }
            })
        )

        await Promise.all(deliveryPromises)
    }
}
