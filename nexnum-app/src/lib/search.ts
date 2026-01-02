import { MeiliSearch } from 'meilisearch'

// Meilisearch client
export const meili = new MeiliSearch({
    host: process.env.MEILISEARCH_HOST || 'http://localhost:7700',
    apiKey: process.env.MEILISEARCH_API_KEY || 'dev_master_key',
})

// Index names
export const INDEXES = {
    NUMBERS: 'numbers',
    OFFERS: 'offers',
}

// Initialize indexes (call once on app start)
export async function initSearchIndexes() {
    try {
        // 1. Numbers Index (User Inventory)
        const numbersIndex = meili.index(INDEXES.NUMBERS)
        await numbersIndex.updateSettings({
            searchableAttributes: ['phoneNumber', 'countryName', 'serviceName'],
            filterableAttributes: ['countryCode', 'serviceCode', 'status', 'ownerId'],
            sortableAttributes: ['price', 'createdAt'],
        })

        // 2. Offers Index (Global Price Catalog)
        const offersIndex = meili.index(INDEXES.OFFERS)
        await offersIndex.updateSettings({
            // Searchable: "WhatsApp", "USA", "Grizzly"
            searchableAttributes: ['serviceName', 'countryName', 'provider'],
            // Filterable for fast narrowing
            filterableAttributes: ['countryCode', 'serviceCode', 'provider', 'price', 'count'],
            // Sortable: "Cheapest First", "High Stock First"
            sortableAttributes: ['price', 'count', 'lastSyncedAt'],
            // Limit total max hits to avoid memory issues if index grows large
            pagination: { maxTotalHits: 2000 }
        })

        console.log('Search indexes initialized (Numbers + Offers)')
    } catch (error) {
        console.error('Failed to initialize search indexes:', error)
        // Don't crash the app if Meilisearch is not available
    }
}

// Index a number for search
export async function indexNumber(number: {
    id: string
    phoneNumber: string
    countryCode: string
    countryName?: string
    serviceName?: string
    serviceCode?: string
    price: number
    status: string
    ownerId?: string
    createdAt: Date
}) {
    try {
        const index = meili.index(INDEXES.NUMBERS)
        await index.updateDocuments([number], { primaryKey: 'id' })
    } catch (error) {
        console.error('Failed to index number:', error)
    }
}

// Index offers buffer (Batch)
export interface OfferDocument {
    id: string
    provider: string
    countryCode: string
    countryName: string
    serviceCode: string
    serviceName: string
    price: number
    count: number
    lastSyncedAt: number
}

export async function indexOffers(offers: OfferDocument[]) {
    if (offers.length === 0) return
    try {
        const index = meili.index(INDEXES.OFFERS)
        // Use updateDocuments to upsert (replace if ID exists)
        await index.updateDocuments(offers, { primaryKey: 'id' })
    } catch (error) {
        console.error(`Failed to index ${offers.length} offers:`, error)
    }
}

// Search numbers
export async function searchNumbers(
    query: string,
    filters?: {
        countryCode?: string
        serviceCode?: string
        status?: string
        ownerId?: string
    },
    options?: {
        page?: number
        limit?: number
        sort?: string[]
    }
) {
    try {
        const index = meili.index(INDEXES.NUMBERS)

        const filterParts: string[] = []
        if (filters?.countryCode) filterParts.push(`countryCode = "${filters.countryCode}"`)
        if (filters?.serviceCode) filterParts.push(`serviceCode = "${filters.serviceCode}"`)
        if (filters?.status) filterParts.push(`status = "${filters.status}"`)
        if (filters?.ownerId) filterParts.push(`ownerId = "${filters.ownerId}"`)

        const result = await index.search(query, {
            filter: filterParts.length > 0 ? filterParts.join(' AND ') : undefined,
            offset: ((options?.page || 1) - 1) * (options?.limit || 20),
            limit: options?.limit || 20,
            sort: options?.sort,
        })

        return {
            hits: result.hits,
            total: result.estimatedTotalHits,
        }
    } catch (error) {
        console.error('Search failed:', error)
        return { hits: [], total: 0 }
    }
}

// Search Offers (Global Catalog)
export async function searchOffers(
    query: string,
    filters?: {
        countryCode?: string
        serviceCode?: string
        provider?: string
        maxPrice?: number
        minCount?: number
    },
    options?: {
        page?: number
        limit?: number
        sort?: string[] // e.g. ['price:asc']
    }
) {
    try {
        const index = meili.index(INDEXES.OFFERS)

        const filterParts: string[] = []
        if (filters?.countryCode) filterParts.push(`countryCode = "${filters.countryCode}"`)
        if (filters?.serviceCode) filterParts.push(`serviceCode = "${filters.serviceCode}"`)
        if (filters?.provider) filterParts.push(`provider = "${filters.provider}"`)
        if (filters?.maxPrice) filterParts.push(`price <= ${filters.maxPrice}`)
        if (filters?.minCount) filterParts.push(`count >= ${filters.minCount}`)

        const result = await index.search(query, {
            filter: filterParts.length > 0 ? filterParts.join(' AND ') : undefined,
            offset: ((options?.page || 1) - 1) * (options?.limit || 20),
            limit: options?.limit || 20,
            sort: options?.sort || ['price:asc'], // Default to cheapest first
        })

        return {
            hits: result.hits as OfferDocument[],
            total: result.estimatedTotalHits,
        }
    } catch (error) {
        console.error('Offer Search failed:', error)
        return { hits: [], total: 0 }
    }
}
