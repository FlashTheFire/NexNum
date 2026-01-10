/**
 * Number Lifecycle Manager (pg-boss version)
 * 
 * Production-grade system for managing number lifecycles:
 * - Auto-start on app initialization
 * - pg-boss for PostgreSQL-based job processing (uses existing Supabase)
 * - Circuit breaker for provider resilience
 * - Exponential backoff with jitter
 * - Automatic timeout handling with refunds
 * 
 * Benefits of pg-boss:
 * - Uses your existing PostgreSQL (Supabase) - NO extra infrastructure
 * - ACID transactions with your app data
 * - Free tier compatible
 */

import CircuitBreaker from 'opossum'
import { prisma } from '@/lib/core/db'
import { smsProvider } from '@/lib/sms-providers'
import { WalletService } from '@/lib/wallet/wallet'
import { logger } from '@/lib/core/logger'
import {
    lifecycle_jobs_total,
    lifecycle_circuit_state,
    lifecycle_job_duration,
} from '@/lib/metrics'

// pg-boss types - use any due to CommonJS compatibility issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgBossInstance = any

// ============================================================================
// Types
// ============================================================================

interface LifecycleJobData {
    type: 'poll' | 'expire' | 'sms_notify'
    numberId: string
    activationId: string
    userId: string
    attempt?: number
    smsCode?: string
}

interface ProviderStatusResult {
    status: string
    messages: Array<{ code: string; text?: string }>
}

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
    // Polling
    POLL_INTERVAL_SECONDS: 5,        // 5s between polls
    BASE_TIMEOUT_MINS: 10,           // PENDING orders expire after 10 min
    EXTENDED_TIMEOUT_MINS: 15,       // PROCESSING (has SMS) extends to 15 min

    // Retry
    MAX_RETRIES: 3,
    BACKOFF_BASE_SECONDS: 1,

    // Circuit Breaker
    CIRCUIT_TIMEOUT_MS: 5000,
    CIRCUIT_ERROR_THRESHOLD: 50,     // Open after 50% failures
    CIRCUIT_RESET_MS: 30000,         // Try again after 30s
    CIRCUIT_VOLUME_THRESHOLD: 10,    // Min calls before tripping

    // Queue names
    QUEUE_POLL: 'lifecycle-poll',
    QUEUE_EXPIRE: 'lifecycle-expire',
    QUEUE_NOTIFY: 'lifecycle-notify',
}

// ============================================================================
// NumberLifecycleManager Singleton
// ============================================================================

// Global singleton type for dev HMR
const globalForLifecycle = globalThis as unknown as {
    lifecycleManager: NumberLifecycleManager | undefined
}

class NumberLifecycleManager {
    private boss: PgBossInstance | null = null
    private circuitBreaker: CircuitBreaker | null = null

    private isInitialized = false
    private isShuttingDown = false
    public lastError: string | null = null

    private constructor() { }

    // --------------------------------------------------------------------------
    // Singleton Access
    // --------------------------------------------------------------------------

    static getInstance(): NumberLifecycleManager {
        if (!globalForLifecycle.lifecycleManager) {
            globalForLifecycle.lifecycleManager = new NumberLifecycleManager()
        }
        return globalForLifecycle.lifecycleManager
    }

    // --------------------------------------------------------------------------
    // Initialization
    // --------------------------------------------------------------------------

