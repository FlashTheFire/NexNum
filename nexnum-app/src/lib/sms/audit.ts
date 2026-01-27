/**
 * SMS Polling Audit Service
 * 
 * Comprehensive audit trail for SMS polling operations:
 * - All poll attempts (success/failure)
 * - SMS received events
 * - State transitions
 * - Refund events
 * - Anomaly detections
 */

import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'
import { AnomalyCheck } from './security'

// ============================================
// TYPES
// ============================================

export type SmsAuditEventType =
    | 'POLL_STARTED'
    | 'POLL_SUCCESS'
    | 'POLL_FAILED'
    | 'POLL_SKIPPED'
    | 'SMS_RECEIVED'
    | 'SMS_DUPLICATE'
    | 'STATE_CHANGE'
    | 'REFUND_REQUESTED'
    | 'REFUND_COMPLETED'
    | 'REFUND_BLOCKED'
    | 'ANOMALY_DETECTED'
    | 'LOCK_ACQUIRED'
    | 'LOCK_FAILED'
    | 'PROVIDER_ERROR'
    | 'VALIDATION_FAILED'

export interface SmsAuditEvent {
    eventType: SmsAuditEventType

    // Context identifiers
    numberId?: string
    activationId?: string
    userId?: string
    providerId?: string
    messageId?: string

    // State tracking
    previousState?: string
    newState?: string

    // Details
    details?: Record<string, any>
    errorMessage?: string

    // Correlation
    correlationId?: string  // Links related events
    workerInstance?: string
}

// Worker instance ID (unique per process)
const WORKER_INSTANCE = `worker_${process.pid}_${Date.now()}`

// ============================================
// AUDIT SERVICE
// ============================================

class SmsAuditService {
    private buffer: SmsAuditEvent[] = []
    private flushInterval: NodeJS.Timeout | null = null
    private readonly BUFFER_SIZE = 50
    private readonly FLUSH_INTERVAL_MS = 5000

    constructor() {
        // Start periodic flush
        this.startPeriodicFlush()
    }

    /**
     * Log an audit event (buffered for performance)
     */
    async log(event: SmsAuditEvent): Promise<void> {
        const enrichedEvent = {
            ...event,
            workerInstance: WORKER_INSTANCE,
            timestamp: new Date().toISOString()
        }

        this.buffer.push(enrichedEvent)

        // Flush if buffer is full
        if (this.buffer.length >= this.BUFFER_SIZE) {
            await this.flush()
        }
    }

    /**
     * Log immediately (for critical events)
     */
    async logImmediate(event: SmsAuditEvent): Promise<void> {
        try {
            await prisma.auditLog.create({
                data: {
                    userId: event.userId,
                    action: `SMS_${event.eventType}`,
                    resourceType: 'sms_polling',
                    resourceId: event.numberId || event.activationId,
                    metadata: {
                        ...event.details,
                        eventType: event.eventType,
                        providerId: event.providerId,
                        messageId: event.messageId,
                        previousState: event.previousState,
                        newState: event.newState,
                        errorMessage: event.errorMessage,
                        correlationId: event.correlationId,
                        workerInstance: WORKER_INSTANCE
                    }
                }
            })
        } catch (error: any) {
            logger.error('[SmsAudit] Failed to log immediate event', {
                eventType: event.eventType,
                error: error.message
            })
        }
    }

    /**
     * Flush buffered events to database
     */
    async flush(): Promise<void> {
        if (this.buffer.length === 0) return

        const eventsToFlush = [...this.buffer]
        this.buffer = []

        try {
            await prisma.auditLog.createMany({
                data: eventsToFlush.map(event => ({
                    userId: event.userId,
                    action: `SMS_${event.eventType}`,
                    resourceType: 'sms_polling',
                    resourceId: event.numberId || event.activationId,
                    metadata: {
                        eventType: event.eventType,
                        providerId: event.providerId,
                        messageId: event.messageId,
                        previousState: event.previousState,
                        newState: event.newState,
                        details: event.details,
                        errorMessage: event.errorMessage,
                        correlationId: event.correlationId,
                        workerInstance: event.workerInstance
                    }
                }))
            })
        } catch (error: any) {
            logger.error('[SmsAudit] Failed to flush events', {
                count: eventsToFlush.length,
                error: error.message
            })
            // Re-add failed events to buffer (with limit)
            this.buffer.unshift(...eventsToFlush.slice(0, 20))
        }
    }

