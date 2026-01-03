/**
 * MeiliSearch-First Search System
 * 
 * Single `offers` index is the source of truth for all Buy flow data.
 * Uses faceted search for aggregations (services, countries).
 * No PostgreSQL dependency for searches.
 */

import { MeiliSearch } from 'meilisearch'

// Meilisearch client
export const meili = new MeiliSearch({
    host: process.env.MEILISEARCH_HOST || 'http://localhost:7700',
    apiKey: process.env.MEILISEARCH_API_KEY || 'dev_master_key',
})

// Single index for all pricing data
export const INDEXES = {
    OFFERS: 'offers',   // Main index - all pricing data
}

// Admin API View Modes
export type InventoryViewMode = 'aggregated' | 'raw';

// ============================================
// DOCUMENT INTERFACES
// ============================================

/**
 * Core offer document - represents a single pricing entry
 * (provider + country + service combination)
 */
// ... (imports)

// ...

export interface OfferDocument {
    id: string;           // Composite: provider_country_service

    // Service Info
    serviceSlug: string;
    serviceName: string;

    // Country Info
    countryCode: string;
    countryName: string;
    // phoneCode removed
    flagUrl: string;

    // Provider Info
    provider: string;
    displayName: string;
    logoUrl?: string;

    // Pricing
    price: number;
    stock: number;
    successRate?: number;

    // Metadata
    lastSyncedAt: number;
}


// ...

export interface CountryStats {
    code: string;
    name: string;
    // phoneCode removed
    flagUrl: string;
    lowestPrice: number;
    totalStock: number;
    serverCount: number;
}

export interface ServiceStats {
    slug: string;
    name: string;
    lowestPrice: number;
    totalStock: number;
    serverCount: number;
    countryCount: number;
}

// ...

// In searchCountries
export async function searchCountries(
    serviceSlug: string,
    query: string = '',
    options?: { page?: number; limit?: number; sort?: 'name' | 'price' | 'stock' }
): Promise<{ countries: CountryStats[]; total: number }> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        const limit = options?.limit || 50
        const page = options?.page || 1
        const sort = options?.sort || 'name'

        // Filter by service and get all offers
        const result = await index.search('', {
            filter: `serviceSlug = "${serviceSlug}"`,
            limit: 5000,
            attributesToRetrieve: ['countryCode', 'countryName', 'flagUrl', 'provider', 'price', 'stock'],
        })

        // Aggregate by country
        const countryMap = new Map<string, {
            name: string;
            // phoneCode removed
            flagUrl: string;
            minPrice: number;
            totalStock: number;
            providers: Set<string>;
        }>()

        for (const hit of result.hits as OfferDocument[]) {
            const code = hit.countryCode
            if (!countryMap.has(code)) {
                countryMap.set(code, {
                    name: hit.countryName,
                    flagUrl: hit.flagUrl,
                    minPrice: hit.price,
                    totalStock: 0,
                    providers: new Set(),
                })
            }
            const stats = countryMap.get(code)!
            stats.minPrice = Math.min(stats.minPrice, hit.price)
            stats.totalStock += hit.stock || 0
            stats.providers.add(hit.provider)
        }

        // Convert to array
        let countries: CountryStats[] = Array.from(countryMap.entries()).map(([code, stats]) => ({
            code,
            name: stats.name,
            flagUrl: stats.flagUrl,
            lowestPrice: stats.minPrice,
            totalStock: stats.totalStock,
            serverCount: stats.providers.size,
        }))

        // Filter by query
        if (query) {
            const q = query.toLowerCase()
            countries = countries.filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.code.toLowerCase().includes(q)
            )
        }

        // ... (sorting/pagination) ...
        switch (sort) {
            case 'price':
                countries.sort((a, b) => a.lowestPrice - b.lowestPrice)
                break
            case 'stock':
                countries.sort((a, b) => b.totalStock - a.totalStock)
                break
            default:
                countries.sort((a, b) => a.name.localeCompare(b.name))
        }

        // ...

        const start = (page - 1) * limit
        const paginatedCountries = countries.slice(start, start + limit)

        return {
            countries: paginatedCountries,
            total: countries.length,
        }
    } catch (error) {
        console.error('searchCountries failed:', error)
        return { countries: [], total: 0 }
    }
}

// ... 

