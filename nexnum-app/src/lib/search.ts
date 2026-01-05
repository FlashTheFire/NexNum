/**
 * MeiliSearch-First Search System
 * 
 * Single `offers` index is the source of truth for all Buy flow data.
 * Uses faceted search for aggregations (services, countries).
 * No PostgreSQL dependency for searches.
 */

import { MeiliSearch } from 'meilisearch'
import { getCountryFlagUrl } from './country-flags'

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
    id: string;           // Composite: provider_country_service_operator

    // Service Info
    serviceSlug: string;
    serviceName: string;
    iconUrl?: string;  // Service icon URL

    // Country Info
    countryCode: string;
    countryName: string;
    flagUrl: string;

    // Provider Info
    provider: string;
    displayName: string;
    logoUrl?: string;

    // Operator/Server Info (for purchase routing)
    operatorId: number;           // Our internal sequential ID (1, 2, 3...) - safe for users
    externalOperator?: string;    // Provider's raw operator ID (backend only, not exposed to users)
    operatorDisplayName: string;  // Custom display name for operator (default: "")

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
    flagUrl: string;
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
 * Normalize country name for consistent aggregation
 * Removes accents, special chars, and lowercases
 */
export function normalizeCountryName(name: string): string {
    return name.toLowerCase().trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z\s]/g, "")
        .trim()
}

/**
 * Country aggregate data structure used during aggregation
 */
export interface CountryAggregate {
    name: string;           // Display name
    flagUrl: string;        // Provider's flag URL (fallback)
    minPrice: number;       // Lowest price
    totalStock: number;     // Total stock
    providers: Set<string>; // Unique providers
}

/**
 * Aggregate a single hit into country map
 * Used by both searchServices (Step 1) and searchCountries (Step 2)
 */