    /**
     * Start periodic flush
     */
    private startPeriodicFlush(): void {
        this.flushInterval = setInterval(() => {
            this.flush().catch(() => { })
        }, this.FLUSH_INTERVAL_MS)
    }

    /**
     * Stop periodic flush (for graceful shutdown)
     */
    async shutdown(): Promise<void> {
        if (this.flushInterval) {
            clearInterval(this.flushInterval)
            this.flushInterval = null
        }
        await this.flush()
    }

    // ============================================
    // CONVENIENCE METHODS
    // ============================================

    async logPollStarted(numberId: string, activationId: string, correlationId?: string): Promise<void> {
        await this.log({
            eventType: 'POLL_STARTED',
            numberId,
            activationId,
            correlationId
        })
    }

    async logPollSuccess(
        numberId: string,
        activationId: string,
        messagesFound: number,
        correlationId?: string
    ): Promise<void> {
        await this.log({
            eventType: 'POLL_SUCCESS',
            numberId,
            activationId,
            correlationId,
            details: { messagesFound }
        })
    }

    async logPollFailed(
        numberId: string,
        activationId: string,
        error: string,
        correlationId?: string
    ): Promise<void> {
        await this.log({
            eventType: 'POLL_FAILED',
            numberId,
            activationId,
            correlationId,
            errorMessage: error
        })
    }

    async logSmsReceived(
        numberId: string,
        messageId: string,
        userId: string,
        providerId: string,
        details: { sender: string; hasCode: boolean; contentHash: string },
        correlationId?: string
    ): Promise<void> {
        await this.logImmediate({
            eventType: 'SMS_RECEIVED',
            numberId,
            messageId,
            userId,
            providerId,
            details,
            correlationId
        })
    }

    async logSmsIngested(
        numberId: string,
        messageId: string,
        ordinal: number,
        latency: number,
        correlationId?: string
    ): Promise<void> {
        await this.log({
            eventType: 'SMS_RECEIVED', // Reuse or add INGESTED
            numberId,
            messageId,
            details: { ordinal, latency: `${latency.toFixed(2)}s` },
            correlationId
        })
    }

    async logDuplicate(
        numberId: string,
        messageId: string,
        reason: 'composite_id' | 'content_hash' | 'time_window',
        correlationId?: string
    ): Promise<void> {
        await this.log({
            eventType: 'SMS_DUPLICATE',
            numberId,
            messageId,
            details: { reason },
            correlationId
        })
    }

    async logStateChange(
        numberId: string,
        activationId: string,
        previousState: string,
        newState: string,
        reason: string
    ): Promise<void> {
        await this.logImmediate({
            eventType: 'STATE_CHANGE',
            numberId,
            activationId,
            previousState,
            newState,
            details: { reason }
        })
    }

    async logAnomaly(
        anomaly: AnomalyCheck,
        context: { numberId?: string; activationId?: string; userId?: string }
    ): Promise<void> {
        if (!anomaly.detected) return

        await this.logImmediate({
            eventType: 'ANOMALY_DETECTED',
            numberId: context.numberId,
            activationId: context.activationId,
            userId: context.userId,
            details: {
                anomalyType: anomaly.type,
                severity: anomaly.severity,
                description: anomaly.details
            }
        })
    }

    async logRefundBlocked(
        activationId: string,
        userId: string,
        reason: string
    ): Promise<void> {
        await this.logImmediate({
            eventType: 'REFUND_BLOCKED',
            activationId,
            userId,
            details: { reason }
        })
    }

    async logValidationFailed(
        numberId: string,
        errors: string[]
    ): Promise<void> {
        await this.log({
            eventType: 'VALIDATION_FAILED',
            numberId,
            details: { errors }
        })
    }
}

// ============================================
// SINGLETON EXPORT
// ============================================

export const smsAudit = new SmsAuditService()
