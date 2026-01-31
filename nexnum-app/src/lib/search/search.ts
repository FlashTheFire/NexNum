/**
 * MeiliSearch-First Search System
 * 
 * Single `offers` index is the source of truth for all Buy flow data.
 * Uses faceted search for aggregations (services, countries).
 * No PostgreSQL dependency for searches.
 */

import { MeiliSearch } from 'meilisearch'
import fs from 'fs'
import path from 'path'
import { getCountryFlagUrlSync } from '@/lib/normalizers/country-flags'
import {
    normalizeServiceName,
    getCanonicalName,
    normalizeCountryName,
    generateCanonicalCode,
    SERVICE_OVERRIDES,
    POPULAR_SERVICES,
    CANONICAL_SERVICE_NAME_MAP,
    CANONICAL_SERVICE_NAMES,
    CANONICAL_DISPLAY_NAMES,
    CANONICAL_SERVICE_ICONS
} from '@/lib/normalizers/service-identity'
import { isValidImageUrl } from '@/lib/utils/utils'
import { cacheGet, CACHE_KEYS, CACHE_TTL } from '@/lib/core/redis'
import crypto from 'crypto'
import { search_latency, search_empty_results } from '@/lib/metrics'
import { logger } from '@/lib/core/logger'

// Meilisearch client
export const meili = new MeiliSearch({
    host: process.env.MEILISEARCH_HOST || 'http://localhost:7700',
    apiKey: process.env.MEILISEARCH_API_KEY || 'dev_master_key',
})

// Single index for all pricing data
export const INDEXES = {
    OFFERS: 'offers',   // Main index - all pricing data
}

/**
 * Enterprise Shadow Index Prefixes
 * Used for Blue-Green atomic swaps during long-running syncs.
 */

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
    id: string;           // Composite: provider_country_service_operator
    provider: string;     // Provider slug (e.g. "provider-a", "provider-b")

    // === SQL Registry IDs (For linking back) ===
    serviceId?: number;    // FK to ServiceLookup.serviceId
    countryId?: number;    // FK to CountryLookup.countryId

    // === Display Names (Mirrored for fast search) ===
    serviceName: string;   // Canonical Name (e.g. "WhatsApp")
    countryName: string;   // Canonical Name (e.g. "India")

    // === RAW PROVIDER CODES (For Purchase API) ===
    providerServiceCode: string;  // e.g. "wa", "tg" - VERBATIM from provider API
    providerCountryCode: string;  // e.g. "91", "india" - VERBATIM from provider API

    // === Pricing ===
    price: number;         // Sell price in COINS (System Currency)
    rawPrice: number;      // Provider's raw cost (Their Currency unit)

    // === Inventory ===
    stock: number;
    operator?: string;     // Operator/server identifier

    // === Metadata ===
    serviceIcon?: string;  // Icon URL
    countryIcon?: string;  // Flag URL
    isActive: boolean;
    lastSyncedAt: number;
}


// ...

export interface CountryStats {
    code: string;       // Route slug (e.g. "united-states")
    name: string;       // Display name
    identifier?: string; // Best Provider ID/ISO for flag lookup (e.g. "10" or "us")
    flagUrl: string;    // Fallback URL
    lowestPrice: number;
    totalStock: number;
    serverCount: number;
}

export interface ServiceStats {
    slug: string;
    name: string;
    iconUrl?: string;
    lowestPrice: number;
    totalStock: number;
    serverCount: number;
    countryCount: number;
    topCountries: { code: string; name: string; flagUrl?: string }[];
    popular?: boolean;
}

// ============================================
// SHARED COUNTRY AGGREGATION HELPERS
// ============================================

/**
 * Country aggregate data structure used during aggregation
 */
export interface CountryAggregate {
    name: string;           // Display name
    flagUrl: string;        // Computed flag URL
    minPrice: number;       // Lowest price
    totalStock: number;     // Total stock
    providers: Set<string>; // Unique providers
    bestCode?: string;      // Valid provider ID/Code for flag lookup
}

/**
 * Aggregate a single hit into country map
 * Used by both searchServices (Step 1) and searchCountries (Step 2)
 */
export function aggregateCountryFromHit(
    countryMap: Map<string, CountryAggregate>,
    hit: { countryCode?: string; countryName: string; countryIcon?: string; price: number; stock?: number; provider: string }
): void {
    const key = normalizeCountryName(hit.countryName)

    if (!countryMap.has(key)) {
        countryMap.set(key, {
            name: hit.countryName,
            flagUrl: '', // Will be computed
            minPrice: hit.price,
            totalStock: hit.stock || 0,
            providers: new Set([hit.provider]),
            bestCode: hit.countryCode
        })
    } else {
        const stats = countryMap.get(key)!
        if (!stats.bestCode && hit.countryCode) stats.bestCode = hit.countryCode
        stats.minPrice = Math.min(stats.minPrice, hit.price)
        stats.totalStock += hit.stock || 0
        stats.providers.add(hit.provider)

        // Prefer longer/better display name
        if (hit.countryName && hit.countryName.length > stats.name.length) {
            stats.name = hit.countryName
        }

        if (hit.countryName && hit.countryName.length > stats.name.length) {
            stats.name = hit.countryName
        }
        // Flag URL is computed dynamicall via bestCode
    }
}

/**
 * Get top N countries sorted by relevance (cheapest first) with circle-flags URLs
 * Used by searchServices for service card flags
 */
