/**
 * Base Webhook Handler
 * 
 * Abstract class for provider-specific webhook handlers
 * Handles normalization, deduplication, and storage
 */

import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'
import { CodeExtractor } from '@/lib/sms/code-extractor'
import { WebhookPayload, SmsResult, ActivationStatus } from '@/lib/sms/types'
import { EventPublisher } from '@/lib/events/publisher'
import { PresenceMonitor } from '@/lib/socket/presence'
import { NotificationFactory } from '@/lib/notifications/notification-service'

export abstract class BaseWebhookHandler {
    protected providerName: string

    constructor(providerName: string) {
        this.providerName = providerName
    }

    /**
     * Parse raw webhook payload into standardized format
     * Must be implemented by each provider
     */
    abstract parse(body: any): WebhookPayload

    /**
     * Process webhook (idempotent)
     */
    async process(payload: WebhookPayload): Promise<void> {
        // Generate idempotency key
        const idempotencyKey = this.generateIdempotencyKey(payload)

        // Check if already processed
        const exists = await this.checkIdempotency(idempotencyKey)
        if (exists) {
            logger.debug('Webhook already processed', {
                provider: this.providerName,
                activationId: payload.activationId,
            })
            return
        }

        // Store webhook event
        await this.storeWebhookEvent(payload, idempotencyKey)

        // Handle based on event type
        if (payload.eventType === 'sms.received' && payload.sms) {
            await this.handleSmsReceived(payload)
        } else if (payload.eventType === 'activation.status' && payload.status) {
            await this.handleStatusChange(payload)
        }

        // Mark as processed
        await this.markProcessed(idempotencyKey)
    }

    /**
     * Handle SMS received event
     */
    private async handleSmsReceived(payload: WebhookPayload): Promise<void> {
        // Find number by activation ID
        const number = await prisma.number.findFirst({
            where: {
                activationId: payload.activationId,
                provider: this.providerName,
            },
            select: {
                id: true,
                serviceCode: true,
                ownerId: true,
                phoneNumber: true,
            },
        })

        if (!number) {
            logger.warn('Number not found for webhook', {
                provider: this.providerName,
                activationId: payload.activationId,
            })
            return
        }

        // Extract code
        const extraction = CodeExtractor.extract(
            payload.sms!.text,
            number.serviceCode || undefined
        )

        // Create SMS result (Structure maintained for backward compat if needed)
        const smsResult: SmsResult = {
            id: `${this.providerName}:${payload.activationId}:${Date.now()}`,
            numberId: number.id,
            activationId: payload.activationId,
            sender: payload.sms!.sender || 'Unknown',
            content: payload.sms!.text,
            code: extraction?.code || payload.sms!.code,
            confidence: extraction?.confidence,
            receivedAt: payload.sms!.receivedAt,
            provider: this.providerName,
            rawPayload: payload.rawPayload,
        }

        // Store SMS
        await prisma.smsMessage.create({
            data: {
                numberId: number.id,
                sender: smsResult.sender,
                content: smsResult.content,
                code: smsResult.code,
                receivedAt: smsResult.receivedAt,
                provider: this.providerName,
                rawPayload: payload.rawPayload as any,
                extractedCode: smsResult.code,
                confidence: smsResult.confidence,
            },
        })

        // Update number status
        await prisma.number.update({
            where: { id: number.id },
            data: { status: 'active' },
        })

        // Cache SMS
        await this.cacheSms(number.id, smsResult)

        // Publish Event — with full payload for instant client-side rendering
        if (number.ownerId) {
            try {
                await EventPublisher.publish('sms.received', `user:${number.ownerId}`, {
                    activationId: payload.activationId,
                    numberId: number.id,              // exact match on SMS page
                    phoneNumber: number.phoneNumber,
                    message: smsResult.content,
                    code: smsResult.code || undefined, // show OTP in toast immediately
                    serviceName: number.serviceCode || undefined,
                    receivedAt: smsResult.receivedAt.toISOString()
                })
            } catch (error) {
                logger.error('Failed to publish sms.received event', {
                    error,
                    activationId: payload.activationId,
                    numberId: number.id
                })
            }

            // Offline Fallback: Web Push notification if user is not on socket
            // Non-blocking — never fails webhook processing
            try {
                const isOnline = await PresenceMonitor.isUserOnline(number.ownerId)
                if (!isOnline) {
                    logger.debug('[Webhook] User offline — queuing push notification', {
                        userId: number.ownerId,
                        numberId: number.id
                    })
                    await NotificationFactory.smsReceived(
                        number.ownerId,
                        number.phoneNumber,
                        smsResult.code || undefined,
                        number.serviceCode || undefined,
                        number.id
                    )
                }
            } catch (error) {
                logger.warn('[Webhook] Offline push fallback failed (non-critical)', {
                    error,
                    userId: number.ownerId
                })
            }
        } else {
            logger.warn('Skipping event publish: Number has no owner', { numberId: number.id })
        }

        logger.info('SMS received via webhook', {
            provider: this.providerName,
            numberId: number.id,
            hasCode: !!smsResult.code,
        })
    }

