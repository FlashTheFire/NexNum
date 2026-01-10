import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/core/db'

export type OutboxPayload = {
    aggregateType: string
    aggregateId: string
    eventType: string
    payload: any
}

/**
 * Creates an Outbox event within a transaction.
 * Ensures consistent data + event creation.
 */
export async function createOutboxEvent(
    tx: Prisma.TransactionClient,
    data: OutboxPayload
) {
    return tx.outboxEvent.create({
        data: {
            aggregateType: data.aggregateType,
            aggregateId: data.aggregateId,
            eventType: data.eventType,
            payload: data.payload,
            status: 'PENDING'
        }
    })
}

/**
 * Helper to publish outbox event without an external transaction
 */
export async function publishOutboxEvent(data: OutboxPayload) {
    return prisma.outboxEvent.create({
        data: {
            aggregateType: data.aggregateType,
            aggregateId: data.aggregateId,
            eventType: data.eventType,
            payload: data.payload,
            status: 'PENDING'
        }
    })
}

export async function fetchPendingOutboxEvents(limit = 50) {
    return prisma.outboxEvent.findMany({
        where: { status: 'PENDING' },
        take: limit,
        orderBy: { createdAt: 'asc' }
    })
}

export async function markEventsProcessed(ids: string[]) {
    if (ids.length === 0) return
    return prisma.outboxEvent.updateMany({
        where: { id: { in: ids } },
        data: {
            status: 'PUBLISHED',
            // updated_at will auto update
        }
    })
}

export async function markEventFailed(id: string, error: string) {
    return prisma.outboxEvent.update({
        where: { id },
        data: {
            status: 'FAILED',
            error,
            retryCount: { increment: 1 }
        }
    })
}

export async function getOutboxStats() {
    const [pending, failed, published] = await Promise.all([
        prisma.outboxEvent.count({ where: { status: 'PENDING' } }),
        prisma.outboxEvent.count({ where: { status: 'FAILED' } }),
        prisma.outboxEvent.count({ where: { status: 'PUBLISHED' } })
    ])
    return { pending, failed, published }
}

/**
 * Consumer Worker
 * Scans for PENDING events and publishes them (e.g. to Redis/Log).
 */
export async function processOutboxEvents(batchSize = 50) {
    const events = await fetchPendingOutboxEvents(batchSize)
    const results = { succeeded: 0, failed: 0, count: events.length }

    if (events.length === 0) return results

    // In a real worker, we would process these.
    // Since this method is often just "marking as published" if we don't have a specific handler:

    // Note: The logic inside the original version was "Simulate Publish".
    // We will keep it simple here.

    for (const event of events) {
        try {
            // Simulate processing
            // console.log(`[Outbox] Processing: ${event.eventType}`)
            await markEventsProcessed([event.id])
            results.succeeded++
        } catch (err: any) {
            await markEventFailed(event.id, err.message)
            results.failed++
        }
    }
    return results
}

export async function cleanupProcessedEvents(olderThanDays = 7) {
    const date = new Date()
    date.setDate(date.getDate() - olderThanDays)

    return prisma.outboxEvent.deleteMany({
        where: {
            status: { in: ['PUBLISHED', 'FAILED'] }, // Cleanup failed ones too if old? Or just published.
            createdAt: { lt: date }
        }
    })
}