// In searchAdminCountries
export async function searchAdminCountries(
    query: string = '',
    options?: { page?: number; limit?: number; provider?: string }
): Promise<{ items: any[]; total: number }> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        const limit = options?.limit || 50
        const page = options?.page || 1
        const providerFilter = options?.provider ? `provider = "${options.provider}"` : undefined

        const result = await index.search(query, {
            filter: providerFilter,
            limit: 10000,
            attributesToRetrieve: ['countryCode', 'countryName', 'flagUrl', 'provider', 'serviceSlug', 'price', 'stock', 'lastSyncedAt', 'id'],
        })

        const groups = new Map<string, {
            countryCode: string
            canonicalName: string
            displayName: string
            // phoneCode removed
            flagUrl: string
            providers: Map<string, { provider: string; externalId: string; stock: number; minPrice: number; maxPrice: number }>
            services: Set<string>
            totalStock: number
            priceRange: { min: number; max: number }
            lastSyncedAt: number
        }>()

        for (const hit of result.hits as OfferDocument[]) {
            const code = (hit.countryCode || 'unknown').toLowerCase()
            if (!groups.has(code)) {
                groups.set(code, {
                    countryCode: code,
                    canonicalName: hit.countryName,
                    displayName: hit.countryName,
                    // phoneCode removed
                    flagUrl: hit.flagUrl || '',
                    providers: new Map(),
                    services: new Set(),
                    totalStock: 0,
                    priceRange: { min: Infinity, max: 0 },
                    lastSyncedAt: hit.lastSyncedAt
                })
            }
            // ...
            const group = groups.get(code)!
            group.services.add(hit.serviceSlug)

            group.totalStock += hit.stock || 0
            if (hit.price < group.priceRange.min) group.priceRange.min = hit.price
            if (hit.price > group.priceRange.max) group.priceRange.max = hit.price

            if (!group.providers.has(hit.provider)) {
                const externalId = (hit.id && typeof hit.id === 'string') ? hit.id.split('_').pop() || '' : code
                group.providers.set(hit.provider, {
                    provider: hit.provider,
                    externalId: externalId,
                    stock: hit.stock || 0,
                    minPrice: hit.price,
                    maxPrice: hit.price
                })
            } else {
                const p = group.providers.get(hit.provider)!
                p.stock += hit.stock || 0
                if (hit.price < p.minPrice) p.minPrice = hit.price
                if (hit.price > p.maxPrice) p.maxPrice = hit.price
            }
            if (hit.lastSyncedAt > group.lastSyncedAt) {
                group.lastSyncedAt = hit.lastSyncedAt
            }
        }

        const items = Array.from(groups.values()).map(g => ({
            countryCode: g.countryCode,
            canonicalName: g.canonicalName,
            displayName: g.displayName,
            // phoneCode removed
            flagUrl: g.flagUrl,
            providers: Array.from(g.providers.values()),
            totalProviders: g.providers.size,
            serviceCount: g.services.size,
            totalStock: g.totalStock,
            priceRange: g.priceRange.min === Infinity ? { min: 0, max: 0 } : g.priceRange,
            lastSyncedAt: g.lastSyncedAt
        }))
        // ...

        items.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)) // Sort

        const start = (page - 1) * limit
        return {
            items: items.slice(start, start + limit),
            total: items.length
        }
    } catch (e) {
        // ...
        return { items: [], total: 0 }
    }
}

