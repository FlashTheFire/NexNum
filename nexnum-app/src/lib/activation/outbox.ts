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

import { meili, INDEXES, OfferDocument } from '@/lib/search/search'
import { getCanonicalName, generateCanonicalCode } from '@/lib/normalizers/service-identity'



// Helper to handle payload-based updates
async function handleOfferEvent(aggregateId: string, payload: any) {
    const index = meili.index(INDEXES.OFFERS)
    try {
        if (payload?.stockRestored) {
            const doc = await index.getDocument(aggregateId) as OfferDocument
            await index.updateDocuments([{
                ...doc,
                stock: (doc.stock || 0) + Number(payload.stockRestored)
            }])
        }
    } catch (e) {
        // Ignore if doc not found
    }
}

/**
 * Consumer Worker
 * Scans for PENDING events and publishes them (Syncs to MeiliSearch).
 */
export async function processOutboxEvents(batchSize = 50) {
    const events = await fetchPendingOutboxEvents(batchSize)
    const results = { succeeded: 0, failed: 0, count: events.length }

    if (events.length === 0) return results

    for (const event of events) {
        try {
            if (event.eventType === 'offer.created' || event.eventType === 'offer.updated') {
                await handleOfferEvent(event.aggregateId, event.payload)
            }

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
