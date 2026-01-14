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

        // Create SMS result
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

        // Publish to Redis pub/sub (for real-time updates)
        await redis.publish(
            `sms:received:${number.id}`,
            JSON.stringify(smsResult)
        )

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
     * Cache SMS for fast retrieval
     */
    private async cacheSms(numberId: string, sms: SmsResult): Promise<void> {
        const cacheKey = `sms:${numberId}`
        await redis.set(cacheKey, JSON.stringify(sms), 'EX', 300) // 5 minutes
    }
}
