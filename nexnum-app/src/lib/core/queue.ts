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
                application_name: 'NexNum-Queue',
                queueCacheIntervalSeconds: 5 // Industrial speed: refresh cache every 5s instead of 60s
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

        if (this.startPromise) return this.startPromise

        this.startPromise = (async () => {
            let attempts = 5
            let delay = 3000 // 3s between attempts for real industrial breathing room

            while (attempts > 0) {
                try {
                    const currentAttempt = 6 - attempts
                    logger.debug(`Queue Service starting (Attempt ${currentAttempt}/5)...`)

                    // Step 1: Core Start
                    await this.boss!.start()

                    // Step 2: Ensure critical queues exist
                    for (const queueName of Object.values(QUEUES)) {
                        try {
                            await this.boss!.createQueue(queueName)
                        } catch (e: any) {
                            if (e.message && !e.message.includes('already exists')) {
                                logger.warn(`Queue creation warning for ${queueName}`, { error: e.message })
                            }
                        }
                    }

                    // Step 3: Industrial Heartbeat - Prove the cache is initialized
                    // PgBoss.start() swallows internal cache population errors. 
                    // Calling getQueues() directly forces those errors to surface.
                    let cacheReady = false
                    for (let v = 0; v < 3; v++) {
                        try {
                            // First, prove the DB connection by fetching all queues (no internal cache needed)
                            const allQueues = await this.boss!.getQueues()
                            logger.debug(`Queue DB Connection verified. Found ${allQueues?.length || 0} queues via direct query.`)

                            // Second, prove the manager's cache is populated (the source of 500 errors)
                            const status = await (this.boss! as any).getQueueStats(QUEUES.PROVIDER_SYNC)
                            logger.debug(`Queue verified: ${status.name} ready & cached (Attempt ${v + 1}/3).`)

                            cacheReady = true
                            this.isReady = true
                            break
                        } catch (ve: any) {
                            if (ve.message?.includes('not initialized')) {
                                logger.warn(`Queue cache initialization heartbeat failed (v=${v + 1}/3), waiting for auto-population...`, { detail: ve.message })
                                await new Promise(r => setTimeout(r, 2000))
                            } else if (ve.message?.includes('not exist')) {
                                logger.debug(`Queue ${QUEUES.PROVIDER_SYNC} recognized but empty. Cache is initialized.`)
                                cacheReady = true
                                this.isReady = true
                                break
                            } else {
                                logger.error('Queue Heartbeat threw industrial error', { error: ve.message })
                                throw ve
                            }
                        }
                    }

                    if (cacheReady) {
                        logger.info('Queue Service started successfully and verified.')
                        break
                    } else {
                        throw new Error('Queue manager started but metadata cache heartbeat timed out')
                    }
                } catch (error: any) {
                    attempts--
                    if (attempts === 0) {
                        this.isReady = false
                        this.startPromise = null
                        logger.error('Queue Final Startup Failure', {
                            error: error.message,
                            code: error.code
                        })
                        throw error
                    }

                    logger.warn(`Queue startup attempted but failed, retrying in ${delay}ms...`, { error: error.message })
                    await new Promise(r => setTimeout(r, delay))
                    delay *= 1.2
                }
            }
        })()

        return this.startPromise
    }

    async publish(queue: string, data: any, options?: any) {
        if (!this.isReady) await this.start()
        if (!this.boss) throw new Error('Queue not initialized')
        try {
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
            logger.error(`Failed to fail job ${jobId}`, { error: (err as Error).message })
        }
    }

    async work<T>(queue: string, handler: (jobs: Job<T>[]) => Promise<void>) {
        if (!this.boss) throw new Error('Queue not initialized')
        if (!this.isReady) await this.start()

        const wrappedHandler = async (jobs: Job<any>[]) => {
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

    async getQueueStatus(queue: string) {
        if (!this.isReady) await this.start()
        if (!this.boss) throw new Error('Queue not initialized')

        try {
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
            return { queue, active: 0, pending: 0, isSyncing: false, error: error.message }
        }
    }

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
