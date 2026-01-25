import { PgBoss, Job } from 'pg-boss'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'

// Queue Names
export const QUEUES = {
    NOTIFICATION_DELIVERY: 'notification-delivery',
    SUBSCRIPTION_CLEANUP: 'subscription-cleanup',
    WEBHOOK_PROCESSING: 'webhook-processing', // Use the name from worker-entry
    PROVIDER_SYNC: 'provider-sync'
} as const

class QueueService {
    private boss: PgBoss | null = null
    private isReady = false

    constructor() {
        const url = process.env.DIRECT_URL || process.env.DATABASE_URL
        if (url) {
            // pg-boss needs a direct connection (Session mode) for advisory locks
            // Transaction-mode poolers (port 6543) will cause fetch errors.
            // Transaction-mode poolers (port 6543) will cause fetch errors.
            this.boss = new PgBoss({
                connectionString: url,
                max: 2 // Minimal connections for queue maintenance
            })
            this.boss.on('error', (error) => logger.error('Queue Client Error', { error: error.message }))

            if (process.env.DIRECT_URL) {
                logger.debug('Queue Initialized using DIRECT_URL')
            } else {
                // In Dev, DATABASE_URL is usually direct anyway. Suppress noise.
                // In Prod, we want to warn because pgbouncer might be used.
                if (process.env.NODE_ENV !== 'development') {
                    logger.warn('Queue Initialized using DATABASE_URL (Lock failures possible if using pgbouncer)')
                } else {
                    logger.debug('Queue Initialized using DATABASE_URL')
                }
            }
        } else {
            logger.warn('Queue No DATABASE_URL or DIRECT_URL set, queue disabled')
        }
    }

    async start() {
        if (!this.boss || this.isReady) return

        try {
            await this.boss.start()

            // Explicitly create queues to avoid "Queue does not exist" errors
            // In some environments, auto-creation on publish can fail or be delayed.
            for (const queueName of Object.values(QUEUES)) {
                try {
                    await this.boss.createQueue(queueName)
                } catch (e) {
                    // Ignore "already exists" errors if pg-boss doesn't handle natively
                }
            }

            this.isReady = true
            logger.info('Queue Service started and queues initialized')
        } catch (error) {
            logger.error('Queue Failed to start', { error: error.message })
            throw error
        }
    }

    async publish(queue: string, data: any, options?: any) {
        if (!this.isReady) await this.start()
        if (!this.boss) throw new Error('Queue not initialized')

        try {
            // In pg-boss v12, send argument can be a Request object or (name, data, options)
            const jobId = await this.boss.send(queue, data, options)
            logger.debug(`Job enqueued to ${queue}`, { jobId })
            return jobId
        } catch (error: any) {
            logger.error(`Failed to publish to ${queue}`, {
                error: error.message,
                queue,
                data
            })
            throw error
        }
    }

    /**
     * Fetch a batch of jobs for processing (Cron/API mode)
     */
    async fetch(queue: string, batchSize: number) {
        if (!this.isReady) await this.start()
        if (!this.boss) throw new Error('Queue not initialized')

        try {
            const jobs = await this.boss.fetch(queue, { batchSize })
            return jobs || []
        } catch (error: any) {
            logger.error(`Failed to fetch from ${queue}`, {
                error: error.message,
                queue
            })
            return []
        }
    }

    /**
     * Mark a job as completed
     */
    async complete(queue: string, jobId: string) {
        if (!this.boss) return
        try {
            await this.boss.complete(queue, jobId)
        } catch (error) {
            logger.error(`Failed to complete job ${jobId}`, { error: error.message })
        }
    }

    /**
     * Mark a job as failed
     */
    async fail(queue: string, jobId: string, error: Error) {
        if (!this.boss) return
        try {
            await this.boss.fail(queue, jobId, error)
        } catch (err) {
            logger.error(`Failed to fail job ${jobId}`, { error: err.message })
        }
    }

    async work<T>(queue: string, handler: (jobs: Job<T>[]) => Promise<void>) {
        if (!this.boss) throw new Error('Queue not initialized')
        if (!this.isReady) await this.start()

        try {
            await this.boss!.work(queue, handler)
            logger.info(`Worker registered for ${queue}`)
        } catch (error: any) {
            logger.error(`Failed to register worker for ${queue}`, { error: error.message })
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
}

export const queue = new QueueService()
