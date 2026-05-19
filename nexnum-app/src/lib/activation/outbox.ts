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
import { getCurrencyService } from '@/lib/currency/currency-service'
import { logger } from '@/lib/core/logger'


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
 * Handle a currency.rates_changed outbox event.
 *
 * Processes ONE batch of up to 500 stale Meilisearch offer documents per worker tick.
 * If more stale docs remain after the batch, re-queues a new event with the next offset
 * so the next worker run continues where this one left off.
 *
 * This keeps each worker tick bounded in time and memory, regardless of offer count.
 */
const MEILI_REINDEX_BATCH = 500

async function processCurrencyRatesChanged(eventId: string, payload: any): Promise<void> {
    const { ratesVersion, offset = 0 } = payload as { ratesVersion: number; offset: number }
    const currencyService = getCurrencyService()
    const index = meili.index(INDEXES.OFFERS)

    const staleFilter = `isActive = true AND currencyPricesVersion < ${ratesVersion}`

    logger.info(`[outbox] Starting currency.rates_changed (event=${eventId}): v=${ratesVersion}, offset=${offset}`)

    let hits: { id: string; pointPrice: number }[]
    let isFallback = false
    try {
        const result = await index.search('', {
            filter: staleFilter,
            limit: MEILI_REINDEX_BATCH,
            offset,
            attributesToRetrieve: ['id', 'pointPrice'],
        })
        hits = result.hits as { id: string; pointPrice: number }[]
    } catch (err: any) {
        // Only fallback to full scan if error suggests filter attribute is not filterable yet in Meilisearch
        const isFilterError = 
            err?.code === 'invalid_search_filter' || 
            err?.code === 'invalid_filter' || 
            err?.message?.toLowerCase().includes('filter') || 
            err?.message?.toLowerCase().includes('not filterable') ||
            err?.message?.toLowerCase().includes('unrecognized filter')

        if (isFilterError) {
            // currencyPricesVersion not yet filterable — fall back to full scan at current offset
            isFallback = true
            const result = await index.search('', {
                filter: 'isActive = true',
                limit: MEILI_REINDEX_BATCH,
                offset,
                attributesToRetrieve: ['id', 'pointPrice'],
            })
            hits = result.hits as { id: string; pointPrice: number }[]
        } else {
            // Rethrow genuine network/auth/system failures
            logger.error(`[outbox] currency.rates_changed (event=${eventId}) search failed`, {
                ratesVersion,
                offset,
                error: err.message
            })
            throw err
        }
    }

    if (hits.length > 0) {
        const documents = await Promise.all(
            hits.map(async (hit) => {
                const currencyPrices = await currencyService.pointsToAllFiat(hit.pointPrice || 0)
                return { id: hit.id, currencyPrices, currencyPricesVersion: ratesVersion }
            })
        )
        await index.updateDocuments(documents)
        logger.info(`[outbox] currency.rates_changed (event=${eventId}): updated ${documents.length} offers at offset=${offset}, v=${ratesVersion}`)
    }

    // If a full batch was returned, more docs may remain — re-queue
    if (hits.length === MEILI_REINDEX_BATCH) {
        await publishOutboxEvent({
            aggregateType: 'system',
            aggregateId: 'currency',
            eventType: 'currency.rates_changed',
            payload: { 
                ratesVersion, 
                // Always re-query from offset 0 if filter worked (since updated docs fall out of the filter), 
                // otherwise use shifted offset for the fallback full scan
                offset: isFallback ? offset + MEILI_REINDEX_BATCH : 0 
            }
        })
    } else {
        logger.info(`[outbox] currency.rates_changed (event=${eventId}): reindex complete for v=${ratesVersion}`)
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
            } else if (event.eventType === 'currency.rates_changed') {
                await processCurrencyRatesChanged(event.id, event.payload)
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