export async function getTopCountriesWithFlags(
    countryMap: Map<string, CountryAggregate>,
    limit: number = 3
): Promise<{ code: string; name: string; flagUrl?: string }[]> {
    // Sort by lowest price (relevance)
    const sorted = Array.from(countryMap.entries())
        .sort((a, b) => a[1].minPrice - b[1].minPrice)
        .slice(0, limit)

    // Generate local flag URLs with fallback
    return Promise.all(
        sorted.map(async ([code, c]) => {
            // UNIVERSAL: Use country NAME for flag lookup (provider IDs vary, names don't)
            let flagUrl = getCountryFlagUrlSync(c.name);

            return {
                code,
                name: c.name,
                flagUrl: flagUrl || undefined
            }
        })
    )
}

// ...

/**
 * Search Countries for a Service
 */
export async function searchCountries(
    serviceCode: string,
    query: string = '',
    options?: { page?: number; limit?: number; sort?: string }
): Promise<{ countries: CountryStats[]; total: number }> {
    const startTime = Date.now()
    try {
        const index = meili.index(INDEXES.OFFERS)
        const limit = options?.limit || 50
        const page = options?.page || 1

        const serviceNameToFilter = getCanonicalName(serviceCode) || serviceCode

        const result = await index.search(query, {
            filter: `serviceName = "${serviceNameToFilter}" AND isActive = true`,
            limit: 2000,
            attributesToRetrieve: ['providerCountryCode', 'countryName', 'provider', 'price', 'stock'],
        })

        // Metrics
        search_latency.observe({ type: 'countries' }, (Date.now() - startTime) / 1000)

        const countryMap = new Map<string, {
            displayName: string;
            minPrice: number;
            totalStock: number;
            providers: Set<string>;
            bestCode?: string;
        }>()

        for (const hit of result.hits as OfferDocument[]) {
            const normalizedName = normalizeCountryName(hit.countryName)
            if (!normalizedName) continue

            let stats = countryMap.get(normalizedName)
            if (!stats) {
                stats = {
                    displayName: hit.countryName,
                    minPrice: hit.price,
                    totalStock: 0,
                    providers: new Set(),
                    bestCode: hit.providerCountryCode
                }
                countryMap.set(normalizedName, stats)
            }

            stats.minPrice = Math.min(stats.minPrice, hit.price)
            stats.totalStock += hit.stock || 0
            stats.providers.add(hit.provider)
            if (!stats.bestCode && hit.providerCountryCode) stats.bestCode = hit.providerCountryCode
        }

        let countries: CountryStats[] = Array.from(countryMap.values()).map(g => ({
            code: generateCanonicalCode(g.displayName),
            name: g.displayName,
            identifier: g.bestCode,
            flagUrl: getCountryFlagUrlSync(g.displayName) || '',
            lowestPrice: g.minPrice,
            totalStock: g.totalStock,
            serverCount: g.providers.size,
        }))

        // Multi-level sort
        countries.sort((a, b) => {
            if (options?.sort === 'price_asc') return a.lowestPrice - b.lowestPrice
            if (options?.sort === 'stock_desc') return b.totalStock - a.totalStock
            return a.name.localeCompare(b.name)
        })

        const start = (page - 1) * limit
        return {
            countries: countries.slice(start, start + limit),
            total: countries.length,
        }
    } catch (error: any) {
        logger.error('searchCountries failed:', { error })
        return { countries: [], total: 0 }
    }
}

// ...

/**
 * Admin: Search Aggregated Countries
 */
export async function searchAdminCountries(
    query: string = '',
    options?: { page?: number; limit?: number; provider?: string; includeHidden?: boolean }
): Promise<{ items: any[]; total: number }> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        const limit = options?.limit || 50
        const page = options?.page || 1

        const filters: string[] = []
        if (options?.provider) filters.push(`provider = "${options.provider}"`)
        if (!options?.includeHidden) filters.push('isActive = true')

        const result = await index.search(query, {
            filter: filters.length > 0 ? filters.join(' AND ') : undefined,
            limit: 5000,
            attributesToRetrieve: ['providerCountryCode', 'countryName', 'provider', 'price', 'stock', 'lastSyncedAt', 'isActive'],
        })

        const groups = new Map<string, any>()

        for (const hit of result.hits as OfferDocument[]) {
            const key = normalizeCountryName(hit.countryName)
            let group = groups.get(key)

            if (!group) {
                group = {
                    countryCode: hit.providerCountryCode,
                    canonicalName: hit.countryName,
                    displayName: hit.countryName,
                    flagUrl: getCountryFlagUrlSync(hit.countryName) || '',
                    providers: new Map(),
                    totalStock: 0,
                    priceRange: { min: hit.price, max: hit.price },
                    lastSyncedAt: hit.lastSyncedAt
                }
                groups.set(key, group)
            }

            group.totalStock += hit.stock || 0
            group.priceRange.min = Math.min(group.priceRange.min, hit.price)
            group.priceRange.max = Math.max(group.priceRange.max, hit.price)
            group.lastSyncedAt = Math.max(group.lastSyncedAt, hit.lastSyncedAt)

            if (!group.providers.has(hit.provider)) {
                group.providers.set(hit.provider, {
                    provider: hit.provider,
                    stock: hit.stock || 0,
                    minPrice: hit.price,
                    isActive: hit.isActive !== false
                })
            } else {
                const p = group.providers.get(hit.provider)
                p.stock += hit.stock
                p.minPrice = Math.min(p.minPrice, hit.price)
            }
        }

        const items = Array.from(groups.values()).map(g => ({
            ...g,
            providers: Array.from(g.providers.values()),
            totalProviders: g.providers.size
        }))

        items.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName))

        const start = (page - 1) * limit
        return {
            items: items.slice(start, start + limit),
            total: items.length
        }
    } catch (e: any) {
        logger.error('searchAdminCountries failed:', { error: e })
        return { items: [], total: 0 }
    }
}

