/**
 * Multi-SMS Handler
 * 
 * Automatically handles services that require multiple SMS codes.
 * Works transparently for all providers without manual configuration.
 * 
 * Flow:
 * 1. First SMS received → Store & notify user
 * 2. Auto-request next SMS if provider supports it
 * 3. Track sequence (1st, 2nd, 3rd...)
 * 4. Extend timeout on each SMS
 * 5. Complete when all expected SMS received or timeout
 */

import { prisma } from '@/lib/core/db'
import { getProviderAdapter } from '@/lib/providers/provider-factory'
import { logger } from '@/lib/core/logger'
import { multi_sms_sequences_total, sms_delivery_latency_seconds } from '@/lib/metrics'

// ============================================================================
// Types
// ============================================================================

export interface SmsMessage {
    id: string
    code?: string
    content: string
    sender?: string
    receivedAt: Date
    ordinal: number  // Position in sequence (1, 2, 3...)
}

export interface MultiSmsState {
    numberId: string
    activationId: string
    providerId: string
    messages: SmsMessage[]
    totalExpected?: number  // Some providers tell us how many to expect
    isComplete: boolean
    lastSmsAt?: Date
    purchasedAt?: Date
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
    // Default timeout extension per SMS (seconds)
    TIMEOUT_EXTENSION_SECONDS: 120,

    // Maximum SMS messages per activation
    MAX_SMS_COUNT: 5,

    // Delay before requesting next SMS (ms)
    NEXT_SMS_REQUEST_DELAY_MS: 2000,
}

// ============================================================================
// Multi-SMS Handler
// ============================================================================

export class MultiSmsHandler {

    /**
     * Process newly received SMS message
     * Handles storage, sequencing, and auto-requesting next SMS
     */
    static async handleSmsReceived(
        numberId: string,
        activationId: string,
        providerId: string,
        messages: Array<{ code?: string; text?: string; content?: string; id?: string }>
    ): Promise<{ stored: number; requestedNext: boolean }> {
        const result = { stored: 0, requestedNext: false }

        if (!messages || messages.length === 0) return result

        const number = await prisma.number.findUnique({
            where: { id: numberId },
            include: {
                smsMessages: { orderBy: { receivedAt: 'asc' } }
            }
        })

        if (!number) {
            logger.warn('[MultiSMS] Number not found', { numberId })
            return result
        }

        const existingCount = number.smsMessages.length

        // Process each new message
        for (const msg of messages) {
            const code = msg.code || this.extractCode(msg.text || msg.content || '')
            const content = msg.text || msg.content || ''

            // Check for duplicates (same code or content)
            const isDuplicate = number.smsMessages.some(
                existing => existing.code === code || existing.content === content
            )

            if (isDuplicate) {
                logger.debug('[MultiSMS] Duplicate SMS skipped', { numberId, code })
                continue
            }

            // Store new SMS
            const ordinal = existingCount + result.stored + 1

            await prisma.smsMessage.create({
                data: {
                    numberId,
                    code: code || null,
                    content,
                    sender: 'Provider',
                }
            })

            result.stored++

            // Record SMS delivery latency for first SMS
            if (ordinal === 1 && number.purchasedAt) {
                const latencySeconds = (Date.now() - number.purchasedAt.getTime()) / 1000
                sms_delivery_latency_seconds
                    .labels(number.provider || 'unknown', number.serviceName || 'unknown')
                    .observe(latencySeconds)
            }

            logger.info('[MultiSMS] SMS stored', {
                numberId,
                ordinal,
                hasCode: !!code
            })
        }

        // Auto-request next SMS if appropriate
        const totalMessages = existingCount + result.stored

        if (totalMessages < CONFIG.MAX_SMS_COUNT) {
            result.requestedNext = await this.requestNextSms(numberId, activationId, providerId)
        }

        // Record multi-SMS metrics
        if (totalMessages > 1) {
            const provider = await prisma.provider.findUnique({
                where: { id: providerId },
                select: { name: true }
            })

            multi_sms_sequences_total
                .labels(provider?.name || 'unknown', String(totalMessages))
                .inc()
        }

        return result
    }

    /**
     * Request next SMS from provider (automatic)
     * Uses provider's resend/continue endpoint if available
     */
    static async requestNextSms(
        numberId: string,
        activationId: string,
        providerId: string
    ): Promise<boolean> {
        try {
            const provider = await prisma.provider.findUnique({
                where: { id: providerId }
            })

            if (!provider) return false

            const adapter = getProviderAdapter(provider)

            // Check if provider supports requesting next SMS
            if ('setStatus' in adapter) {
                // Standard SMS-Activate compatible API
                // setStatus with status '3' or 'REQUEST_MORE' requests another SMS
                await new Promise(resolve => setTimeout(resolve, CONFIG.NEXT_SMS_REQUEST_DELAY_MS))

                await (adapter as any).setStatus(activationId, '3') // REQUEST_MORE

                logger.info('[MultiSMS] Requested next SMS', { numberId, activationId })
                return true
            }

            // Some providers have dedicated resend endpoint
            if ('resendSms' in adapter) {
                await new Promise(resolve => setTimeout(resolve, CONFIG.NEXT_SMS_REQUEST_DELAY_MS))

                await (adapter as any).resendSms(activationId)

                logger.info('[MultiSMS] Resend requested', { numberId, activationId })
                return true
            }

            return false
        } catch (error) {
            logger.warn('[MultiSMS] Failed to request next SMS', {
                numberId,
                activationId,
                error
            })
            return false
        }
    }

    /**
     * Extract verification code from SMS content
     * Handles various formats used by different services
     */
    static extractCode(content: string): string | null {
        if (!content) return null

        // Common patterns for verification codes
        const patterns = [
            /\b(\d{4,8})\b/,                     // 4-8 digit code
            /code[:\s]+(\d{4,8})/i,              // "code: 123456"
            /verification[:\s]+(\d{4,8})/i,     // "verification: 123456"
            /OTP[:\s]+(\d{4,8})/i,              // "OTP: 123456"
            /PIN[:\s]+(\d{4,8})/i,              // "PIN: 123456"
            /\b([A-Z0-9]{5,10})\b/,              // Alphanumeric codes
            /G-(\d{6})/,                         // Google: G-123456
            /(\d{6})\s+is your/i,               // "123456 is your..."
        ]

        for (const pattern of patterns) {
            const match = content.match(pattern)
            if (match && match[1]) {
                return match[1]
            }
        }

        return null
    }

    /**
     * Get current SMS state for a number
     */
    static async getState(numberId: string): Promise<MultiSmsState | null> {
        const number = await prisma.number.findUnique({
            where: { id: numberId },
            include: {
                smsMessages: {
                    orderBy: { receivedAt: 'asc' }
                }
            }
        })

        if (!number) return null

        // Fetch provider ID from name
        const provider = number.provider
            ? await prisma.provider.findFirst({ where: { name: number.provider } })
            : null

        const messages: SmsMessage[] = number.smsMessages.map((msg, index) => ({
            id: msg.id,
            code: msg.code || undefined,
            content: msg.content || '',
            receivedAt: msg.receivedAt,
            ordinal: index + 1
        }))

        const isComplete = number.status === 'completed' || messages.length >= CONFIG.MAX_SMS_COUNT

        return {
            numberId: number.id,
            activationId: number.activationId || '',
            providerId: provider?.id || '',
            messages,
            isComplete,
            lastSmsAt: messages.length > 0 ? messages[messages.length - 1].receivedAt : undefined,
            purchasedAt: number.purchasedAt || undefined
        }
    }
}