    async initialize(): Promise<void> {
        if (this.isInitialized && this.boss) {
            logger.warn('[Lifecycle] Already initialized, skipping')
            return
        }

        try {
            logger.info('[Lifecycle] Initializing NumberLifecycleManager with pg-boss...')

            // Get connection string - pg-boss needs direct connection (not pooler)
            // If using Supabase pooler, you may need to use the direct connection URL
            const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL

            if (!connectionString) {
                throw new Error('DATABASE_URL not configured')
            }

            // 1. Initialize pg-boss with existing DATABASE_URL
            // Use eval to bypass Turbopack's module transformation
            // pg-boss exports { PgBoss: class, ... } not a default export
            // eslint-disable-next-line no-eval
            const pgBossModule = eval('require')('pg-boss')
            const PgBoss = pgBossModule.PgBoss

            this.boss = new PgBoss({
                connectionString,
                schema: 'pgboss', // Separate schema to keep things clean
                retryLimit: CONFIG.MAX_RETRIES,
                retryDelay: CONFIG.BACKOFF_BASE_SECONDS,
                retryBackoff: true, // Exponential backoff
                max: 2, // Keep connection count low for pg-boss as it uses persistent connections
                // SSL for Supabase
                ssl: connectionString.includes('supabase') ? { rejectUnauthorized: false } : undefined,
                // Connection pool settings to prevent Supabase timeout
                connectionOptions: {
                    keepAlive: true,
                    keepAliveInitialDelayMillis: 10000, // 10 seconds
                    connectionTimeoutMillis: 30000, // 30 seconds
                    idleTimeoutMillis: 60000, // 1 minute - shorter than Supabase default
                    max: 2,
                },
                // AUTO-CLEANUP: Keep database small for Supabase free tier
                archiveCompletedAfterSeconds: 60 * 60 * 24 * 7,  // Archive completed jobs after 7 days
                deleteAfterSeconds: 60 * 60 * 24 * 30,           // Delete archived jobs after 30 days
                maintenanceIntervalSeconds: 60 * 60,              // Run maintenance every hour
            })

            this.boss.on('error', (error) => {
                logger.error('[Lifecycle] pg-boss error', { error: error.message })
            })

            // 2. Start pg-boss (creates schema/tables automatically)
            await this.boss.start()
            logger.info('[Lifecycle] pg-boss started successfully')

            // 3. Register job handlers
            await this.registerHandlers()

            // 4. Setup Circuit Breaker for provider calls
            this.circuitBreaker = new CircuitBreaker(
                async (activationId: string) => smsProvider.getStatus(activationId),
                {
                    timeout: CONFIG.CIRCUIT_TIMEOUT_MS,
                    errorThresholdPercentage: CONFIG.CIRCUIT_ERROR_THRESHOLD,
                    resetTimeout: CONFIG.CIRCUIT_RESET_MS,
                    volumeThreshold: CONFIG.CIRCUIT_VOLUME_THRESHOLD,
                }
            )

            this.circuitBreaker.on('open', () => {
                lifecycle_circuit_state.set(1)
                logger.warn('[Lifecycle] Circuit breaker OPENED - provider failing')
            })

            this.circuitBreaker.on('halfOpen', () => {
                lifecycle_circuit_state.set(2)
                logger.info('[Lifecycle] Circuit breaker HALF-OPEN - testing provider')
            })

            this.circuitBreaker.on('close', () => {
                lifecycle_circuit_state.set(0)
                logger.info('[Lifecycle] Circuit breaker CLOSED - provider healthy')
            })

            // 5. Recover orphaned active numbers from DB
            await this.recoverActiveNumbers()

            this.isInitialized = true
            this.lastError = null
            logger.info('[Lifecycle] NumberLifecycleManager initialized successfully')

        } catch (error: any) {
            this.lastError = error.message
            logger.error('[Lifecycle] Initialization failed - lifecycle manager disabled', {
                error: error.message,
                hint: 'If using Supabase pooler, set DATABASE_URL_DIRECT env var with direct connection'
            })
            // Don't throw - app continues without lifecycle manager
            // Fallback to cron-based expiry checking
        }
    }

    // --------------------------------------------------------------------------
    // Register Job Handlers
    // --------------------------------------------------------------------------

