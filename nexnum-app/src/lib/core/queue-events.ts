/**
 * QueueEvents Singleton Registry
 *
 * BullMQ's QueueEvents opens a dedicated Redis Pub/Sub connection per queue.
 * To prevent connection growth from multiplying with worker count, this module
 * provides a single registry of QueueEvents instances, meant to be shared
 * across the entire metrics/monitoring process.
 *
 * Usage pattern (1 metrics process only):
 *   import { getQueueEvents } from '@/lib/core/queue-events'
 *   const events = getQueueEvents('notification-delivery')
 *   events.on('completed', ({ jobId }) => { ... })
 *
 * Never instantiate QueueEvents directly inside a worker process.
 * If you see [QUEUE_EVENTS_INIT] in a worker container log, that is a bug.
 */

import { QueueEvents } from 'bullmq'
import Redis from 'ioredis'
import { getRedisConfig } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'
import { QUEUES } from '@/lib/core/queue'

// Singleton registry: one QueueEvents per queue name
const registry = new Map<string, QueueEvents>()

/**
 * Returns the singleton QueueEvents for the given queue.
 * Creates it on first access; subsequent calls return the same instance.
 */
export function getQueueEvents(queueName: string): QueueEvents {
    const existing = registry.get(queueName)
    if (existing) return existing

    const qe = new QueueEvents(queueName, {
        connection: new Redis(getRedisConfig(), { maxRetriesPerRequest: null }),
    })

    qe.on('error', (err) => {
        logger.error(`QueueEvents error on ${queueName}`, { error: err.message })
    })

    registry.set(queueName, qe)
    return qe
}

/**
 * Initialise QueueEvents for every known queue.
 * Call this ONCE at metrics-process startup — never from worker processes.
 *
 * If this log line appears in a worker container, a misconfiguration exists.
 */
export async function initAllQueueEvents(): Promise<void> {
    for (const queueName of Object.values(QUEUES)) {
        getQueueEvents(queueName)
    }
    logger.info('[QUEUE_EVENTS_INIT] QueueEvents registry initialised', {
        queues: registry.size,
        mode: 'metrics-only',
        pid: process.pid,
    })
}

/**
 * Gracefully close all QueueEvents connections.
 * Call this during metrics-process graceful shutdown.
 */
export async function closeAllQueueEvents(): Promise<void> {
    const count = registry.size
    const closures = [...registry.values()].map((qe) => qe.close())
    await Promise.all(closures)
    registry.clear()
    logger.info('[QUEUE_EVENTS_CLOSED] QueueEvents registry closed', {
        queues: count,
        pid: process.pid,
    })
}