    /**
     * Handle activation status change
     */
    private async handleStatusChange(payload: WebhookPayload): Promise<void> {
        const number = await prisma.number.findFirst({
            where: {
                activationId: payload.activationId,
                provider: this.providerName,
            },
        })

        if (!number) {
            logger.warn('Number not found for status change', {
                provider: this.providerName,
                activationId: payload.activationId,
            })
            return
        }

        // Update number status
        const statusMap: Record<ActivationStatus, string> = {
            [ActivationStatus.PENDING]: 'reserved',
            [ActivationStatus.RECEIVED]: 'active',
            [ActivationStatus.FINISHED]: 'active',
            [ActivationStatus.CANCELED]: 'canceled',
            [ActivationStatus.EXPIRED]: 'expired',
        }

        await prisma.number.update({
            where: { id: number.id },
            data: { status: statusMap[payload.status!] },
        })

        logger.info('Number status updated via webhook', {
            provider: this.providerName,
            numberId: number.id,
            status: payload.status,
        })
    }

    /**
     * Generate idempotency key
     */
    private generateIdempotencyKey(payload: WebhookPayload): string {
        return `webhook:${this.providerName}:${payload.activationId}:${payload.timestamp.getTime()}`
    }

    /**
     * Check if webhook already processed
     */
    private async checkIdempotency(key: string): Promise<boolean> {
        const exists = await redis.get(key)
        return exists !== null
    }

    /**
     * Mark webhook as processed
     */
    private async markProcessed(key: string): Promise<void> {
        // Store for 24 hours
        await redis.set(key, '1', 'EX', 86400)
    }

    /**
     * Store webhook event in database
     */
    private async storeWebhookEvent(
        payload: WebhookPayload,
        idempotencyKey: string
    ): Promise<void> {
        await prisma.webhookEvent.create({
            data: {
                provider: this.providerName,
                eventType: payload.eventType,
                payload: payload.rawPayload as any,
                idempotencyKey,
                processed: false,
            },
        })
    }

    /**
     * Cache SMS as a list — supports multiple SMS per number without collision.
     * Keeps last 50 messages, expires after 5 minutes of inactivity.
     */
    private async cacheSms(numberId: string, sms: SmsResult): Promise<void> {
        const cacheKey = `sms:list:${numberId}`
        const serialized = JSON.stringify(sms)
        // Prepend latest SMS to list (newest first)
        await redis.lpush(cacheKey, serialized)
        // Sliding expiry: reset on each new SMS
        await redis.expire(cacheKey, 300) // 5 minutes
        // Cap list size to prevent unbounded growth
        await redis.ltrim(cacheKey, 0, 49) // keep last 50
    }
}
