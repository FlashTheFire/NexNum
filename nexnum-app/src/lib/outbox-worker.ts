/**
 * Outbox Worker - Reliable MeiliSearch Indexing
 * 
 * Polls the outbox table and processes events to update MeiliSearch.
 * Features:
 * - Batch processing for efficiency
 * - Exponential backoff on failures
 * - DLQ after max retries
 * - Idempotent updates
 */

import { prisma } from './db'
import { fetchPendingOutboxEvents, markEventsProcessed, markEventFailed, getOutboxStats } from './outbox'
import { meili, INDEXES, OfferDocument } from './search'
import { outboxPendingCount, outboxLagSeconds, outboxProcessedTotal } from './metrics'

// Configuration
const BATCH_SIZE = 100
const POLL_INTERVAL_MS = 5000 // 5 seconds
const MAX_RETRIES = 5

let isRunning = false
let pollInterval: NodeJS.Timeout | null = null

/**
 * Process a single outbox event
 */
async function processEvent(event: {
    id: bigint
    aggregateType: string
    aggregateId: string
    eventType: string
    payload: unknown
}): Promise<void> {
    const payload = event.payload as Record<string, unknown>

    switch (event.eventType) {
        case 'offer.created':
        case 'offer.updated':
            await handleOfferUpdate(event.aggregateId, payload)
            break

        case 'offer.deleted':
            await handleOfferDelete(event.aggregateId)
            break

        case 'service_aggregate.updated':
            // Service aggregates are updated in Postgres, 
            // optionally mirror to Meili service-aggregates index
            await handleServiceAggregateUpdate(payload)
            break

        case 'provider.synced':
            console.log(`[OUTBOX] Provider synced: ${event.aggregateId}`)
            break

        default:
            console.warn(`[OUTBOX] Unknown event type: ${event.eventType}`)
    }
}

/**
 * Handle offer create/update - sync to MeiliSearch
 */
async function handleOfferUpdate(pricingId: string, payload: Record<string, unknown>) {
    // Fetch fresh data from Postgres (source of truth)
    const pricing = await prisma.providerPricing.findUnique({
        where: { id: pricingId },
        include: {
            provider: true,
            service: true,
            country: true
        }
    })

    if (!pricing || pricing.deleted) {
        // If deleted or not found, remove from index
        await handleOfferDelete(pricingId)
        return
    }

    // Build MeiliSearch document
    const doc: OfferDocument = {
        id: `${pricing.provider.name}_${pricing.country.externalId}_${pricing.service.externalId}`.toLowerCase(),
        serviceSlug: pricing.service.code,
        serviceName: pricing.service.name,
        countryCode: pricing.country.externalId,
        countryName: pricing.country.name,
        flagUrl: pricing.country.flagUrl || '',
        provider: pricing.provider.name,
        displayName: pricing.provider.displayName,
        price: Number(pricing.sellPrice),
        stock: pricing.stock,
        lastSyncedAt: Date.now()
    }

    // Idempotent update to MeiliSearch
    const index = meili.index(INDEXES.OFFERS)
    await index.updateDocuments([doc], { primaryKey: 'id' })

    console.log(`[OUTBOX] Updated offer: ${doc.id} (stock: ${doc.stock})`)
}

/**
 * Handle offer deletion - remove from MeiliSearch
 */
async function handleOfferDelete(pricingId: string) {
    try {
        // We need the original document ID to delete
        // Fetch from Postgres even if soft-deleted
        const pricing = await prisma.providerPricing.findUnique({
            where: { id: pricingId },
            include: { provider: true, service: true, country: true }
        })

        if (pricing) {
            const docId = `${pricing.provider.name}_${pricing.country.externalId}_${pricing.service.externalId}`.toLowerCase()
            const index = meili.index(INDEXES.OFFERS)
            await index.deleteDocument(docId)
            console.log(`[OUTBOX] Deleted offer: ${docId}`)
        }
    } catch (e) {
        console.warn(`[OUTBOX] Failed to delete offer ${pricingId}:`, e)
    }
}

/**
 * Handle service aggregate updates (optional: mirror to Meili)
 */
async function handleServiceAggregateUpdate(payload: Record<string, unknown>) {
    // Service aggregates are primarily in Postgres
    // This is a hook for future Meili service-aggregates index if needed
    console.log(`[OUTBOX] Service aggregate updated:`, payload)
}

/**
 * Process a batch of outbox events
 */
async function processBatch(): Promise<number> {
    const events = await fetchPendingOutboxEvents(BATCH_SIZE)

    if (events.length === 0) {
        return 0
    }

    console.log(`[OUTBOX] Processing ${events.length} events...`)

    const successful: bigint[] = []

    for (const event of events) {
        try {
            await processEvent(event)
            successful.push(event.id)
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            console.error(`[OUTBOX] Event ${event.id} failed:`, errorMsg)

            // Mark as failed with retry increment
            await markEventFailed(event.id, errorMsg)

            // If max retries reached, it becomes DLQ
            if (event.retryCount >= MAX_RETRIES - 1) {
                console.error(`[OUTBOX] Event ${event.id} moved to DLQ after ${MAX_RETRIES} retries`)
            }
        }
    }

    // Mark successful events as processed
    if (successful.length > 0) {
        await markEventsProcessed(successful)
        outboxProcessedTotal.inc({ status: 'success' }, successful.length)
    }

    // Update metrics
    const stats = await getOutboxStats()
    outboxPendingCount.set(stats.pending)

    return events.length
}

/**
 * Single poll iteration
 */
async function poll(): Promise<void> {
    if (!isRunning) return

    try {
        const processed = await processBatch()

        // If we processed a full batch, immediately poll again
        if (processed >= BATCH_SIZE) {
            setImmediate(poll)
        }
    } catch (error) {
        console.error('[OUTBOX] Poll error:', error)
    }
}

/**
 * Start the outbox worker
 */
export function startOutboxWorker(): void {
    if (isRunning) {
        console.log('[OUTBOX] Worker already running')
        return
    }

    isRunning = true
    console.log(`[OUTBOX] Starting worker (poll every ${POLL_INTERVAL_MS}ms, batch ${BATCH_SIZE})`)

    // Initial poll
    poll()

    // Schedule recurring polls
    pollInterval = setInterval(poll, POLL_INTERVAL_MS)
}

/**
 * Stop the outbox worker
 */
export function stopOutboxWorker(): void {
    if (!isRunning) return

    isRunning = false
    if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
    }
    console.log('[OUTBOX] Worker stopped')
}

/**
 * Get worker status for monitoring
 */
export async function getOutboxWorkerStatus() {
    const stats = await getOutboxStats()
    return {
        running: isRunning,
        ...stats,
        config: {
            batchSize: BATCH_SIZE,
            pollIntervalMs: POLL_INTERVAL_MS,
            maxRetries: MAX_RETRIES
        }
    }
}

/**
 * Manual trigger for processing (useful for testing)
 */
export async function processOutboxNow(): Promise<number> {
    return processBatch()
}