    private async registerHandlers(): Promise<void> {
        if (!this.boss) return

        // Create queues first (pg-boss requires this before workers)
        await this.boss.createQueue(CONFIG.QUEUE_POLL)
        await this.boss.createQueue(CONFIG.QUEUE_EXPIRE)
        await this.boss.createQueue(CONFIG.QUEUE_NOTIFY)
        logger.info('[Lifecycle] Queues created')

        // Poll handler
        await this.boss.work(
            CONFIG.QUEUE_POLL,
            { teamSize: 5, teamConcurrency: 2 },
            async (job: { data: LifecycleJobData }) => {
                const timer = lifecycle_job_duration.labels('poll').startTimer()
                try {
                    await this.handlePoll(job.data)
                    lifecycle_jobs_total.labels('poll', 'completed').inc()
                } catch (error) {
                    lifecycle_jobs_total.labels('poll', 'failed').inc()
                    throw error
                } finally {
                    timer()
                }
            }
        )

        // Expire handler
        await this.boss.work(
            CONFIG.QUEUE_EXPIRE,
            { teamSize: 5, teamConcurrency: 2 },
            async (job: { data: LifecycleJobData }) => {
                const timer = lifecycle_job_duration.labels('expire').startTimer()
                try {
                    await this.handleExpiry(job.data)
                } finally {
                    timer()
                }
            }
        )

        // Notify handler (future: push notifications)
        await this.boss.work(
            CONFIG.QUEUE_NOTIFY,
            { teamSize: 2, teamConcurrency: 1 },
            async (job: { data: LifecycleJobData }) => {
                logger.info('[Lifecycle] SMS notification', {
                    numberId: job.data.numberId,
                    code: job.data.smsCode
                })
            }
        )

        logger.info('[Lifecycle] Job handlers registered')
    }

    // --------------------------------------------------------------------------
    // Public API
    // --------------------------------------------------------------------------

    /**
     * Schedule polling and timeout for a newly purchased number
     */
    async schedulePolling(numberId: string, activationId: string, userId: string): Promise<void> {
        if (!this.boss) {
            throw new Error('[Lifecycle] Not initialized')
        }

        logger.info('[Lifecycle] Scheduling polling', { numberId, activationId })

        // 1. Add poll job with initial delay
        await this.boss.send(CONFIG.QUEUE_POLL, {
            type: 'poll',
            numberId,
            activationId,
            userId,
            attempt: 0,
        } as LifecycleJobData, {
            startAfter: CONFIG.POLL_INTERVAL_SECONDS,
        })

        // 2. Schedule expiry job at BASE_TIMEOUT
        await this.boss.send(CONFIG.QUEUE_EXPIRE, {
            type: 'expire',
            numberId,
            activationId,
            userId,
        } as LifecycleJobData, {
            startAfter: CONFIG.BASE_TIMEOUT_MINS * 60, // seconds
            singletonKey: `expire:${numberId}`, // Unique - can be cancelled
        })
    }

    /**
     * Cancel scheduled expiry (e.g., when SMS received and we want to extend)
     */
    async cancelExpiry(numberId: string): Promise<void> {
        if (!this.boss) return

        try {
            // pg-boss uses singletonKey for deduplication
            // Cancel by completing any pending expire jobs
            await this.boss.cancel(CONFIG.QUEUE_EXPIRE, `expire:${numberId}`)
            logger.info('[Lifecycle] Cancelled expiry job', { numberId })
        } catch (error) {
            logger.warn('[Lifecycle] Failed to cancel expiry', { numberId, error })
        }
    }

    /**
     * Extend timeout (called when SMS is received)
     */
    async extendTimeout(numberId: string, activationId: string, userId: string): Promise<void> {
        if (!this.boss) return

        // Cancel existing expiry
        await this.cancelExpiry(numberId)

        // Schedule new expiry at EXTENDED_TIMEOUT
        await this.boss.send(CONFIG.QUEUE_EXPIRE, {
            type: 'expire',
            numberId,
            activationId,
            userId,
        } as LifecycleJobData, {
            startAfter: CONFIG.EXTENDED_TIMEOUT_MINS * 60,
            singletonKey: `expire:${numberId}`,
        })

        logger.info('[Lifecycle] Extended timeout', { numberId, newTimeout: CONFIG.EXTENDED_TIMEOUT_MINS })
    }

