import { PgBoss, Job } from 'pg-boss'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'
import { getTraceId, withRequestContext } from '@/lib/api/request-context'

// Queue Names
export const QUEUES = {
    NOTIFICATION_DELIVERY: 'notification-delivery',
    SUBSCRIPTION_CLEANUP: 'subscription-cleanup',
    WEBHOOK_PROCESSING: 'webhook-processing',
    PROVIDER_SYNC: 'provider-sync',
    SCHEDULED_SYNC: 'scheduled-sync',
    LIFECYCLE_CLEANUP: 'lifecycle-cleanup',
    PAYMENT_RECONCILE: 'payment-reconcile',
    MASTER_WORKER: 'master-worker'
} as const

class QueueService {
    private boss: PgBoss | null = null
    private isReady = false
    private startPromise: Promise<void> | null = null

    constructor() {
        const url = process.env.DIRECT_URL || process.env.DATABASE_URL
        if (url) {
            // Industrial defaults: Increase pool size for production stability
            this.boss = new PgBoss({
                connectionString: url,
                max: 10, // Increased from 2 to 10
                application_name: 'NexNum-Queue'
            })

            this.boss.on('error', (error) => {
                logger.error('Queue Client Error', {
                    error: error.message,
                    stack: error.stack
                })
                // Critical: Reset ready state if we get a connection error
                if (error.message.includes('connection') || error.message.includes('terminat')) {
                    this.isReady = false
                    this.startPromise = null
                }
            })

            if (process.env.DIRECT_URL) {
                logger.debug('Queue Initialized using DIRECT_URL')
            }
        } else {
            logger.warn('Queue No URL set, disabled')
        }
    }

    async start() {
        if (!this.boss) return
        if (this.isReady) return

        // Prevent concurrent start attempts (Race Condition Fix)
        if (this.startPromise) return this.startPromise

        this.startPromise = (async () => {
            try {
                logger.debug('Queue Service starting...')
                await this.boss!.start()

                // Ensure critical queues exist
                for (const queueName of Object.values(QUEUES)) {
                    try {
                        await this.boss!.createQueue(queueName)
                    } catch (e: any) {
                        // Ignore "already exists" errors, but log others
                        if (!e.message.includes('already exists')) {
                            logger.warn(`Queue creation warning for ${queueName}`, { error: e.message })
                        }
                    }
                }

                this.isReady = true

                // FINAL VERIFICATION: Prove the manager is ready and cache is initialized
                // This prevents the "Queue cache is not initialized" error by forcing a cache-dependent call
                try {
                    // We check if the primary sync queue is recognized by the manager
                    // Using "any" because getQueueStats type might be missing from some pg-boss types
                    await (this.boss! as any).getQueueStats(QUEUES.PROVIDER_SYNC)
                    logger.debug(`Queue Verification successful for ${QUEUES.PROVIDER_SYNC}`)
                } catch (ve: any) {
                    if (ve.message?.includes('not exist')) {
                        // Queue doesn't exist yet, that's fine if we just created it
                        // The cache is still initialized if it got this far
                        logger.debug('Queue cache initialized (verified via existence check)')
                    } else if (ve.message?.includes('cache is not initialized')) {
                        // This is what we're trying to prevent/catch
                        this.isReady = false
                        this.startPromise = null
                        throw new Error(`PgBoss Manager started but Cache failed to initialize: ${ve.message}`)
                    } else {
                        logger.warn('Queue Post-start verification warning', { error: ve.message })
                    }
                }

                logger.info('Queue Service started successfully')
            } catch (error: any) {
                this.isReady = false
                this.startPromise = null // Allow retry
                logger.error('Queue Failed to start', {
                    error: error.message,
                    code: error.code,
                    detail: error.detail
                })
                throw error
            }
        })()

        return this.startPromise
    }

    async publish(queue: string, data: any, options?: any) {
        if (!this.isReady) await this.start()
        if (!this.boss) throw new Error('Queue not initialized')
        try {
            // Automatically attach traceId to all published jobs
            const enrichedData = {
                ...data,
                _traceId: getTraceId()
            }
            const jobId = await this.boss.send(queue, enrichedData, options)
            return jobId
        } catch (error: any) {
            logger.error(`Failed to publish to ${queue}`, { error: error.message })
            throw error
        }
    }

