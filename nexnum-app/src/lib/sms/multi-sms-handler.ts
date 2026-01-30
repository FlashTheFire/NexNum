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
import { CodeExtractor } from './code-extractor'
import { smsAudit } from './audit'
import { EventDispatcher } from '@/lib/core/event-dispatcher'

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
        messages: Array<{ id?: string; code?: string; text?: string; content?: string; sender?: string; receivedAt?: Date }>
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
            const codeResult = CodeExtractor.extract(msg.text || msg.content || '', undefined, number.serviceName || undefined)
            const code = codeResult?.code
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

            const storedMsg = await prisma.smsMessage.create({
                data: {
                    numberId,
                    code: code || null,
                    content,
                    sender: msg.sender || 'Provider',
                    receivedAt: msg.receivedAt || new Date()
                }
            })

            result.stored++

            // RECORD UNIFORM LATENCY (Every SMS works as first SMS)
            const lastEventTime = number.smsMessages.length > 0
                ? number.smsMessages[number.smsMessages.length - 1].receivedAt.getTime()
                : number.purchasedAt?.getTime() || Date.now()

            const latencySeconds = (Date.now() - lastEventTime) / 1000

            sms_delivery_latency_seconds
                .labels(number.provider || 'unknown', number.serviceName || 'unknown')
                .observe(latencySeconds)

            // PROFESSIONAL AUDIT TRAIL
            await smsAudit.logSmsIngested(numberId, storedMsg.id, ordinal, latencySeconds)

            // ENTERPRISE EVENT DISPATCH (Phase 39)
            if (number.ownerId) {
                await EventDispatcher.dispatch(number.ownerId, 'sms.received', {
                    numberId,
                    activationId,
                    phoneNumber: number.phoneNumber,
                    sms: {
                        id: storedMsg.id,
                        sender: storedMsg.sender,
                        content: storedMsg.content,
                        code: storedMsg.code,
                        ordinal,
                        receivedAt: storedMsg.receivedAt
                    }
                })
            }

            logger.info('[MultiSMS] SMS ingested (Uniform Equality)', {
                numberId,
                ordinal,
                latency: `${latencySeconds.toFixed(2)}s`,
                hasCode: !!code,
                isMismatched: codeResult?.isMismatched
            })
        }

        // RECURSIVE NEXT TRIGGER
        const totalMessages = existingCount + result.stored

        if (totalMessages < CONFIG.MAX_SMS_COUNT) {
            // Signal provider for more, regardless of ordinal
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

            // 1. Prefer the standardized v2.0 'setResendCode' method
            if ('setResendCode' in adapter && typeof adapter.setResendCode === 'function') {
                await new Promise(resolve => setTimeout(resolve, CONFIG.NEXT_SMS_REQUEST_DELAY_MS))
                await adapter.setResendCode(activationId)
                logger.info('[MultiSMS] Requested resend code (via setResendCode)', { numberId, activationId })
                return true
            }

            // 2. Backward Compatibility: nextSms
            if ('nextSms' in adapter && typeof (adapter as any).nextSms === 'function') {
                await new Promise(resolve => setTimeout(resolve, CONFIG.NEXT_SMS_REQUEST_DELAY_MS))
                await (adapter as any).nextSms(activationId)
                logger.warn('[MultiSMS] Requested next SMS (via DEPRECATED nextSms)', { numberId, activationId })
                return true
            }

            // 3. Fallback: Dedicated resend endpoint
            if ('resendSms' in adapter && typeof (adapter as any).resendSms === 'function') {
                await new Promise(resolve => setTimeout(resolve, CONFIG.NEXT_SMS_REQUEST_DELAY_MS))
                await (adapter as any).resendSms(activationId)
                logger.warn('[MultiSMS] Requested next SMS (via DEPRECATED resendSms)', { numberId, activationId })
                return true
            }

            return false
        } catch (error: any) {
            logger.warn('[MultiSMS] Failed to request next SMS', {
                numberId,
                activationId,
                error: error.message
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