export async function searchRawInventory(
    type: 'countries' | 'services',
    query: string = '',
    options?: { provider?: string; page?: number; limit?: number; includeHidden?: boolean }
): Promise<{ items: any[]; total: number }> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        const limit = options?.limit || 50
        const page = options?.page || 1

        // Build filter
        const filters: string[] = []
        if (options?.provider) filters.push(`providerName = "${options.provider}"`)
        if (!options?.includeHidden) filters.push('isActive = true')
        const filterStr = filters.length > 0 ? filters.join(' AND ') : undefined

        const result = await index.search(query, {
            filter: filterStr,
            limit: 10000,
            attributesToRetrieve: ['providerCountryCode', 'countryName', 'countryIcon', 'provider', 'providerServiceCode', 'serviceName', 'price', 'stock', 'lastSyncedAt', 'id', 'isActive'],
        })

        const seen = new Map<string, any>()

        for (const hit of result.hits as any[]) {
            const canonicalName = type === 'countries'
                ? hit.countryName
                : getCanonicalName(hit.serviceName)

            const normalizedKey = type === 'countries'
                ? normalizeCountryName(hit.countryName)
                : normalizeServiceName(canonicalName)

            const key = `${hit.provider}_${normalizedKey}`

            if (!seen.has(key)) {
                if (type === 'countries') {
                    seen.set(key, {
                        id: key,
                        externalId: hit.providerCountryCode, // Used only as visual ref
                        name: hit.countryName,
                        iconUrl: hit.countryIcon,
                        provider: hit.provider,
                        lastSyncedAt: new Date(hit.lastSyncedAt),
                        isActive: hit.isActive !== false
                    })
                } else {
                    seen.set(key, {
                        id: key,
                        externalId: hit.providerServiceCode, // Used only as visual ref
                        name: canonicalName,
                        code: generateCanonicalCode(canonicalName),
                        provider: hit.provider,
                        lastSyncedAt: new Date(hit.lastSyncedAt),
                        _count: { pricing: hit.stock ? 1 : 0 },
                        isActive: hit.isActive !== false,
                        iconUrl: hit.serviceIcon
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

export async function initSearchIndexes(indexName: string = INDEXES.OFFERS) {
    try {
        const offersIndex = meili.index(indexName)

        await offersIndex.updateSettings({
            searchableAttributes: ['serviceName', 'providerServiceCode', 'countryName', 'providerCountryCode', 'provider'],
            filterableAttributes: ['providerServiceCode', 'serviceName', 'serviceId', 'providerCountryCode', 'countryName', 'countryId', 'provider', 'operator', 'price', 'stock', 'lastSyncedAt', 'isActive'],
            sortableAttributes: ['price', 'stock', 'lastSyncedAt'],
            rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness', 'stock:desc', 'lastSyncedAt:desc'],
            distinctAttribute: null,
            typoTolerance: {
                enabled: true,
                minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
            },
            pagination: { maxTotalHits: 10000 }
        })

        logger.info('MeiliSearch "Deep Search" indexes initialized', { context: 'SEARCH' })
    } catch (error: any) {
        logger.error('Failed to initialize search indexes', { context: 'SEARCH', error: error.message })
    }
}

/**
 * Force re-application of search settings (e.g. after config change)
 */
export async function reconfigureIndexes() {
    logger.info('Reconfiguring search indexes with Deep Search settings...', { context: 'SEARCH' })
    await initSearchIndexes()
    logger.info('Deep Search upgrade complete.', { context: 'SEARCH' })
}

/**
 * Get service icon URL by service name
 * Uses same lookup logic as searchServices - queries offers index
 */
export async function getServiceIconUrlByName(serviceName: string): Promise<string | undefined> {
    if (!serviceName) return undefined
    try {
        const canonicalName = getCanonicalName(serviceName)
        const serviceCode = generateCanonicalCode(canonicalName)

        // 1. Check Local Smart Icon System
        // We prioritize local .webp icons managed by our sync script
        const localIconPath = path.join(process.cwd(), 'public/assets/icons/services', `${serviceCode}.webp`)
        if (fs.existsSync(localIconPath)) {
            return `/assets/icons/services/${serviceCode}.webp`
        }

        // Fallback to SVG if WebP missing
        const localSvgPath = path.join(process.cwd(), 'public/assets/icons/services', `${serviceCode}.svg`)
        if (fs.existsSync(localSvgPath)) {
            return `/assets/icons/services/${serviceCode}.svg`
        }

        const index = meili.index(INDEXES.OFFERS)

        // Try filter-based exact match first
        let result = await index.search<OfferDocument>('', {
            filter: `providerServiceCode = "${serviceCode}"`,
            limit: 10,
            attributesToRetrieve: ['serviceIcon', 'serviceName']
        })

        // Fallback to text search if no filter results
        if (result.hits.length === 0) {
            result = await index.search<OfferDocument>(serviceName, {
                limit: 10,
                attributesToRetrieve: ['serviceIcon', 'serviceName']
            })
        }

        // Find best icon (prefer local, then professional provider icons, allow dicebear as fallback)
        for (const hit of result.hits) {
            if (hit.serviceIcon && hit.serviceIcon.startsWith('http')) {
                // Return immediately if it's a professional icon
                if (!hit.serviceIcon.includes('dicebear')) return hit.serviceIcon;
            }
        }

        // Final fallback: just return the first one available (including dicebear)
        return result.hits[0]?.serviceIcon;
    } catch (error: any) {
        logger.error('Failed to lookup service icon', { context: 'SEARCH', serviceName, error: error.message })
    }
    return undefined
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
    options?: { page?: number; limit?: number; sort?: string }
): Promise<{ services: ServiceStats[]; total: number }> {
    const startTime = Date.now()
    try {
        const index = meili.index(INDEXES.OFFERS)
        const limit = options?.limit || 50
        const page = options?.page || 1

        // Optimized: Get only what we need for aggregation
        const result = await index.search(query, {
            filter: `isActive = true`,
            limit: 2000,
            attributesToRetrieve: [
                'providerServiceCode',
                'serviceName',
                'serviceIcon',
                'provider',
                'price',
                'stock',
                'countryName'
            ],
        })

        // Performance Tracking
        search_latency.observe({ type: 'services' }, (Date.now() - startTime) / 1000)

        logger.info('Search results', {
            context: 'SEARCH',
            query,
            hitsCount: result.hits.length,
            totalHits: result.estimatedTotalHits // For diagnostic
        })

        if (result.hits.length === 0) {
            search_empty_results.inc({ type: 'services', query })
            return { services: [], total: 0 }
        }

        const serviceMap = new Map<string, {
            key: string; // Internal key for enrichment
            slug: string;
            name: string;
            icon?: string;
            minPrice: number;
            totalStock: number;
            providerSet: Set<string>;
            countrySet: Set<string>;
            hits: any[];
        }>()

        for (const hit of result.hits as OfferDocument[]) {
            const canonicalName = getCanonicalName(hit.serviceName)
            if (!canonicalName) continue;

            const normalizedKey = normalizeServiceName(canonicalName)
            if (!normalizedKey) continue;

            let stats = serviceMap.get(normalizedKey)
            if (!stats) {
                const slug = hit.providerServiceCode || generateCanonicalCode(canonicalName)
                stats = {
                    key: normalizedKey,
                    slug: slug,
                    name: canonicalName,
                    icon: hit.serviceIcon,
                    minPrice: hit.price,
                    totalStock: 0,
                    providerSet: new Set(),
                    countrySet: new Set(),
                    hits: []
                }
                serviceMap.set(normalizedKey, stats)
            }

            stats.minPrice = Math.min(stats.minPrice, hit.price)
            stats.totalStock += hit.stock || 0
            stats.providerSet.add(hit.provider)
            stats.countrySet.add(normalizeCountryName(hit.countryName))
            if (stats.hits.length < 10) stats.hits.push(hit)

            if (hit.serviceIcon && !hit.serviceIcon.includes('dicebear')) {
                if (!stats.icon || stats.icon.includes('dicebear')) {
                    stats.icon = hit.serviceIcon
                }
            }
        }

        let services: any[] = Array.from(serviceMap.values()).map(stats => {
            const isPopular = POPULAR_SERVICES.includes(stats.slug) || stats.providerSet.size > 2
            return {
                key: stats.key,
                slug: stats.slug,
                name: stats.name,
                iconUrl: stats.icon || '',
                popular: isPopular,
                lowestPrice: stats.minPrice,
                totalStock: stats.totalStock,
                serverCount: stats.providerSet.size,
                countryCount: stats.countrySet.size,
                topCountries: []
            }
        })

        if (query) {
            const q = query.toLowerCase()
            services = services.filter(s =>
                s.name.toLowerCase().includes(q) || s.slug.includes(q)
            )
        }

        services.sort((a, b) => {
            if (options?.sort === 'price_asc') {
                const diff = a.lowestPrice - b.lowestPrice
                if (Math.abs(diff) > 0) return diff
            }
            if (options?.sort === 'stock_desc') {
                return b.totalStock - a.totalStock
            }
            const getScore = (s: ServiceStats) => {
                const stock = s.totalStock || 0
                const price = s.lowestPrice || 999
                const stockScore = Math.min(10, Math.log10(stock + 1) * 1.5)
                const priceScore = 15 / (1 + price)
                return (stockScore * 0.5) + (priceScore * 0.5) + (s.popular ? 3 : 0)
            }
            return getScore(b) - getScore(a)
        })

        const start = (page - 1) * limit
        const paginatedServices = services.slice(start, start + limit)

        const enrichedServices = await Promise.all(paginatedServices.map(async (service: any) => {
            const rawStats = serviceMap.get(service.key)
            if (!rawStats) {
                return { ...service, topCountries: [] }
            }

            const countryMap = new Map<string, CountryAggregate>()
            for (const hit of rawStats.hits) {
                aggregateCountryFromHit(countryMap, {
                    countryName: hit.countryName,
                    price: hit.price,
                    provider: hit.provider,
                    stock: hit.stock
                })
            }

            const topCountries = await getTopCountriesWithFlags(countryMap, 3)
            let finalIcon = service.iconUrl
            if (!finalIcon || finalIcon.includes('dicebear')) {
                const resolved = await getServiceIconUrlByName(service.name)
                if (resolved) finalIcon = resolved
            }

            if (!finalIcon) {
                finalIcon = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(service.name)}&backgroundColor=0ea5e9,6366f1,8b5cf6,ec4899`
            }

            return { ...service, iconUrl: finalIcon, topCountries }
        }))

        return { services: enrichedServices, total: services.length }
    } catch (error: any) {
        logger.error('searchServices failed:', { error })
        return { services: [], total: 0 }
    }
}






/**
 * Admin: Search Aggregated Services (Smart View)
 */
export async function searchAdminServices(
    query: string = '',
    options?: { page?: number; limit?: number; provider?: string; includeHidden?: boolean }
): Promise<{ items: any[]; total: number }> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        const limit = options?.limit || 50
        const page = options?.page || 1

        const filters: string[] = []
        if (options?.provider) filters.push(`provider = "${options.provider}"`)
        if (!options?.includeHidden) filters.push('isActive = true')

        const result = await index.search(query, {
            filter: filters.length > 0 ? filters.join(' AND ') : undefined,
            limit: 5000,
            attributesToRetrieve: ['providerServiceCode', 'serviceName', 'provider', 'countryName', 'price', 'stock', 'lastSyncedAt', 'isActive'],
        })

        const groups = new Map<string, any>()

        for (const hit of result.hits as OfferDocument[]) {
            const canonicalName = getCanonicalName(hit.serviceName)
            const key = normalizeServiceName(canonicalName)

            let group = groups.get(key)
            if (!group) {
                group = {
                    canonicalName: canonicalName,
                    canonicalCode: generateCanonicalCode(canonicalName),
                    providers: new Map(),
                    countries: new Set(),
                    totalStock: 0,
                    priceRange: { min: hit.price, max: hit.price },
                    lastSyncedAt: hit.lastSyncedAt
                }
                groups.set(key, group)
            }

            group.countries.add(normalizeCountryName(hit.countryName))
            group.totalStock += hit.stock || 0
            group.priceRange.min = Math.min(group.priceRange.min, hit.price)
            group.priceRange.max = Math.max(group.priceRange.max, hit.price)
            group.lastSyncedAt = Math.max(group.lastSyncedAt, hit.lastSyncedAt)

            if (!group.providers.has(hit.provider)) {
                group.providers.set(hit.provider, {
                    providerName: hit.provider,
                    externalId: hit.providerServiceCode,
                    stock: hit.stock || 0,
                    minPrice: hit.price,
                    isActive: hit.isActive !== false
                })
            } else {
                const p = group.providers.get(hit.provider)
                p.stock += hit.stock
                p.minPrice = Math.min(p.minPrice, hit.price)
            }
        }

        const items = Array.from(groups.values()).map(g => ({
            ...g,
            providers: Array.from(g.providers.values()),
            totalProviders: g.providers.size,
            countryCount: g.countries.size,
            bestPrice: g.priceRange.min
        }))

        items.sort((a, b) => b.totalProviders - a.totalProviders || a.canonicalName.localeCompare(b.canonicalName))

        const start = (page - 1) * limit
        return {
            items: items.slice(start, start + limit),
            total: items.length
        }
    } catch (error: any) {
        logger.error('searchAdminServices failed:', { error })
        return { items: [], total: 0 }
    }
}



/**
 * Step 3: Get Providers for Service + Country
 * Returns individual offer entries
 * 
 * Smart lookup: 
 * - Accepts either service slug (e.g., "wj") or service name (e.g., "1xbet")
 * - Accepts either country code (e.g., "22") or country name (e.g., "india")
 * and automatically resolves to the correct values for filtering.
 */
export async function searchProviders(
    serviceCode: string | number,
    countryInput: string | number,
    options?: { page?: number; limit?: number; sort?: string }
): Promise<{ providers: OfferDocument[]; total: number }> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        const limit = options?.limit || 20
        const page = options?.page || 1
        const sort = options?.sort || 'price_asc'

        // Build MeiliSearch sort array
        let meiliSort: string[] = ['price:asc', 'stock:desc']; // Default (Cheapest)

        if (sort === 'price_desc') {
            meiliSort = ['price:desc', 'stock:desc'];
        } else if (sort === 'stock_desc' || sort === 'stock') { // 'stock' for backward compatibility
            meiliSort = ['stock:desc', 'price:asc'];
        } else if (sort === 'relevance') {
            // Default MeiliSearch relevancy for text search, or price for empty query
            meiliSort = ['price:asc'];
        }

        // QUICK PATH: If numeric IDs are provided
        if (typeof serviceCode === 'number' && typeof countryInput === 'number') {
            const numericResult = await index.search('', {
                filter: `serviceId = ${serviceCode} AND countryId = ${countryInput} AND isActive = true`,
                sort: meiliSort,
                offset: (page - 1) * limit,
                limit: limit,
            })
            return {
                providers: numericResult.hits as OfferDocument[],
                total: numericResult.estimatedTotalHits || 0
            }
        }

        // STEP 1: RESOLVE SERVICE NAME (not slug!)
        // Service NAME is the true identity. Slugs are provider-specific and ambiguous.
        const rawServiceInput = String(serviceCode).toLowerCase().trim()

        // Check if input has a canonical mapping (e.g., "twitter" -> "Twitter / X")
        const canonicalNameFromMap = CANONICAL_SERVICE_NAME_MAP[rawServiceInput]

        let serviceNameToFilter: string

        if (canonicalNameFromMap) {
            // Direct canonical mapping exists
            serviceNameToFilter = canonicalNameFromMap
        } else {
            // Try Strategy 1: Find by providerKey (was serviceCode)
            const slugDiscovery = await index.search('', {
                filter: `providerServiceCode = "${rawServiceInput}"`,
                limit: 1,
                attributesToRetrieve: ['serviceName'],
            })

            if (slugDiscovery.hits.length > 0) {
                serviceNameToFilter = (slugDiscovery.hits[0] as OfferDocument).serviceName
            } else {
                // Try Strategy 2: Maybe input IS the service name - search by name directly
                const nameDiscovery = await index.search('', {
                    filter: `serviceName = "${rawServiceInput.charAt(0).toUpperCase() + rawServiceInput.slice(1)}"`,
                    limit: 1,
                    attributesToRetrieve: ['serviceName'],
                })

                if (nameDiscovery.hits.length > 0) {
                    serviceNameToFilter = (nameDiscovery.hits[0] as OfferDocument).serviceName
                } else {
                    // Strategy 3: Text search (most flexible)
                    const textSearch = await index.search(rawServiceInput, {
                        limit: 1,
                        attributesToRetrieve: ['serviceName'],
                    })
                    if (textSearch.hits.length > 0) {
                        serviceNameToFilter = (textSearch.hits[0] as OfferDocument).serviceName
                    } else {
                        serviceNameToFilter = rawServiceInput // Last resort
                    }
                }
            }
        }

        // STEP 2: RESOLVE COUNTRY NAME (from database, not string manipulation!)
        // Country NAME is the true identity. Codes are provider-specific and ambiguous.
        const rawCountryInput = String(countryInput).toLowerCase().trim()
        const isLikelyName = /^[a-z\s_\-]+$/i.test(rawCountryInput) && rawCountryInput.length > 2

        let countryNameToFilter: string

        if (isLikelyName) {
            // Clean up for search (replace underscores with spaces)
            const cleanedInput = rawCountryInput.replace(/[_\-]/g, ' ')

            // Look up the EXACT country name from the database
            const countryLookup = await index.search(cleanedInput, {
                limit: 10,
                attributesToRetrieve: ['countryName'],
            })

            if (countryLookup.hits.length > 0) {
                // Find best match (prefer exact normalized match)
                const normalizedInput = cleanedInput.replace(/\s+/g, '').toLowerCase()
                const exactMatch = (countryLookup.hits as OfferDocument[]).find(h =>
                    h.countryName.replace(/\s+/g, '').toLowerCase() === normalizedInput
                )
                countryNameToFilter = exactMatch ? exactMatch.countryName : (countryLookup.hits[0] as OfferDocument).countryName
            } else {
                // Fallback to capitalized input
                countryNameToFilter = cleanedInput
                    .split(' ')
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ')
            }
        } else {
            // It's a numeric code - TRY to look up (ambiguous!)
            const countryLookup = await index.search('', {
                filter: `providerCountryCode = "${rawCountryInput}"`,
                limit: 1,
                attributesToRetrieve: ['countryName'],
            })
            if (countryLookup.hits.length > 0) {
                countryNameToFilter = (countryLookup.hits[0] as OfferDocument).countryName
            } else {
                countryNameToFilter = rawCountryInput // Last resort
            }
        }

        // STEP 3: Build filter by NAMES (unambiguous identities)
        const serviceFilter = `serviceName = "${serviceNameToFilter}"`
        const countryFilter = `countryName = "${countryNameToFilter}"`

        // Execute search
        let result = await index.search('', {
            filter: `${serviceFilter} AND ${countryFilter}`,
            sort: meiliSort,
            offset: (page - 1) * limit,
            limit: limit,
        })

        let hits = result.hits as OfferDocument[]

        // UNIFIED ICON LOGIC
        // Icon Resolution: Best from results > DiceBear (use service NAME for seed)
        const finalIcon = hits.find(h => h.serviceIcon && h.serviceIcon.startsWith('http') && !h.serviceIcon.includes('dicebear'))?.serviceIcon

        if (finalIcon) {
            hits = hits.map(h => ({ ...h, serviceIcon: finalIcon }))
        } else {
            // Fallback to high-quality DiceBear using the resolved service NAME as seed
            const seed = serviceNameToFilter || rawServiceInput
            const fallback = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0ea5e9,6366f1,8b5cf6,ec4899`
            hits = hits.map(h => ({ ...h, serviceIcon: h.serviceIcon || fallback }))
        }

        return {
            providers: hits,
            total: result.estimatedTotalHits || 0,
        }
    } catch (error: any) {
        logger.error('searchProviders failed', { context: 'SEARCH', serviceCode, countryInput, error: error.message })
        return { providers: [], total: 0 }
    }
}

/**
 * Get a specific offer from MeiliSearch for purchase
 * Uses same name resolution as searchProviders for consistency
 * 
 * @param serviceInput - Service slug or name (e.g., "discord", "Discord")
 * @param countryInput - Country code or name (e.g., "india", "India")
 * @param operatorId - Optional specific operator/server ID
 * @returns OfferDocument with provider info for purchase routing
 */
export async function getOfferForPurchase(
    serviceInput: string | number,
    countryInput: string | number,
    operatorId?: number,
    provider?: string
): Promise<OfferDocument | null> {
    try {
        const index = meili.index(INDEXES.OFFERS)

        // QUICK PATH: If numeric IDs are provided, filter directly
        if (typeof serviceInput === 'number' && typeof countryInput === 'number') {
            const filters = [
                `serviceId = ${serviceInput}`,
                `countryId = ${countryInput}`,
                'stock > 0',
                'isActive = true'
            ]
            if (operatorId) filters.push(`operatorId = ${operatorId}`)
            if (provider) filters.push(`provider = "${provider}"`)

            const numericSearch = await index.search('', {
                filter: filters.join(' AND '),
                limit: 1,
                sort: ['price:asc']
            })

            if (numericSearch.hits.length > 0) return numericSearch.hits[0] as OfferDocument
        }

        // STEP 1: RESOLVE SERVICE NAME (same as searchProviders)
        const rawServiceInput = String(serviceInput).toLowerCase().trim()
        const canonicalNameFromMap = CANONICAL_SERVICE_NAME_MAP[rawServiceInput]

        let serviceNameToFilter: string

        if (canonicalNameFromMap) {
            serviceNameToFilter = canonicalNameFromMap
        } else {
            let slugFilter = `providerServiceCode = "${rawServiceInput}"`
            if (provider) {
                slugFilter += ` AND provider = "${provider}"`
            }

            const slugDiscovery = await index.search('', {
                filter: slugFilter,
                limit: 1,
                attributesToRetrieve: ['serviceName'],
            })

            if (slugDiscovery.hits.length > 0) {
                serviceNameToFilter = (slugDiscovery.hits[0] as OfferDocument).serviceName
            } else {
                const textSearch = await index.search(rawServiceInput, {
                    limit: 1,
                    attributesToRetrieve: ['serviceName'],
                    filter: provider ? `provider = "${provider}"` : undefined
                })
                serviceNameToFilter = textSearch.hits.length > 0
                    ? (textSearch.hits[0] as OfferDocument).serviceName
                    : rawServiceInput
            }
        }

        // STEP 2: RESOLVE COUNTRY NAME (same as searchProviders)
        const rawCountryInput = String(countryInput).toLowerCase().trim()
        const isLikelyName = /^[a-z\s_\-]+$/i.test(rawCountryInput) && rawCountryInput.length > 2

        let countryNameToFilter: string

        if (isLikelyName) {
            const cleanedInput = rawCountryInput.replace(/[_\-]/g, ' ')
            const countryLookup = await index.search(cleanedInput, {
                limit: 10,
                attributesToRetrieve: ['countryName'],
                filter: provider ? `provider = "${provider}"` : undefined
            })

            if (countryLookup.hits.length > 0) {
                const normalizedInput = cleanedInput.replace(/\s+/g, '').toLowerCase()
                const exactMatch = (countryLookup.hits as OfferDocument[]).find(h =>
                    h.countryName.replace(/\s+/g, '').toLowerCase() === normalizedInput
                )
                countryNameToFilter = exactMatch ? exactMatch.countryName : (countryLookup.hits[0] as OfferDocument).countryName
            } else {
                countryNameToFilter = cleanedInput
                    .split(' ')
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ')
            }
        } else {
            let codeFilter = `providerCountryCode = "${rawCountryInput}"`
            if (provider) {
                codeFilter += ` AND provider = "${provider}"`
            }

            const countryLookup = await index.search('', {
                filter: codeFilter,
                limit: 1,
                attributesToRetrieve: ['countryName'],
            })
            countryNameToFilter = countryLookup.hits.length > 0
                ? (countryLookup.hits[0] as OfferDocument).countryName
                : rawCountryInput
        }

        // STEP 3: Build filter and find offer
        let filter = `serviceName = "${serviceNameToFilter}" AND countryName = "${countryNameToFilter}" AND stock > 0`

        if (operatorId !== undefined) {
            filter += ` AND operator = "${operatorId}"` // Map numeric ID to string operator field if needed, or remove check if operatorId is obsolete
        }
        if (provider) {
            filter += ` AND provider = "${provider.toLowerCase()}"`
        }

        logger.debug('[PURCHASE] Looking up offer with filter', {
            context: 'SEARCH',
            serviceNameToFilter,
            countryNameToFilter,
            operatorId,
            provider
        })

        const result = await index.search('', {
            filter,
            limit: 1,
            sort: ['price:asc'], // Get cheapest
        })

        if (result.hits.length === 0) {
            logger.warn('No offer found during purchase lookup', {
                context: 'SEARCH',
                service: serviceNameToFilter,
                country: countryNameToFilter
            })
            return null
        }

        const offer = result.hits[0] as OfferDocument
        logger.debug('Found offer for purchase', {
            context: 'SEARCH',
            providerName: offer.provider,
            price: offer.price,
            stock: offer.stock,
            operator: offer.operator
        })

        return offer
    } catch (error: any) {
        logger.error('getOfferForPurchase failed', { context: 'SEARCH', serviceInput, countryInput, error: error.message })
        return null
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

        // SMART COUNTRY RESOLUTION
        // If countryCode filter looks like a name (letters), resolve it first
        let resolvedCountryFilter = filters?.countryCode
        if (filters?.countryCode) {
            const rawCountryInput = filters.countryCode.toLowerCase().trim()
            // If input contains letters (and optional underscores/hyphens/spaces) but no digits, it's likely a country NAME
            const isCountryName = /^[a-z\s_\-]+$/i.test(rawCountryInput) && rawCountryInput.length > 2

            if (isCountryName) {
                // Clean up input for search (replace underscores/hyphens with spaces)
                const cleanNameQuery = rawCountryInput.replace(/[_\-]/g, ' ')

                // It's a name, try to resolve to code
                const countryLookup = await index.search(cleanNameQuery, {
                    limit: 10,
                    attributesToRetrieve: ['providerCountryCode', 'countryName'],
                })

                if (countryLookup.hits.length > 0) {
                    // Find exact match (case-insensitive)
                    const exactMatch = countryLookup.hits.find((hit: any) =>
                        (hit as OfferDocument).countryName.toLowerCase() === rawCountryInput
                    )
                    if (exactMatch) {
                        resolvedCountryFilter = (exactMatch as OfferDocument).countryName // Filter by NAME, not code
                    } else {
                        // Use first result as fallback
                        resolvedCountryFilter = (countryLookup.hits[0] as OfferDocument).countryName
                    }
                }
            }
        }

        // Build filter array
        const filterParts: string[] = []
        if (resolvedCountryFilter) filterParts.push(`countryName = "${resolvedCountryFilter}"`)

        if (filters?.serviceCode) {
            const raw = filters.serviceCode.toLowerCase().trim()
            const effective = CANONICAL_SERVICE_NAMES[raw] || raw
            // Map code/slug to Name for filtering
            const name = CANONICAL_SERVICE_NAMES[effective] || CANONICAL_DISPLAY_NAMES[effective] || effective
            filterParts.push(`serviceName = "${name}"`)
        }
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
    } catch (error: any) {
        logger.error('searchOffers failed', { context: 'SEARCH', query, filters, error: error.message })
        return { hits: [], total: 0 }
    }
}

// ============================================
// INDEX MANAGEMENT
// ============================================

/**
 * Add or update offers in the index
 */
export async function indexOffers(offers: OfferDocument[], indexName: string = INDEXES.OFFERS): Promise<number | undefined> {
    if (offers.length === 0) return undefined
    try {
        const index = meili.index(indexName)

        // SMART NORMALIZATION: Unify service and country names before indexing
        // UPDATE: Removed overwriting of countryCode/serviceCode. We trust the provider-sync to provide strict IDs.
        const normalizedOffers = offers.map(offer => {
            return {
                ...offer,
                // Only clean up URLs if needed, but preserve strict codes
                serviceIcon: isValidImageUrl(offer.serviceIcon) ? offer.serviceIcon : undefined,
                countryIcon: isValidImageUrl(offer.countryIcon) ? offer.countryIcon : '',
                // logoUrl removed
            }
        })

        const task = await index.addDocuments(normalizedOffers, { primaryKey: 'id' })
        logger.info('Queued offers for indexing', { context: 'SEARCH', count: normalizedOffers.length, taskUid: task.taskUid })
        return task.taskUid
    } catch (error: any) {
        logger.error('Failed to index offers', { context: 'SEARCH', error: error.message })
        return undefined
    }
}

/**
 * Atomic Index Swap (Blue-Green Deployment for Data)
 * 
 * Enhanced in Phase 28 with exponential retry logic and task tracking.
 */
export async function swapShadowToPrimary(shadowIndexName: string, primaryIndexName: string): Promise<void> {
    try {
        logger.info(`[SEARCH] Initializing atomic swap: ${shadowIndexName} -> ${primaryIndexName}`);

        // 1. Queue the Swap Operation
        const task = await (meili as any).swapIndexes([
            { indexes: [shadowIndexName, primaryIndexName] }
        ]);

        logger.info(`[SEARCH] Atomic swap queued (task ${task.taskUid})`);

        // 2. Resilient Polling with Backoff
        let delay = 1000;
        const maxDelay = 10000;
        const timeout = 120000; // 2 minutes
        const start = Date.now();

        while (Date.now() - start < timeout) {
            const success = await waitForTask(task.taskUid, 5000);
            if (success) {
                logger.info(`[SEARCH] Atomic swap successful.`);

                // Cleanup: Delete the legacy index (now named shadow)
                try {
                    await meili.deleteIndex(shadowIndexName);
                    logger.info(`[SEARCH] Legacy data purged.`);
                } catch (e) {
                    logger.warn(`[SEARCH] Cleanup of old index ${shadowIndexName} failed (likely already gone)`);
                }
                return;
            }

            await new Promise(r => setTimeout(r, delay));
            delay = Math.min(delay * 1.5, maxDelay);
        }

        throw new Error(`Swap task ${task.taskUid} timed out after ${timeout}ms`);

    } catch (error: any) {
        logger.error('[SEARCH] Atomic swap critical failure:', { error });
        throw error;
    }
}

/**
 * Delete offers by provider (for re-sync)
 */
export async function deleteOffersByProvider(provider: string): Promise<void> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        await index.deleteDocuments({ filter: `provider = "${provider}"` })
        console.log(`ðŸ—‘ï¸ Deleted offers for provider: ${provider}`)
    } catch (error: any) {
        logger.error('Failed to delete offers', { context: 'SEARCH', provider, error: error.message })
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
    } catch (error: any) {
        logger.error('Failed to get index stats', { context: 'SEARCH', error: error.message })
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
                logger.error('MeiliSearch task failed', { context: 'SEARCH', taskUid, error: task.error })
                return false
            }
            await new Promise(r => setTimeout(r, 1000))
        } catch (error: any) {
            logger.error('Error checking MeiliSearch task', { context: 'SEARCH', taskUid, error: error.message })
            return false
        }
    }
    logger.error('MeiliSearch task timed out', { context: 'SEARCH', taskUid })
    return false
}
