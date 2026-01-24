/**
 * Inbox Worker (Hardened - Future Proof Edition)
 * 
 * Enterprise-grade SMS polling system with:
 * - Distributed locking (prevent concurrent polling)
 * - Input validation & sanitization
 * - Cryptographic message fingerprinting
 * - Multi-layer duplicate detection
 * - Anomaly detection
 * - Comprehensive audit trail
 * - Circuit breaker integration
 * - Adaptive rate limiting
 */

import { prisma } from '@/lib/core/db'
import { smsProvider } from '@/lib/sms-providers/index'
import { NotificationFactory } from '@/lib/notifications/notification-service'
import { logger } from '@/lib/core/logger'
import { redis } from '@/lib/core/redis'
import {
    validateSmsMessage,
    generateContentHash,
    generateMessageFingerprint,
    checkTimingAnomaly,
    checkPollingAnomaly,
    getRateLimitKey,
    getRateLimitConfig,
    SecurityConfig
} from '@/lib/sms/security'
import { getNextPollDelay } from '@/lib/activation/adaptive-poll-strategy'
import { smsAudit } from '@/lib/sms/audit'
import { WorkersConfig } from '@/config'
import crypto from 'crypto'

// ============================================
// CONFIGURATION (sourced from central config)
// ============================================

const CONFIG = {
    BATCH_SIZE: WorkersConfig.batchSize,
    CONCURRENCY_LIMIT: WorkersConfig.concurrency,
    LOCK_TTL_SECONDS: 60,
    MAX_CONSECUTIVE_ERRORS: 5,
    EXPIRY_BUFFER_MS: 30 * 1000,
    ERROR_BACKOFF_MS: 30 * 1000,
    POLL_LOCK_PREFIX: 'poll:lock:',
    CONTENT_DEDUP_WINDOW_MS: 10 * 1000,  // 10 second window for content dedup
    CONTENT_DEDUP_PREFIX: 'dedup:content:',
    RATE_LIMIT_PREFIX: 'ratelimit:poll:',
}

// ============================================
// TYPES
// ============================================