// In searchRawInventory
export async function searchRawInventory(
    type: 'countries' | 'services',
    query: string = '',
    options?: { provider?: string; page?: number; limit?: number }
): Promise<{ items: any[]; total: number }> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        const limit = options?.limit || 50
        const page = options?.page || 1
        const providerFilter = options?.provider ? `provider = "${options.provider}"` : undefined

        const result = await index.search(query, {
            filter: providerFilter,
            limit: 10000,
            attributesToRetrieve: ['countryCode', 'countryName', 'flagUrl', 'provider', 'serviceSlug', 'serviceName', 'price', 'stock', 'lastSyncedAt', 'id'],
        })

        // Deduplicate by key (country or service)
        const seen = new Map<string, any>()

        for (const hit of result.hits as any[]) {
            const key = type === 'countries'
                ? `${hit.provider}_${hit.countryCode}`
                : `${hit.provider}_${hit.serviceSlug}`

            if (!seen.has(key)) {
                const safeId = (hit.id && typeof hit.id === 'string') ? hit.id : key
                const externalId = safeId.includes('_') ? safeId.split('_').pop() : safeId

                if (type === 'countries') {
                    seen.set(key, {
                        id: safeId,
                        externalId: externalId,
                        name: hit.countryName,
                        // phoneCode removed
                        iconUrl: hit.flagUrl,
                        provider: hit.provider,
                        lastSyncedAt: new Date(hit.lastSyncedAt)
                    })
                } else {
                    // ... (service logic same)
                    seen.set(key, {
                        id: safeId,
                        externalId: externalId,
                        name: hit.serviceName,
                        shortName: hit.serviceSlug,
                        slug: hit.serviceSlug,
                        provider: hit.provider,
                        lastSyncedAt: new Date(hit.lastSyncedAt),
                        _count: { pricing: hit.stock ? 1 : 0 }
                    })
                }
            }
        }
        // ...
        const allItems = Array.from(seen.values())
        const start = (page - 1) * limit
        const paginatedItems = allItems.slice(start, start + limit)

        return {
            items: paginatedItems,
            total: allItems.length
        }

    } catch (e) { /* ... */ return { items: [], total: 0 } }
}

/**
 * Aggregated service stats (computed from facets)
 */


// ============================================
// INDEX INITIALIZATION
// ============================================

import { SEARCH_SYNONYMS, SEARCH_STOP_WORDS, RANKING_RULES, SEARCHABLE_ATTRIBUTES, FILTERABLE_ATTRIBUTES } from './search-config'

// ============================================
// INDEX INITIALIZATION
// ============================================

export async function initSearchIndexes() {
    try {
        // Main Offers Index - optimized for faceted search
        const offersIndex = meili.index(INDEXES.OFFERS)

        // Deep Search Configuration
        await offersIndex.updateSettings({
            searchableAttributes: SEARCHABLE_ATTRIBUTES,
            filterableAttributes: FILTERABLE_ATTRIBUTES,
            sortableAttributes: ['price', 'stock', 'lastSyncedAt'],
            rankingRules: RANKING_RULES,
            synonyms: SEARCH_SYNONYMS,
            stopWords: SEARCH_STOP_WORDS,
            distinctAttribute: null,

            // Typo Tolerance: Professional setup
            typoTolerance: {
                enabled: true,
                minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
                disableOnWords: [],
                disableOnAttributes: []
            },

            pagination: { maxTotalHits: 10000 }
        })

        console.log('✅ MeiliSearch "Deep Search" indexes initialized')
    } catch (error) {
        console.error('Failed to initialize search indexes:', error)
    }
}

/**
 * Force re-application of search settings (e.g. after config change)
 */
export async function reconfigureIndexes() {
    console.log('🔄 Reconfiguring search indexes with Deep Search settings...')
    await initSearchIndexes()
    console.log('✨ Deep Search upgrade complete.')
}

// ============================================
// SEARCH FUNCTIONS
// ============================================

/**
 * Step 1: Search Services
 * Returns aggregated service stats from offers index
 */
export async function searchServices(
    query: string = '',
    options?: { page?: number; limit?: number }
): Promise<{ services: ServiceStats[]; total: number }> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        const limit = options?.limit || 50
        const page = options?.page || 1

        // Get all matching offers to aggregate
        const result = await index.search(query, {
            limit: 5000, // Get enough for aggregation
            attributesToRetrieve: ['serviceSlug', 'serviceName', 'countryCode', 'provider', 'price', 'stock'],
        })

        // Aggregate by service
        const serviceMap = new Map<string, {
            name: string;
            minPrice: number;
            totalStock: number;
            providers: Set<string>;
            countries: Set<string>;
        }>()

        for (const hit of result.hits as OfferDocument[]) {
            const slug = hit.serviceSlug
            if (!serviceMap.has(slug)) {
                serviceMap.set(slug, {
                    name: hit.serviceName,
                    minPrice: hit.price,
                    totalStock: 0,
                    providers: new Set(),
                    countries: new Set(),
                })
            }
            const stats = serviceMap.get(slug)!
            stats.minPrice = Math.min(stats.minPrice, hit.price)
            stats.totalStock += hit.stock || 0
            stats.providers.add(hit.provider)
            stats.countries.add(hit.countryCode)
        }

        // Convert to array and sort by name
        let services: ServiceStats[] = Array.from(serviceMap.entries()).map(([slug, stats]) => ({
            slug,
            name: stats.name,
            lowestPrice: stats.minPrice,
            totalStock: stats.totalStock,
            serverCount: stats.providers.size,
            countryCount: stats.countries.size,
        }))

        // Filter by query if specified
        if (query) {
            const q = query.toLowerCase()
            services = services.filter(s =>
                s.name.toLowerCase().includes(q) || s.slug.includes(q)
            )
        }

        // Sort by name
        services.sort((a, b) => a.name.localeCompare(b.name))

        // Paginate
        const start = (page - 1) * limit
        const paginatedServices = services.slice(start, start + limit)

        return {
            services: paginatedServices,
            total: services.length,
        }
    } catch (error) {
        console.error('searchServices failed:', error)
        return { services: [], total: 0 }
    }
}





