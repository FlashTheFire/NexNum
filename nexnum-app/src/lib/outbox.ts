/**
 * Outbox Pattern Utilities
 * 
 * Ensures reliable indexing to MeiliSearch by writing outbox events
 * in the same transaction as data changes.
 * 
 * Pattern: Write to DB + Outbox in same TX → Worker polls Outbox → Index to Meili
 */

import { prisma } from './db'
import { Prisma } from '@prisma/client'

export type OutboxEventType =
    | 'offer.created'
    | 'offer.updated'
    | 'offer.deleted'
    | 'service_aggregate.updated'
    | 'order.created'
    | 'provider.synced'

export type AggregateType = 'offer' | 'service_aggregate' | 'order' | 'provider'

interface OutboxEventInput {
    aggregateType: AggregateType
    aggregateId: string
    eventType: OutboxEventType
    payload: Record<string, unknown>
}

/**
 * Create an outbox event within an existing transaction
 * Use this when you want to include the outbox write in your own transaction
 */
export async function createOutboxEvent(
    tx: Prisma.TransactionClient,
    event: OutboxEventInput
) {
    return tx.outboxEvent.create({
        data: {
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            payload: event.payload as Prisma.InputJsonValue,
        }
    })
}

/**
 * Create an outbox event (standalone, creates own transaction)
 * Use this for simple cases where you don't need a larger transaction
 */
export async function publishOutboxEvent(event: OutboxEventInput) {
    return prisma.outboxEvent.create({
        data: {
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            payload: event.payload as Prisma.InputJsonValue,
        }
    })
}

/**
 * Fetch unprocessed outbox events for the indexer worker
 * @param batchSize Number of events to fetch
 */
export async function fetchPendingOutboxEvents(batchSize = 100) {
    return prisma.outboxEvent.findMany({
        where: {
            processed: false,
            retryCount: { lt: 5 } // Max 5 retries
        },
        orderBy: { createdAt: 'asc' },
        take: batchSize
    })
}

/**
 * Mark outbox events as processed
 */
export async function markEventsProcessed(eventIds: bigint[]) {
    return prisma.outboxEvent.updateMany({
        where: { id: { in: eventIds } },
        data: {
            processed: true,
            processedAt: new Date()
        }
    })
}

/**
 * Mark an event as failed with retry increment
 */
export async function markEventFailed(eventId: bigint, error: string) {
    return prisma.outboxEvent.update({
        where: { id: eventId },
        data: {
            retryCount: { increment: 1 },
            error
        }
    })
}

/**
 * Get outbox stats for monitoring
 */
export async function getOutboxStats() {
    const [pending, processed, failed] = await Promise.all([
        prisma.outboxEvent.count({ where: { processed: false, retryCount: { lt: 5 } } }),
        prisma.outboxEvent.count({ where: { processed: true } }),
        prisma.outboxEvent.count({ where: { processed: false, retryCount: { gte: 5 } } })
    ])

    return { pending, processed, failed }
}

/**
 * Clean up old processed events (run periodically)
 */
export async function cleanupProcessedEvents(olderThanDays = 7) {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

    return prisma.outboxEvent.deleteMany({
        where: {
            processed: true,
            processedAt: { lt: cutoff }
        }
    })
}