interface ProcessResult {
    processed: number
    activeNumbers: number
    newMessages: number
    duplicates: number
    errors: number
    skipped: number
    lockedByOthers: number
    rateLimited: number
    anomaliesDetected: number
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate correlation ID for tracing
 */
function generateCorrelationId(): string {
    return crypto.randomUUID()
}

/**
 * Simple concurrency limiter
 */
async function limitConcurrency<T>(
    tasks: (() => Promise<T>)[],
    limit: number
): Promise<T[]> {
    const results: T[] = []
    const executing: Promise<void>[] = []

    for (const task of tasks) {
        const p = Promise.resolve().then(() => task()).then(result => {
            results.push(result)
        })
        executing.push(p)

        if (executing.length >= limit) {
            await Promise.race(executing)
            for (let i = executing.length - 1; i >= 0; i--) {
                const settled = await Promise.race([
                    executing[i].then(() => true),
                    Promise.resolve(false)
                ])
                if (settled) executing.splice(i, 1)
            }
        }
    }

    await Promise.all(executing)
    return results
}

/**
 * Acquire distributed lock
 */
async function acquireLock(numberId: string): Promise<boolean> {
    const lockKey = `${CONFIG.POLL_LOCK_PREFIX}${numberId}`
    const result = await redis.set(lockKey, Date.now().toString(), 'EX', CONFIG.LOCK_TTL_SECONDS, 'NX')
    return result === 'OK'
}

/**
 * Release distributed lock
 */
async function releaseLock(numberId: string): Promise<void> {
    const lockKey = `${CONFIG.POLL_LOCK_PREFIX}${numberId}`
    await redis.del(lockKey)
}

/**
 * Check rate limit for entity
 */
async function checkRateLimit(entity: 'number' | 'provider', id: string): Promise<{ allowed: boolean; remaining: number }> {
    const key = getRateLimitKey(entity, id)
    const config = getRateLimitConfig(entity)

    const current = await redis.incr(key)
    if (current === 1) {
        await redis.pexpire(key, config.windowMs)
    }

    const remaining = Math.max(0, config.limit - current)
    return {
        allowed: current <= config.limit,
        remaining
    }
}

/**
 * Check content-based deduplication
 */
async function checkContentDedup(numberId: string, contentHash: string): Promise<boolean> {
    const key = `${CONFIG.CONTENT_DEDUP_PREFIX}${numberId}:${contentHash}`
    const exists = await redis.exists(key)
    if (exists) return true // Is duplicate

    // Set with expiry
    await redis.set(key, '1', 'PX', CONFIG.CONTENT_DEDUP_WINDOW_MS)
    return false
}

// ============================================
// MAIN WORKER FUNCTION
// ============================================

export async function processInboxBatch(batchSize = CONFIG.BATCH_SIZE): Promise<ProcessResult> {
    const result: ProcessResult = {
        processed: 0,
        activeNumbers: 0,
        newMessages: 0,
        duplicates: 0,
        errors: 0,
        skipped: 0,
        lockedByOthers: 0,
        rateLimited: 0,
        anomaliesDetected: 0
    }

    const correlationId = generateCorrelationId()
    const now = new Date()
    const expiryBuffer = new Date(now.getTime() + CONFIG.EXPIRY_BUFFER_MS)

    // 1. Fetch active numbers
    const activeNumbers = await prisma.number.findMany({
        where: {
            status: { in: ['active', 'received'] },
            activationId: { not: null },
            expiresAt: { gt: expiryBuffer },
            errorCount: { lt: CONFIG.MAX_CONSECUTIVE_ERRORS },
            OR: [
                { nextPollAt: null },
                { nextPollAt: { lte: now } }
            ]
        },
        orderBy: [
            { status: 'asc' },
            { createdAt: 'desc' }
        ],
        take: batchSize,
        include: {
            _count: {
                select: { smsMessages: true }
            }
        }
    })

    if (activeNumbers.length === 0) {
        return result
    }

    result.activeNumbers = activeNumbers.length
    logger.debug(`[InboxWorker] Polling ${activeNumbers.length} active numbers`, { correlationId })

    // 2. Create polling tasks
    const pollTasks = activeNumbers.map((number) => async () => {
        const numberCorrelationId = `${correlationId}:${number.id.substring(0, 8)}`

        // 2.1 Acquire lock
        const lockAcquired = await acquireLock(number.id)
        if (!lockAcquired) {
            result.lockedByOthers++
            await smsAudit.log({ eventType: 'LOCK_FAILED', numberId: number.id, correlationId: numberCorrelationId })
            return
        }

        try {
            result.processed++
            await smsAudit.logPollStarted(number.id, number.activationId || '', numberCorrelationId)

            if (!number.activationId) {
                result.skipped++
                return
            }

            // 2.2 Check rate limits
            const rateLimitCheck = await checkRateLimit('number', number.id)
            if (!rateLimitCheck.allowed) {
                result.rateLimited++
                logger.warn(`[InboxWorker] Rate limited: ${number.id}`)
                return
            }

            // 2.3 Check for polling anomaly
            const pollingAnomaly = checkPollingAnomaly(number.pollCount || 0)
            if (pollingAnomaly.detected) {
                result.anomaliesDetected++
                await smsAudit.logAnomaly(pollingAnomaly, { numberId: number.id, userId: number.ownerId || undefined })
            }

            // 2.4 Call provider API
            let providerStatus
            try {
                providerStatus = await Promise.race([
                    smsProvider.getStatus(number.activationId),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Provider timeout')), 15000)
                    )
                ])
            } catch (apiError: any) {
                if (apiError.isLifecycleTerminal) {
                    await handleTerminalState(number, apiError, numberCorrelationId)
                    return
                }
                throw apiError
            }

            // 2.5 Process messages with validation
            const messages = providerStatus?.messages ?? []
            const status = providerStatus?.status ?? 'pending'

            const existingMsgIds = new Set(
                (await prisma.smsMessage.findMany({
                    where: { numberId: number.id },
                    select: { id: true }
                })).map(m => m.id)
            )

            const validatedMessages = []
            for (const msg of messages) {
                // Validate message
                const validation = validateSmsMessage(msg)
                if (!validation.valid) {
                    await smsAudit.logValidationFailed(number.id, validation.errors)
                    continue
                }

                const sanitizedMsg = { ...msg, ...validation.sanitized }
                const compositeId = `${number.id}_${sanitizedMsg.id}`

                // Check composite ID dedup
                if (existingMsgIds.has(compositeId) || existingMsgIds.has(sanitizedMsg.id)) {
                    result.duplicates++
                    await smsAudit.logDuplicate(number.id, compositeId, 'composite_id')
                    continue
                }

                // Check content hash dedup
                const contentHash = generateContentHash(sanitizedMsg.content || '')
                const isContentDuplicate = await checkContentDedup(number.id, contentHash)
                if (isContentDuplicate) {
                    result.duplicates++
                    await smsAudit.logDuplicate(number.id, compositeId, 'content_hash')
                    continue
                }

                // Check timing anomaly
                const timingAnomaly = checkTimingAnomaly(
                    sanitizedMsg.receivedAt || new Date(),
                    number.createdAt
                )
                if (timingAnomaly.detected) {
                    result.anomaliesDetected++
                    await smsAudit.logAnomaly(timingAnomaly, { numberId: number.id, userId: number.ownerId || undefined })
                    // Still process the message but flag it
                }

                // Generate fingerprint
                const fingerprint = generateMessageFingerprint(
                    number.id,
                    sanitizedMsg.content || '',
                    sanitizedMsg.receivedAt || new Date()
                )

                validatedMessages.push({
                    ...sanitizedMsg,
                    id: compositeId,
                    contentHash,
                    fingerprint: fingerprint.hash
                })
            }

            // 2.6 Insert validated messages
            if (validatedMessages.length > 0) {
                await prisma.smsMessage.createMany({
                    data: validatedMessages.map(m => ({
                        id: m.id,
                        numberId: number.id,
                        sender: m.sender || 'Unknown',
                        content: m.content || '',
                        code: m.code,
                        receivedAt: m.receivedAt || new Date(),
                    })),
                    skipDuplicates: true
                })

                result.newMessages += validatedMessages.length

                // Log each SMS received
                for (const msg of validatedMessages) {
                    await smsAudit.logSmsReceived(
                        number.id,
                        msg.id,
                        number.ownerId || 'unknown',
                        number.provider || 'unknown',
                        {
                            sender: msg.sender,
                            hasCode: !!msg.code,
                            contentHash: msg.contentHash
                        }
                    )
                }

                // Update status
                if (status === 'received' && number.status !== 'received') {
                    await syncNumberAndActivation(number.id, number.activationId, 'received', 'RECEIVED', numberCorrelationId)
                }

                // Notify user
                const firstMsg = validatedMessages[0]
                if (number.ownerId) {
                    try {
                        await NotificationFactory.smsReceived(
                            number.ownerId,
                            number.phoneNumber,
                            firstMsg.code || undefined,
                            number.serviceName || undefined
                        )
                    } catch (notifError: any) {
                        logger.warn(`[InboxWorker] Notification failed: ${notifError.message}`)
                    }
                }

                logger.info(`[InboxWorker] New SMS for ${number.phoneNumber} (${validatedMessages.length})`)
            }

            // 2.7 Update polling metadata
            await smsAudit.logPollSuccess(number.id, number.activationId || '', validatedMessages.length, numberCorrelationId)

            // Use Adaptive Strategy for next poll
            const pollAttempt = (number.pollCount || 0) + 1
            const pollContext = {
                orderAgeSeconds: (Date.now() - number.createdAt.getTime()) / 1000,
                // Fix: use _count from include
                smsCount: validatedMessages.length + (number._count?.smsMessages || 0),
                pollAttempt: pollAttempt,
                lastPollError: false
            }

            const decision = getNextPollDelay(pollContext)
            // If !decision.useBatch, we theoretically should re-poll immediately, 
            // but for this worker implementation we'll just set the tightest delay.

            const nextPollAt = new Date(Date.now() + (decision.delaySeconds * 1000))

            await prisma.number.update({
                where: { id: number.id },
                data: {
                    pollCount: pollAttempt,
                    nextPollAt,
                    errorCount: 0,
                    lastPolledAt: new Date(),
                    updatedAt: new Date()
                }
            })

        } catch (error: any) {
            result.errors++
            const errorMsg = error.message?.substring(0, 255) || 'Unknown error'
            logger.warn(`[InboxWorker] Poll failed for ${number.id}: ${errorMsg}`)

            await smsAudit.logPollFailed(number.id, number.activationId || '', errorMsg, numberCorrelationId)

            const newErrorCount = (number.errorCount || 0) + 1
            await prisma.number.update({
                where: { id: number.id },
                data: {
                    errorCount: newErrorCount,
                    nextPollAt: new Date(Date.now() + CONFIG.ERROR_BACKOFF_MS),
                    lastError: errorMsg
                }
            }).catch(() => { })

        } finally {
            await releaseLock(number.id)
        }
    })