    async fetch(queue: string, batchSize: number) {
        if (!this.isReady) await this.start()
        if (!this.boss) throw new Error('Queue not initialized')
        try {
            return (await this.boss.fetch(queue, { batchSize })) || []
        } catch (error: any) {
            logger.error(`Failed to fetch from ${queue}`, { error: error.message })
            return []
        }
    }

    async complete(queue: string, jobId: string) {
        if (!this.boss) return
        try {
            await this.boss.complete(queue, jobId)
        } catch (error: any) {
            logger.error(`Failed to complete job ${jobId}`, { error: error.message })
        }
    }

    async fail(queue: string, jobId: string, error: Error) {
        if (!this.boss) return
        try {
            await this.boss.fail(queue, jobId, error)
        } catch (err) {
            logger.error(`Failed to fail job ${jobId}`, { error: err['message'] })
        }
    }

    async work<T>(queue: string, handler: (jobs: Job<T>[]) => Promise<void>) {
        if (!this.boss) throw new Error('Queue not initialized')
        if (!this.isReady) await this.start()

        const wrappedHandler = async (jobs: Job<any>[]) => {
            // For batch processing, we use the traceId of the first job or generate a new one
            const firstJob = jobs[0]
            const traceId = firstJob?.data?._traceId || `worker_${Date.now().toString(36)}`

            return withRequestContext({ traceId }, async () => {
                return handler(jobs)
            })
        }

        try {
            await this.boss!.work(queue, wrappedHandler)
            logger.info(`Worker registered for ${queue}`)
        } catch (error: any) {
            logger.error(`Failed to register worker for ${queue}`, { error: error.message })
            throw error
        }
    }

    /**
     * Schedule a recurring job (Cron)
     */
    async schedule(queue: string, cron: string, data?: any) {
        if (!this.isReady) await this.start()
        if (!this.boss) throw new Error('Queue not initialized')

        try {
            await this.boss.schedule(queue, cron, data || {})
            logger.info(`Scheduled job for ${queue} with cron: ${cron}`)
        } catch (error: any) {
            logger.error(`Failed to schedule ${queue}`, { error: error.message })
            throw error
        }
    }
    /**
     * Check if there are any active or created jobs in a queue
     */
    async getQueueStatus(queue: string) {
        if (!this.isReady) await this.start()
        if (!this.boss) throw new Error('Queue not initialized')

        try {
            // Count jobs directly from DB since pg-boss instance might not expose getQueueSize
            // Schema is typically 'pgboss', table is 'job'

            // Note: pg-boss documentation says state is 'created', 'active', etc.
            // Queue name is in the 'name' column.

            // Using prisma raw query for speed and reliability independent of library version
            const counts = await prisma.$queryRaw<any[]>`
                SELECT state, COUNT(*) as count 
                FROM pgboss.job 
                WHERE name = ${queue} 
                AND state IN ('created', 'active', 'retry')
                GROUP BY state
            `

            let active = 0
            let pending = 0

            if (Array.isArray(counts)) {
                counts.forEach(row => {
                    // row.count comes back as BigInt from Postgres
                    const count = Number(row.count)
                    if (row.state === 'active' || row.state === 'retry') active += count
                    if (row.state === 'created') pending += count
                })
            }

            return {
                queue,
                active,
                pending,
                isSyncing: (active > 0 || pending > 0)
            }
        } catch (error: any) {
            logger.error(`Failed to get status for ${queue}`, { error: error.message })
            // Return empty status rather than crashing, to keep UI stable
            return { queue, active: 0, pending: 0, isSyncing: false, error: error.message }
        }
    }

    /**
     * Gracefully stop the queue (for shutdown)
     */
    async stop() {
        if (!this.boss) return
        try {
            await this.boss.stop({ graceful: true, timeout: 30000 })
            this.isReady = false
            logger.info('Queue Service stopped gracefully')
        } catch (error: any) {
            logger.error('Failed to stop queue', { error: error.message })
            throw error
        }
    }
}

export const queue = new QueueService()