export function aggregateCountryFromHit(
    countryMap: Map<string, CountryAggregate>,
    hit: { countryCode?: string; countryName: string; flagUrl?: string; price: number; stock?: number; provider: string }
): void {
    const key = hit.countryCode || normalizeCountryName(hit.countryName)

    if (!countryMap.has(key)) {
        countryMap.set(key, {
            name: hit.countryName,
            flagUrl: hit.flagUrl || '',
            minPrice: hit.price,
            totalStock: hit.stock || 0,
            providers: new Set([hit.provider])
        })
    } else {
        const stats = countryMap.get(key)!
        stats.minPrice = Math.min(stats.minPrice, hit.price)
        stats.totalStock += hit.stock || 0
        stats.providers.add(hit.provider)

        // Prefer longer/better display name
        if (hit.countryName && hit.countryName.length > stats.name.length) {
            stats.name = hit.countryName
        }

        // Prefer non-empty flag URLs
        if (hit.flagUrl && (!stats.flagUrl || stats.flagUrl.length < hit.flagUrl.length)) {
            stats.flagUrl = hit.flagUrl
        }
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

    // Generate circle-flags URLs with fallback
    return Promise.all(
        sorted.map(async ([code, c]) => {
            // Try circle-flags first (same as Step 2 FlagImage component)
            let flagUrl = await getCountryFlagUrl(c.name)

            // Fallback to provider flag if mapping fails
            if (!flagUrl) {
                flagUrl = c.flagUrl
            }

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
 * 
 * SMART FEATURES:
 * - Aggregates by normalized country NAME (not provider code) to eliminate duplicates
 * - Smart service lookup: accepts both slug ("tg") and name ("Telegram")
 * - Picks best flagUrl from available offers
 */
export async function searchCountries(
    serviceSlug: string,
    query: string = '',
    options?: { page?: number; limit?: number; sort?: string }
): Promise<{ countries: CountryStats[]; total: number }> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        const limit = options?.limit || 50
        const page = options?.page || 1
        const sort = options?.sort || 'name'

        // STEP 1: RESOLVE SERVICE NAME (not slug!)
        // Service NAME is the true identity. Slugs are provider-specific and ambiguous.
        const rawInput = serviceSlug.toLowerCase().trim()

        // Check if input has a canonical mapping (e.g., "twitter" -> "Twitter / X")
        const canonicalNameFromMap = CANONICAL_SERVICE_NAME_MAP[rawInput]

        let serviceNameToFilter: string

        if (canonicalNameFromMap) {
            // Direct canonical mapping exists
            serviceNameToFilter = canonicalNameFromMap
        } else {
            // Try Strategy 1: Find by serviceSlug
            const slugDiscovery = await index.search('', {
                filter: `serviceSlug = "${rawInput}"`,
                limit: 1,
                attributesToRetrieve: ['serviceName'],
            })

            if (slugDiscovery.hits.length > 0) {
                serviceNameToFilter = (slugDiscovery.hits[0] as OfferDocument).serviceName
            } else {
                // Try Strategy 2: Maybe input IS the service name - search by name directly
                const nameDiscovery = await index.search('', {
                    filter: `serviceName = "${rawInput.charAt(0).toUpperCase() + rawInput.slice(1)}"`,
                    limit: 1,
                    attributesToRetrieve: ['serviceName'],
                })

                if (nameDiscovery.hits.length > 0) {
                    serviceNameToFilter = (nameDiscovery.hits[0] as OfferDocument).serviceName
                } else {
                    // Strategy 3: Text search (most flexible)
                    const textSearch = await index.search(rawInput, {
                        limit: 1,
                        attributesToRetrieve: ['serviceName'],
                    })
                    if (textSearch.hits.length > 0) {
                        serviceNameToFilter = (textSearch.hits[0] as OfferDocument).serviceName
                    } else {
                        serviceNameToFilter = rawInput // Last resort
                    }
                }
            }
        }

        // STEP 2: Filter by SERVICE NAME (unambiguous identity)
        // This correctly handles the case where different services have the same slug
        const serviceFilter = `serviceName = "${serviceNameToFilter}"`

        let result = await index.search('', {
            filter: serviceFilter,
            limit: 10000,
            attributesToRetrieve: ['countryCode', 'countryName', 'flagUrl', 'provider', 'price', 'stock'],
        })

        // SMART AGGREGATION: Group by NORMALIZED COUNTRY NAME (not provider code!)
        // This eliminates duplicates like "Algeria" appearing 3 times from different providers
        const normalizeCountryName = (name: string) =>
            name.toLowerCase().trim()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z\s]/g, "")
                .trim()

        const countryMap = new Map<string, {
            displayName: string;  // Best display name (longest/most proper)
            flagUrl: string;      // Best flagUrl (prefer non-empty, valid URLs)
            minPrice: number;
            totalStock: number;
            providers: Set<string>;
            countryCodes: Set<string>;  // Track all provider codes for this country
        }>()

        for (const hit of result.hits as OfferDocument[]) {
            const normalizedName = normalizeCountryName(hit.countryName || '')
            if (!normalizedName) continue

            if (!countryMap.has(normalizedName)) {
                countryMap.set(normalizedName, {
                    displayName: hit.countryName,
                    flagUrl: hit.flagUrl || '',
                    minPrice: hit.price,
                    totalStock: 0,
                    providers: new Set(),
                    countryCodes: new Set(),
                })
            }

            const stats = countryMap.get(normalizedName)!

            // Pick best display name (prefer longer, properly formatted names)
            if (hit.countryName && hit.countryName.length > stats.displayName.length) {
                stats.displayName = hit.countryName
            }

            // Pick best flagUrl (prefer non-empty, non-numeric code URLs)
            if (hit.flagUrl && (!stats.flagUrl || stats.flagUrl.length < hit.flagUrl.length)) {
                // Prefer provider SVG URLs over empty/short ones
                if (!stats.flagUrl.includes('grizzlysms') && hit.flagUrl.includes('grizzlysms')) {
                    stats.flagUrl = hit.flagUrl
                } else if (!stats.flagUrl) {
                    stats.flagUrl = hit.flagUrl
                }
            }

            stats.minPrice = Math.min(stats.minPrice, hit.price)
            stats.totalStock += hit.stock || 0
            stats.providers.add(hit.provider)
            stats.countryCodes.add(hit.countryCode)
        }

        // Convert to array - use normalized name as code for consistency
        let countries: CountryStats[] = Array.from(countryMap.entries()).map(([normalizedName, stats]) => ({
            code: normalizedName.replace(/\s+/g, '_'),  // Clean code for identification
            name: stats.displayName,
            flagUrl: stats.flagUrl,
            lowestPrice: stats.minPrice,
            totalStock: stats.totalStock,
            serverCount: stats.providers.size,
        }))

        // Filter by query
        if (query) {
            const q = query.toLowerCase()
            countries = countries.filter(c =>
                c.name.toLowerCase().includes(q)
            )
        }

        // Sorting
        switch (sort) {
            case 'relevance':
                // Relevance = cheapest first (most attractive offers)
                countries.sort((a, b) => a.lowestPrice - b.lowestPrice)
                break
            case 'price_asc':
                countries.sort((a, b) => a.lowestPrice - b.lowestPrice)
                break
            case 'price':
                countries.sort((a, b) => a.lowestPrice - b.lowestPrice)
                break
            case 'price_desc':
                countries.sort((a, b) => b.lowestPrice - a.lowestPrice)
                break
            case 'stock_desc':
                countries.sort((a, b) => b.totalStock - a.totalStock)
                break
            case 'stock':
                countries.sort((a, b) => b.totalStock - a.totalStock)
                break
            default:
                // Default to Name (A-Z)
                countries.sort((a, b) => a.name.localeCompare(b.name))
        }

        // Pagination
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

import { SEARCH_SYNONYMS, SEARCH_STOP_WORDS, RANKING_RULES, SEARCHABLE_ATTRIBUTES, FILTERABLE_ATTRIBUTES, CANONICAL_SERVICE_NAMES, CANONICAL_SERVICE_NAME_MAP, CANONICAL_DISPLAY_NAMES, CANONICAL_SERVICE_ICONS, POPULAR_SERVICES } from './search-config'

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
    options?: { page?: number; limit?: number; sort?: string }
): Promise<{ services: ServiceStats[]; total: number }> {
    try {
        const index = meili.index(INDEXES.OFFERS)
        const limit = options?.limit || 50
        const page = options?.page || 1

        // Get all matching offers to aggregate
        const result = await index.search(query, {
            limit: 5000, // Get enough for aggregation
            attributesToRetrieve: ['serviceSlug', 'serviceName', 'iconUrl', 'countryCode', 'countryName', 'flagUrl', 'provider', 'price', 'stock'],
        })

        // Aggregate by NORMALIZED SERVICE NAME (universal deduplication)
        // This merges services regardless of provider-specific slug variations
        const serviceMap = new Map<string, {
            slug: string;       // Best canonical slug for routing
            name: string;       // Display name
            icon?: string;      // Best icon URL
            minPrice: number;
            totalStock: number;
            providers: Set<string>;
            countries: Map<string, CountryAggregate>;
        }>()

        for (const hit of result.hits as OfferDocument[]) {
            // STEP 1: Canonicalize service name (e.g., "Twitter / X" -> "Twitter")
            const rawName = hit.serviceName
            const canonicalName = CANONICAL_SERVICE_NAME_MAP[rawName.toLowerCase()] || rawName

            // STEP 2: Normalize for aggregation key
            const normalizedKey = canonicalName
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric

            // Determine the canonical slug for this hit
            const hitSlug = CANONICAL_SERVICE_NAMES[hit.serviceSlug] || hit.serviceSlug

            if (!serviceMap.has(normalizedKey)) {
                serviceMap.set(normalizedKey, {
                    slug: hitSlug,
                    name: canonicalName, // Use canonical name, not raw
                    icon: hit.iconUrl,
                    minPrice: hit.price,
                    totalStock: 0,
                    providers: new Set(),
                    countries: new Map(),
                })
            }
            const stats = serviceMap.get(normalizedKey)!
            stats.minPrice = Math.min(stats.minPrice, hit.price)
            stats.totalStock += hit.stock || 0
            stats.providers.add(hit.provider)

            // Use shared country aggregation helper
            aggregateCountryFromHit(stats.countries, {
                countryCode: hit.countryCode,
                countryName: hit.countryName,
                flagUrl: hit.flagUrl,
                price: hit.price,
                stock: hit.stock,
                provider: hit.provider
            })

            // SMART ICON PREFERENCE: Prefer real icons over placeholders
            const currentIconIsPlaceholder = !stats.icon || stats.icon.includes('dicebear')
            const hitIconIsReal = hit.iconUrl && hit.iconUrl.startsWith('http') && !hit.iconUrl.includes('dicebear')

            if (hitIconIsReal && currentIconIsPlaceholder) {
                stats.icon = hit.iconUrl
                stats.slug = hitSlug // Prefer the slug from the provider with the real icon
            }
        }

        // Convert to array and sort by name
        let services: ServiceStats[] = []

        for (const [_normalizedKey, stats] of serviceMap.entries()) {
            // Use shared function for top countries with flags (same logic as Step 2)
            const topCountries = await getTopCountriesWithFlags(stats.countries, 3)

            // Determine Popularity (Backend Driven) - use the stored canonical slug
            const isPopular = POPULAR_SERVICES.includes(stats.slug) || stats.providers.size > 2

            // Icon Resolution: Canonical > Aggregated Valid > DiceBear Fallback
            let finalIcon = CANONICAL_SERVICE_ICONS[stats.slug] || stats.icon
            if (!finalIcon || !finalIcon.startsWith('http')) {
                finalIcon = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(stats.name)}&backgroundColor=0ea5e9,6366f1,8b5cf6,ec4899`
            }

            services.push({
                slug: stats.slug,
                name: CANONICAL_DISPLAY_NAMES[stats.slug] || stats.name,
                iconUrl: finalIcon,
                popular: isPopular,
                lowestPrice: stats.minPrice,
                totalStock: stats.totalStock,
                serverCount: stats.providers.size,
                countryCount: stats.countries.size,
                topCountries
            })
        }

        // Filter by query if specified
        if (query) {
            const q = query.toLowerCase()
            services = services.filter(s =>
                s.name.toLowerCase().includes(q) || s.slug.includes(q)
            )
        }

        // Sort by name (with Popular priority on default view)
        // Sort services
        services.sort((a, b) => {
            // Price Ascending
            if (options?.sort === 'price_asc') {
                const diff = (a.lowestPrice || Infinity) - (b.lowestPrice || Infinity)
                if (Math.abs(diff) > 0.0001) return diff
            }
            // Stock Descending
            if (options?.sort === 'stock_desc') {
                const diff = (b.totalStock || 0) - (a.totalStock || 0)
                if (diff !== 0) return diff
            }

            // Default (Relevance/Popularity)
            if (!query) {
                // Show popular first
                if (a.popular && !b.popular) return -1
                if (!a.popular && b.popular) return 1
            }
            return a.name.localeCompare(b.name)
        })

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
 * 
 * Smart lookup: 
 * - Accepts either service slug (e.g., "wj") or service name (e.g., "1xbet")
 * - Accepts either country code (e.g., "22") or country name (e.g., "india")
 * and automatically resolves to the correct values for filtering.
 */
export async function searchProviders(
    serviceSlug: string,
    countryInput: string,
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

        // STEP 1: RESOLVE SERVICE NAME (not slug!)
        // Service NAME is the true identity. Slugs are provider-specific and ambiguous.
        const rawServiceInput = serviceSlug.toLowerCase().trim()

        // Check if input has a canonical mapping (e.g., "twitter" -> "Twitter / X")
        const canonicalNameFromMap = CANONICAL_SERVICE_NAME_MAP[rawServiceInput]

        let serviceNameToFilter: string

        if (canonicalNameFromMap) {
            // Direct canonical mapping exists
            serviceNameToFilter = canonicalNameFromMap
        } else {
            // Try Strategy 1: Find by serviceSlug
            const slugDiscovery = await index.search('', {
                filter: `serviceSlug = "${rawServiceInput}"`,
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
        const rawCountryInput = countryInput.toLowerCase().trim()
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
                filter: `countryCode = "${rawCountryInput}"`,
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
        const finalIcon = hits.find(h => h.iconUrl && h.iconUrl.startsWith('http') && !h.iconUrl.includes('dicebear'))?.iconUrl

        if (finalIcon) {
            hits = hits.map(h => ({ ...h, iconUrl: finalIcon }))
        } else {
            // Fallback to high-quality DiceBear using the resolved service NAME as seed
            const seed = serviceNameToFilter || rawServiceInput
            const fallback = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0ea5e9,6366f1,8b5cf6,ec4899`
            hits = hits.map(h => ({ ...h, iconUrl: h.iconUrl || fallback }))
        }

        return {
            providers: hits,
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
                    attributesToRetrieve: ['countryCode', 'countryName'],
                })

                if (countryLookup.hits.length > 0) {
                    // Find exact match (case-insensitive)
                    const exactMatch = countryLookup.hits.find((hit: any) =>
                        (hit as OfferDocument).countryName.toLowerCase() === rawCountryInput
                    )
                    if (exactMatch) {
                        resolvedCountryFilter = (exactMatch as OfferDocument).countryCode
                    } else {
                        // Use first result as fallback
                        resolvedCountryFilter = (countryLookup.hits[0] as OfferDocument).countryCode
                    }
                }
            }
        }

        // Build filter array
        const filterParts: string[] = []
        if (resolvedCountryFilter) filterParts.push(`countryCode = "${resolvedCountryFilter}"`)

        if (filters?.serviceCode) {
            const raw = filters.serviceCode.toLowerCase().trim()
            const effective = CANONICAL_SERVICE_NAMES[raw] || raw
            filterParts.push(`serviceSlug = "${effective}"`)
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

        // SMART NORMALIZATION: Unify service names before indexing
        const normalizedOffers = offers.map(offer => {
            const rawSlug = offer.serviceSlug.toLowerCase().trim()
            const canonicalSlug = CANONICAL_SERVICE_NAMES[rawSlug]

            if (canonicalSlug) {
                // If a canonical mapping exists, use it!
                return {
                    ...offer,
                    serviceSlug: canonicalSlug,
                    serviceName: canonicalSlug === 'telegram' && offer.serviceName.length <= 3 ? 'Telegram' :
                        canonicalSlug === 'whatsapp' && offer.serviceName.length <= 3 ? 'WhatsApp' :
                            offer.serviceName
                }
            }
            return offer
        })

        const task = await index.addDocuments(normalizedOffers, { primaryKey: 'id' })
        console.log(`📦 Queued ${normalizedOffers.length} offers (task ${task.taskUid})`)
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