    /**
     * Get queue stats for health checks
     */
    async getStats(): Promise<{
        queues: Record<string, { created: number; active: number; failed: number }>
        circuitState: string
    }> {
        if (!this.boss) {
            return { queues: {}, circuitState: 'unknown' }
        }

        let pollStats = 0
        let expireStats = 0

        try {
            // Safely attempt to get stats, pg-boss version differences might affect method availability
            if (typeof this.boss.getQueueSize === 'function') {
                [pollStats, expireStats] = await Promise.all([
                    this.boss.getQueueSize(CONFIG.QUEUE_POLL),
                    this.boss.getQueueSize(CONFIG.QUEUE_EXPIRE),
                ])
            }
        } catch (e) {
            logger.warn('[Lifecycle] Failed to get queue stats', { error: e })
        }

        const circuitState = this.circuitBreaker?.opened
            ? 'open'
            : this.circuitBreaker?.halfOpen
                ? 'half-open'
                : 'closed'

        return {
            queues: {
                poll: { created: pollStats || 0, active: 0, failed: 0 },
                expire: { created: expireStats || 0, active: 0, failed: 0 },
            },
            circuitState,
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        if (this.isShuttingDown) return
        this.isShuttingDown = true

        logger.info('[Lifecycle] Shutting down...')

        try {
            if (this.boss) {
                await this.boss.stop({ graceful: true, timeout: 10000 })
            }
            logger.info('[Lifecycle] Shutdown complete')
        } catch (error) {
            logger.error('[Lifecycle] Shutdown error', { error })
        }
    }

    // --------------------------------------------------------------------------
    // Job Processing
    // --------------------------------------------------------------------------

    private async handlePoll(data: LifecycleJobData): Promise<void> {
        const { numberId, activationId, userId, attempt = 0 } = data

        // Check if number still active
        const number = await prisma.number.findUnique({
            where: { id: numberId },
            select: { id: true, status: true },
        })

        if (!number || number.status !== 'active') {
            logger.debug('[Lifecycle] Number no longer active, stopping poll', { numberId })
            return
        }

        try {
            // Use circuit breaker for provider call
            const status = await this.circuitBreaker!.fire(activationId) as ProviderStatusResult

            if (status.messages && status.messages.length > 0) {
                // SMS received!
                await this.onSmsReceived(data, status.messages)
            } else {
                // No SMS yet - re-queue poll with jitter
                const jitter = Math.random() * 2
                await this.boss!.send(CONFIG.QUEUE_POLL, {
                    ...data,
                    attempt: attempt + 1,
                }, {
                    startAfter: CONFIG.POLL_INTERVAL_SECONDS + jitter,
                })
            }
        } catch (error: any) {
            // Circuit breaker may throw if open
            if (error.message?.includes('Breaker is open')) {
                logger.warn('[Lifecycle] Circuit open, will retry', { numberId })
                // Re-queue with backoff
                const delay = Math.min(
                    CONFIG.BACKOFF_BASE_SECONDS * Math.pow(2, attempt) + Math.random(),
                    30
                )
                await this.boss!.send(CONFIG.QUEUE_POLL, { ...data, attempt: attempt + 1 }, {
                    startAfter: delay
                })
            } else {
                throw error
            }
        }
    }

    private async handleExpiry(data: LifecycleJobData): Promise<void> {
        const { numberId } = data

        // Atomic check: only refund if PENDING + no SMS
        const result = await prisma.$transaction(async (tx) => {
            const number = await tx.number.findUnique({
                where: { id: numberId },
                include: { smsMessages: true },
            })

            if (!number) {
                return { action: 'skip' as const, reason: 'not_found' }
            }

            if (number.status !== 'active') {
                return { action: 'skip' as const, reason: 'already_processed' }
            }

            if (number.smsMessages.length > 0) {
                // Has SMS - mark complete, no refund
                await tx.number.update({
                    where: { id: number.id },
                    data: { status: 'completed' },
                })
                return { action: 'complete' as const, reason: 'has_sms' }
            }

            // No SMS - cancel at provider and refund
            try {
                await smsProvider.cancelNumber(number.activationId)
            } catch (e) {
                logger.warn('[Lifecycle] Provider cancel failed, still refunding', {
                    numberId,
                    error: e
                })
            }

            await tx.number.update({
                where: { id: number.id },
                data: { status: 'cancelled' },
            })

            await WalletService.refund(
                number.ownerId,
                number.price.toNumber(),
                'refund',
                number.id,
                `Auto-refund: Timeout ${number.serviceName}`,
                `refund_timeout_${number.id}`,
                tx
            )

            return { action: 'refund' as const, reason: 'timeout_no_sms' }
        })

        logger.info('[Lifecycle] Expiry handled', { numberId, ...result })
        lifecycle_jobs_total.labels('expire', result.action).inc()
    }

    // --------------------------------------------------------------------------
    // SMS Received Handler
    // --------------------------------------------------------------------------

    private async onSmsReceived(
        jobData: LifecycleJobData,
        messages: Array<{ code: string; text?: string }>
    ): Promise<void> {
        const { numberId, activationId, userId } = jobData

        // 1. Store SMS messages
        for (const msg of messages) {
            const existing = await prisma.smsMessage.findFirst({
                where: { numberId, code: msg.code },
            })

            if (!existing) {
                await prisma.smsMessage.create({
                    data: {
                        numberId,
                        code: msg.code,
                        content: msg.text,
                    },
                })
            }
        }

        // 2. Extend timeout
        await this.extendTimeout(numberId, activationId, userId)

        // 3. Queue notification job
        await this.boss!.send(CONFIG.QUEUE_NOTIFY, {
            type: 'sms_notify',
            numberId,
            activationId,
            userId,
            smsCode: messages[0]?.code,
        } as LifecycleJobData)

        logger.info('[Lifecycle] SMS received and processed', {
            numberId,
            messageCount: messages.length
        })
    }

    // --------------------------------------------------------------------------
    // Recovery
    // --------------------------------------------------------------------------

    private async recoverActiveNumbers(): Promise<void> {
        try {
            // Find all active numbers that might need tracking
            const activeNumbers = await prisma.number.findMany({
                where: {
                    status: 'active',
                    createdAt: {
                        gte: new Date(Date.now() - 60 * 60 * 1000)
                    }
                },
                select: {
                    id: true,
                    activationId: true,
                    ownerId: true,
                    expiresAt: true,
                },
            })

            if (activeNumbers.length === 0) {
                logger.info('[Lifecycle] No active numbers to recover')
                return
            }

            logger.info('[Lifecycle] Recovering active numbers', { count: activeNumbers.length })

            // Parallelize recovery to avoid long blocking start
            await Promise.all(activeNumbers.map(async (number) => {
                const remaining = Math.max(0, (number.expiresAt?.getTime() || 0) - Date.now())
                const remainingSeconds = Math.floor(remaining / 1000)

                // Schedule expiry
                await this.boss!.send(CONFIG.QUEUE_EXPIRE, {
                    type: 'expire',
                    numberId: number.id,
                    activationId: number.activationId,
                    userId: number.ownerId,
                } as LifecycleJobData, {
                    startAfter: remainingSeconds,
                    singletonKey: `expire:${number.id}`,
                })

                // Start polling
                await this.boss!.send(CONFIG.QUEUE_POLL, {
                    type: 'poll',
                    numberId: number.id,
                    activationId: number.activationId,
                    userId: number.ownerId,
                    attempt: 0,
                } as LifecycleJobData, {
                    startAfter: CONFIG.POLL_INTERVAL_SECONDS,
                })
            }))

            logger.info('[Lifecycle] Recovery complete')

        } catch (error) {
            logger.error('[Lifecycle] Recovery failed', { error })
        }
    }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const lifecycleManager = NumberLifecycleManager.getInstance()
export { NumberLifecycleManager }
