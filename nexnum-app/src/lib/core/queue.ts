import { PgBoss, Job } from 'pg-boss'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'
import { getTraceId, withRequestContext } from '@/lib/api/request-context'
import { Queue, Worker } from 'bullmq'
import Redis from 'ioredis'
import { getRedisConfig } from '@/lib/core/redis'

// Queue Names
export const QUEUES = {
    NOTIFICATION_DELIVERY: 'notification-delivery',
    SUBSCRIPTION_CLEANUP: 'subscription-cleanup',
    WEBHOOK_PROCESSING: 'webhook-processing',
    PROVIDER_SYNC: 'provider-sync',
    SCHEDULED_SYNC: 'scheduled-sync',
    LIFECYCLE_CLEANUP: 'lifecycle-cleanup',
    PAYMENT_RECONCILE: 'payment-reconcile',
    MASTER_WORKER: 'master-worker',
    SEARCH_AGGREGATES: 'search.aggregates',
    PROVIDER_RELIABILITY: 'provider.reliability',
    ZOMBIE_CHECK: 'zombie-check'
} as const

class QueueService {
    private boss: PgBoss | null = null
    private isReady = false
    private startPromise: Promise<void> | null = null

    // BullMQ Shadow Mode Queues and Workers
    private shadowQueues: Map<string, Queue> = new Map()
    private shadowWorkers: Map<string, Worker> = new Map()

    constructor() {
        const url = process.env.DIRECT_URL || process.env.DATABASE_URL
        if (url) {
            const cleanUrl = url.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/(\?|&)$/, '')

            this.boss = new PgBoss({
                connectionString: cleanUrl,
                max: 3,
                application_name: 'NexNum-Queue',
                queueCacheIntervalSeconds: 5,
                ssl: { rejectUnauthorized: false },
            })

            this.boss.on('error', (error) => {
                logger.error('Queue Client Error (pg-boss)', {
                    error: error.message,
                    stack: error.stack
                })
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
            let delay = 3000

            while (attempts > 0) {
                try {
                    const currentAttempt = 6 - attempts
                    logger.debug(`Queue Service starting (Attempt ${currentAttempt}/5)...`)

                    // Start pg-boss (Primary)
                    await this.boss!.start()

                    // Ensure critical queues exist in pg-boss
                    for (const queueName of Object.values(QUEUES)) {
                        try {
                            await this.boss!.createQueue(queueName)
                        } catch (e: any) {
                            if (e.message && !e.message.includes('already exists')) {
                                logger.warn(`Queue creation warning for ${queueName}`, { error: e.message })
                            }
                        }
                    }

                    // Setup BullMQ (Shadow Mode)
                    try {
                        const redisConfig = getRedisConfig()
                        for (const queueName of Object.values(QUEUES)) {
                            // Close and disconnect any existing instance before re-creating (prevents connection leaks on retry)
                            const existing = this.shadowQueues.get(queueName)
                            if (existing) {
                                await existing.close().catch(() => {})
                                this.shadowQueues.delete(queueName)
                            }

                            const q = new Queue(queueName, {
                                connection: new Redis(redisConfig, { maxRetriesPerRequest: null }),
                                defaultJobOptions: {
                                    removeOnComplete: { count: 100 },
                                    removeOnFail: { age: 3600 * 24 * 7, count: 500 }
                                }
                            })
                            // Attach general error listener to Queue instance
                            q.on('error', (err) => {
                                logger.error(`Queue Service [SHADOW]: Queue global error on ${queueName}`, { error: err.message })
                            })
                            this.shadowQueues.set(queueName, q)
                        }
                        logger.info('Queue Service: Initialized BullMQ shadow queues')
                    } catch (err: any) {
                        logger.error('Queue Service: Failed to initialize BullMQ shadow queues', { error: err.message })
                    }

                    // Verify direct pg-boss connection
                    let cacheReady = false
                    for (let v = 0; v < 3; v++) {
                        try {
                            const allQueues = await this.boss!.getQueues()
                            logger.debug(`Queue DB Connection verified. Found ${allQueues?.length || 0} queues via direct query.`)

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
            
            // Primary write: pg-boss
            const jobId = await this.boss.send(queue, enrichedData, options)

            // Shadow write: BullMQ
            const shadowQ = this.shadowQueues.get(queue)
            if (shadowQ) {
                const bullOpts: any = {}
                if (options) {
                    if (options.startAfter) {
                        bullOpts.delay = options.startAfter * 1000
                    }
                    if (options.singletonKey) {
                        bullOpts.jobId = options.singletonKey
                    }
                }
                shadowQ.add('default', enrichedData, bullOpts).catch(err => {
                    logger.warn(`Queue Service [SHADOW]: Failed dual-write to ${queue}`, { error: err.message })
                })
            }

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
            // Register primary worker
            await this.boss!.work(queue, wrappedHandler)
            logger.info(`Worker registered for ${queue} (pg-boss)`)

            // Register shadow worker (BullMQ)
            const shadowQ = this.shadowQueues.get(queue)
            if (shadowQ) {
                try {
                    const shadowWorker = new Worker(queue, async (job) => {
                        const traceId = job.data?._traceId || `shadow_${Date.now().toString(36)}`
                        return withRequestContext({ traceId }, async () => {
                            logger.info(`Queue Service [SHADOW - DUAL RUN]: Executing log-only job on ${queue}`, {
                                jobId: job.id,
                                traceId,
                                data: job.data
                            })
                        })
                    }, {
                        connection: new Redis(getRedisConfig(), { maxRetriesPerRequest: null }),
                        concurrency: 5
                    })

                    // Audit events
                    shadowWorker.on('failed', (job, err) => {
                        logger.warn(`Queue Service [SHADOW]: Job failed on ${queue}`, { jobId: job?.id, error: err.message })
                    })

                    shadowWorker.on('error', (err) => {
                        logger.error(`Queue Service [SHADOW]: Worker global error on ${queue}`, { error: err.message })
                    })

                    shadowWorker.on('stalled', (jobId) => {
                        logger.warn(`Queue Service [SHADOW]: Job stalled and reclaimed on ${queue}`, { jobId })
                    })

                    this.shadowWorkers.set(queue, shadowWorker)
                    logger.info(`Shadow worker registered for ${queue} (BullMQ)`)
                } catch (shadowErr: any) {
                    logger.warn(`Queue Service [SHADOW]: Failed to register worker for ${queue}`, { error: shadowErr.message })
                }
            }
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
            // Stop pg-boss
            await this.boss.stop({ graceful: true, timeout: 30000 })
            this.isReady = false
            logger.info('Queue Service stopped gracefully')

            // Stop BullMQ shadow workers & queues
            for (const shadowWorker of this.shadowWorkers.values()) {
                await shadowWorker.close()
            }
            this.shadowWorkers.clear()

            for (const shadowQ of this.shadowQueues.values()) {
                await shadowQ.close()
            }
            this.shadowQueues.clear()
            logger.info('Queue Service [SHADOW]: Stopped all shadow queues and workers')
        } catch (error: any) {
            logger.error('Failed to stop queue', { error: error.message })
            throw error
        }
    }
}

export const queue = new QueueService()