/**
 * Admin: Search Aggregated Services (Smart View)
 * Grouped by canonical service slug with full statistics
 */
export async function searchAdminServices(
    query: string = '',
    options?: { page?: number; limit?: number; provider?: string }
): Promise<{ items: any[]; total: number }> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        const limit = options?.limit || 50
        const page = options?.page || 1
        const providerFilter = options?.provider ? `provider = "${options.provider}"` : undefined

        const result = await index.search(query, {
            filter: providerFilter,
            limit: 10000,
            attributesToRetrieve: ['serviceSlug', 'serviceName', 'provider', 'countryCode', 'price', 'stock', 'lastSyncedAt', 'id'],
        })

        const groups = new Map<string, {
            canonicalName: string
            canonicalSlug: string
            providers: Map<string, { provider: string; externalId: string; stock: number; minPrice: number; maxPrice: number }>
            countries: Set<string>
            totalStock: number
            priceRange: { min: number; max: number }
            lastSyncedAt: number
        }>()

        for (const hit of result.hits as OfferDocument[]) {
            const slug = hit.serviceSlug
            if (!groups.has(slug)) {
                groups.set(slug, {
                    canonicalName: hit.serviceName,
                    canonicalSlug: hit.serviceSlug,
                    providers: new Map(),
                    countries: new Set(),
                    totalStock: 0,
                    priceRange: { min: Infinity, max: 0 },
                    lastSyncedAt: hit.lastSyncedAt
                })
            }
            const group = groups.get(slug)!

            // Track unique countries
            group.countries.add(hit.countryCode)

            // Track stock and pricing
            group.totalStock += hit.stock || 0
            if (hit.price < group.priceRange.min) group.priceRange.min = hit.price
            if (hit.price > group.priceRange.max) group.priceRange.max = hit.price

            // Track provider stats
            if (!group.providers.has(hit.provider)) {
                const externalId = (hit.id && typeof hit.id === 'string') ? hit.id.split('_').pop() || '' : slug
                group.providers.set(hit.provider, {
                    provider: hit.provider,
                    externalId: externalId,
                    stock: hit.stock || 0,
                    minPrice: hit.price,
                    maxPrice: hit.price
                })
            } else {
                const p = group.providers.get(hit.provider)!
                p.stock += hit.stock || 0
                if (hit.price < p.minPrice) p.minPrice = hit.price
                if (hit.price > p.maxPrice) p.maxPrice = hit.price
            }

            // Update last sync
            if (hit.lastSyncedAt > group.lastSyncedAt) {
                group.lastSyncedAt = hit.lastSyncedAt
            }
        }

        const items = Array.from(groups.values()).map(g => ({
            canonicalName: g.canonicalName,
            canonicalSlug: g.canonicalSlug,
            providers: Array.from(g.providers.values()),
            totalProviders: g.providers.size,
            countryCount: g.countries.size,
            totalStock: g.totalStock,
            bestPrice: g.priceRange.min === Infinity ? 0 : g.priceRange.min,
            priceRange: g.priceRange.min === Infinity ? { min: 0, max: 0 } : g.priceRange,
            lastSyncedAt: g.lastSyncedAt
        }))

        // Sort by total providers descending, then by name
        items.sort((a, b) => b.totalProviders - a.totalProviders || a.canonicalName.localeCompare(b.canonicalName))

        const start = (page - 1) * limit
        return {
            items: items.slice(start, start + limit),
            total: items.length
        }
    } catch (error) {
        console.error('searchAdminServices failed:', error)
        return { items: [], total: 0 }
    }
}