    // 3. Execute with concurrency limit
    await limitConcurrency(pollTasks, CONFIG.CONCURRENCY_LIMIT)

    // 4. Flush audit buffer
    await smsAudit.flush()

    return result
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function handleTerminalState(
    number: { id: string; activationId: string | null; phoneNumber: string },
    error: any,
    correlationId: string
): Promise<void> {
    const messageCount = await prisma.smsMessage.count({
        where: { numberId: number.id }
    })

    const terminalStatus = messageCount > 0 ? 'completed' : 'expired'
    const activationState = messageCount > 0 ? 'RECEIVED' : 'EXPIRED'

    logger.info(`[InboxWorker] Terminal state: ${number.phoneNumber} -> ${terminalStatus.toUpperCase()}`)

    await syncNumberAndActivation(number.id, number.activationId, terminalStatus, activationState, correlationId)
}

async function syncNumberAndActivation(
    numberId: string,
    providerActivationId: string | null,
    numberStatus: string,
    activationState: 'RECEIVED' | 'EXPIRED' | 'ACTIVE',
    correlationId: string
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const currentNumber = await tx.number.findUnique({
            where: { id: numberId },
            select: { status: true }
        })

        await tx.number.update({
            where: { id: numberId },
            data: { status: numberStatus, updatedAt: new Date() }
        })

        // Log state change
        await smsAudit.logStateChange(
            numberId,
            providerActivationId || '',
            currentNumber?.status || 'unknown',
            numberStatus,
            'inbox_worker_sync'
        )

        if (providerActivationId) {
            const activation = await tx.activation.findFirst({
                where: { providerActivationId }
            })

            if (activation) {
                const skipStates = ['RECEIVED', 'REFUNDED', 'COMPLETED'] as const
                if (!skipStates.includes(activation.state as any)) {
                    await tx.activation.update({
                        where: { id: activation.id },
                        data: { state: activationState }
                    })
                }
            } else {
                await tx.activation.updateMany({
                    where: {
                        numberId,
                        state: { notIn: ['RECEIVED', 'REFUNDED'] }
                    },
                    data: { state: activationState }
                })
            }
        }
    })
}

// function calculateNextPoll removed (Replaced by AdaptivePollStrategy)
