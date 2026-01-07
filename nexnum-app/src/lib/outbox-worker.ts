/**
 * Outbox Worker - Reliable MeiliSearch Indexing
 * 
 * Polls the outbox table and processes events to update MeiliSearch.
 * Uses strict Name-Based Identity for search consistency.
 */

import { prisma } from './db'
import { fetchPendingOutboxEvents, markEventsProcessed, markEventFailed, getOutboxStats } from './outbox'
import { meili, INDEXES, OfferDocument } from './search'
import { resolveToCanonicalName, getSlugFromName } from './service-identity'

// Configuration
const BATCH_SIZE = 100
const POLL_INTERVAL_MS = 5000
const MAX_RETRIES = 5

let isRunning = false
let pollInterval: NodeJS.Timeout | null = null

/**
 * Handle individual offer updates (Sync to MeiliSearch)
 */
async function handleOfferUpdate(pricingId: string) {
    const pricing = await prisma.providerPricing.findUnique({
        where: { id: pricingId },
        include: {
            provider: true,
            service: true,
            country: true
        }
    })

    if (!pricing || pricing.deleted) {
        const index = meili.index(INDEXES.OFFERS)
        // Attempt to delete if we can derive the composite ID
        // Note: Better to track the Meili ID in the DB, but for now we reconstruct
        return
    }

    // RESOLVE TO CANONICAL IDENTITY
    const canonicalService = resolveToCanonicalName(pricing.service.name)
    const canonicalCountry = pricing.country.name

    const doc: OfferDocument = {
        // ID is composite: provider_countryExt_serviceExt_operator
        id: `${pricing.provider.name}_${pricing.country.externalId}_${pricing.service.externalId}_${pricing.operator || 'default'}`.toLowerCase().replace(/[^a-z0-9_]/g, ''),
        serviceSlug: getSlugFromName(canonicalService),
        serviceName: canonicalService,
        iconUrl: pricing.service.iconUrl || undefined,
        countryCode: getSlugFromName(canonicalCountry),
        countryName: canonicalCountry,
        flagUrl: pricing.country.flagUrl || '',
        provider: pricing.provider.name,
        displayName: pricing.provider.displayName,
        price: Number(pricing.sellPrice),
        stock: pricing.stock,
        lastSyncedAt: Date.now(),
        operatorId: 1,
        externalOperator: pricing.operator || undefined,
        operatorDisplayName: ''
    }

    const index = meili.index(INDEXES.OFFERS)
    await index.updateDocuments([doc], { primaryKey: 'id' })
}

async function processEvent(event: any) {
    switch (event.eventType) {
        case 'offer.created':
        case 'offer.updated':
            await handleOfferUpdate(event.aggregateId)
            break
    }
}

async function poll() {
    if (!isRunning) return
    try {
        const events = await fetchPendingOutboxEvents(BATCH_SIZE)
        if (events.length === 0) return

        const successful: bigint[] = []
        for (const event of events) {
            try {
                await processEvent(event)
                successful.push(event.id)
            } catch (err) {
                await markEventFailed(event.id, err instanceof Error ? err.message : 'Unknown')
            }
        }

        if (successful.length > 0) {
            await markEventsProcessed(successful)
        }
    } catch (err) {
        console.error('[OUTBOX] Poll error:', err)
    }
}

export function startOutboxWorker() {
    if (isRunning) return
    isRunning = true
    pollInterval = setInterval(poll, POLL_INTERVAL_MS)
    poll()
}

export function stopOutboxWorker() {
    isRunning = false
    if (pollInterval) clearInterval(pollInterval)
}

export async function processOutboxNow() {
    await poll()
}