/**
 * Step 3: Get Providers for Service + Country
 * Returns individual offer entries
 */
export async function searchProviders(
    serviceSlug: string,
    countryCode: string,
    options?: { page?: number; limit?: number; sort?: 'price' | 'stock' }
): Promise<{ providers: OfferDocument[]; total: number }> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        const limit = options?.limit || 20
        const page = options?.page || 1
        const sort = options?.sort || 'price'

        // Build sort array
        const sortArr = sort === 'stock' ? ['stock:desc', 'price:asc'] : ['price:asc', 'stock:desc']

        const result = await index.search('', {
            filter: `serviceSlug = "${serviceSlug}" AND countryCode = "${countryCode}"`,
            sort: sortArr,
            offset: (page - 1) * limit,
            limit: limit,
        })

        return {
            providers: result.hits as OfferDocument[],
            total: result.estimatedTotalHits || 0,
        }
    } catch (error) {
        console.error('searchProviders failed:', error)
        return { providers: [], total: 0 }
    }
}

/**
 * General search across all offers with optional filters
 * Used by the public-facing offers API
 */
export async function searchOffers(
    query: string = '',
    filters?: { countryCode?: string; serviceCode?: string; maxPrice?: number; minCount?: number },
    options?: { page?: number; limit?: number; sort?: string[] }
): Promise<{ hits: OfferDocument[]; total: number }> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        const limit = options?.limit || 20
        const page = options?.page || 1

        // Build filter array
        const filterParts: string[] = []
        if (filters?.countryCode) filterParts.push(`countryCode = "${filters.countryCode}"`)
        if (filters?.serviceCode) filterParts.push(`serviceSlug = "${filters.serviceCode}"`)
        if (filters?.maxPrice) filterParts.push(`price <= ${filters.maxPrice}`)
        if (filters?.minCount) filterParts.push(`stock >= ${filters.minCount}`)

        const result = await index.search(query, {
            limit,
            offset: (page - 1) * limit,
            filter: filterParts.length > 0 ? filterParts.join(' AND ') : undefined,
            sort: options?.sort || ['price:asc']
        })

        return {
            hits: result.hits as OfferDocument[],
            total: result.estimatedTotalHits || 0
        }
    } catch (error) {
        console.error('searchOffers failed:', error)
        return { hits: [], total: 0 }
    }
}

// ============================================
// INDEX MANAGEMENT
// ============================================

/**
 * Add or update offers in the index
 */
export async function indexOffers(offers: OfferDocument[]): Promise<number | undefined> {
    if (offers.length === 0) return undefined
    try {
        const index = meili.index(INDEXES.OFFERS)
        const task = await index.addDocuments(offers, { primaryKey: 'id' })
        console.log(`📦 Queued ${offers.length} offers (task ${task.taskUid})`)
        return task.taskUid
    } catch (error) {
        console.error('Failed to index offers:', error)
        return undefined
    }
}

/**
 * Delete offers by provider (for re-sync)
 */
export async function deleteOffersByProvider(provider: string): Promise<void> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        await index.deleteDocuments({ filter: `provider = "${provider}"` })
        console.log(`🗑️ Deleted offers for provider: ${provider}`)
    } catch (error) {
        console.error('Failed to delete offers:', error)
    }
}

/**
 * Get index stats
 */
export async function getIndexStats(): Promise<{ offers: number; lastSync?: number }> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        const stats = await index.getStats()
        return { offers: stats.numberOfDocuments }
    } catch (error) {
        console.error('Failed to get index stats:', error)
        return { offers: 0 }
    }
}

/**
 * Wait for a task to complete
 */
export async function waitForTask(taskUid: number, timeoutMs = 60000): Promise<boolean> {
    const startTime = Date.now()
    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(`${process.env.MEILISEARCH_HOST || 'http://localhost:7700'}/tasks/${taskUid}`, {
                headers: {
                    'Authorization': `Bearer ${process.env.MEILISEARCH_API_KEY || 'dev_master_key'}`
                }
            })
            const task = await response.json()

            if (task.status === 'succeeded') return true
            if (task.status === 'failed') {
                console.error(`Task ${taskUid} failed:`, task.error)
                return false
            }
            await new Promise(r => setTimeout(r, 1000))
        } catch (error) {
            console.error(`Error checking task ${taskUid}:`, error)
            return false
        }
    }
    console.error(`Task ${taskUid} timed out`)
    return false
}
