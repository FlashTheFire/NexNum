/**
 * Service Aggregate Utilities
 * 
 * Precomputed aggregates for fast list responses.
 * Updated during sync or via background job.
 */

import { prisma } from './db'

interface ServiceAggregateData {
    serviceCode: string
    serviceName: string
    lowestPrice: number
    totalStock: bigint
    countryCount: number
    providerCount: number
}

/**
 * Recalculate all service aggregates from ProviderPricing
 * Run after a full sync or periodically
 */
export async function refreshAllServiceAggregates() {
    console.log('[AGGREGATES] Refreshing all service aggregates...')

    // Get all unique services with their stats
    const stats = await prisma.$queryRaw<ServiceAggregateData[]>`
    SELECT 
      ps.code AS "serviceCode",
      ps.name AS "serviceName",
      MIN(pp."sellPrice")::numeric AS "lowestPrice",
      SUM(pp.stock)::bigint AS "totalStock",
      COUNT(DISTINCT pp.country_id)::int AS "countryCount",
      COUNT(DISTINCT pp.provider_id)::int AS "providerCount"
    FROM provider_pricing pp
    JOIN provider_services ps ON pp.service_id = ps.id
    WHERE pp.deleted = false AND pp.stock > 0
    GROUP BY ps.code, ps.name
  `

    console.log(`[AGGREGATES] Found ${stats.length} services to aggregate`)

    // Upsert each aggregate
    for (const stat of stats) {
        await prisma.serviceAggregate.upsert({
            where: { serviceCode: stat.serviceCode },
            create: {
                serviceCode: stat.serviceCode,
                serviceName: stat.serviceName,
                lowestPrice: stat.lowestPrice,
                totalStock: stat.totalStock,
                countryCount: stat.countryCount,
                providerCount: stat.providerCount,
                lastUpdatedAt: new Date()
            },
            update: {
                serviceName: stat.serviceName,
                lowestPrice: stat.lowestPrice,
                totalStock: stat.totalStock,
                countryCount: stat.countryCount,
                providerCount: stat.providerCount,
                lastUpdatedAt: new Date()
            }
        })
    }

    console.log(`[AGGREGATES] Successfully updated ${stats.length} service aggregates`)
    return stats.length
}

/**
 * Get service aggregates for the main list view
 * Precomputed = instant response
 */
import { meili, INDEXES } from './search'

/**
 * Get service aggregates for the main list view
 * Hybrid Approach: 
 * 1. If query present: Use MeiliSearch for typo-tolerance to get matching service codes
 * 2. Fetch actual aggregates from DB using those codes
 * 3. Fallback to SQL ILIKE if Meili fails or no query
 */
export async function getServiceAggregates(options?: {
    query?: string
    page?: number
    limit?: number
    sortBy?: 'name' | 'price' | 'stock'
}) {
    const limit = options?.limit || 50
    const page = options?.page || 1
    const offset = (page - 1) * limit

    let where: any = {}
    let matchedSlugsOrder: string[] = []

    // OPTIMIZED SEARCH: Use MeiliSearch for fuzzy matching if query exists
    if (options?.query && options.query.length > 0) {
        try {
            const index = meili.index(INDEXES.OFFERS)
            // Search for distinct service slugs matching the query
            // We search for "providers" (documents) but we only care about the serviceSlug
            const searchResults = await index.search(options.query, {
                limit: 100, // Get top 100 matches
                attributesToRetrieve: ['serviceSlug'],
                showRankingScore: true
            })

            // Capture the ORDER of slugs (relevance)
            matchedSlugsOrder = [...new Set(searchResults.hits.map((h: any) => h.serviceSlug))]

            if (matchedSlugsOrder.length > 0) {
                console.log(`[SEARCH] Meili matched ${matchedSlugsOrder.length} services for "${options.query}"`)
                where = { serviceCode: { in: matchedSlugsOrder } }
            } else {
                // Determine if we should fallback or return empty
                // If fuzzy search found nothing, likely nothing exists. 
                // But let's fallback to DB ILIKE just in case Meili is out of sync.
                console.log(`[SEARCH] Meili found no matches, falling back to DB ILIKE`)
                where = {
                    OR: [
                        { serviceCode: { contains: options.query, mode: 'insensitive' as const } },
                        { serviceName: { contains: options.query, mode: 'insensitive' as const } }
                    ]
                }
            }
        } catch (e) {
            console.warn('[SEARCH] Meili search failed, using DB fallback:', e)
            where = {
                OR: [
                    { serviceCode: { contains: options.query, mode: 'insensitive' as const } },
                    { serviceName: { contains: options.query, mode: 'insensitive' as const } }
                ]
            }
        }
    }

    const orderBy = options?.sortBy === 'price'
        ? { lowestPrice: 'asc' as const }
        : options?.sortBy === 'stock'
            ? { totalStock: 'desc' as const }
            : { serviceName: 'asc' as const }

    // Important: We cannot simply use skip/take in SQL if we want Custom Order.
    // But since we are limiting to top 100 matches in search, we can fetch all 100 and sort in memory.
    // If no query, we use standard SQL pagination.

    let items, total;

    if (matchedSlugsOrder.length > 0) {
        // RELEVANCE SORTING PATH
        // 1. Fetch ALL matching items (up to our search limit)
        const dbItems = await prisma.serviceAggregate.findMany({
            where
        })

        // 2. Sort them in memory based on matchedSlugsOrder
        const orderMap = new Map(matchedSlugsOrder.map((slug, i) => [slug, i]))
        dbItems.sort((a, b) => {
            const indexA = orderMap.get(a.serviceCode) ?? 999
            const indexB = orderMap.get(b.serviceCode) ?? 999
            return indexA - indexB
        })

        // 3. Manual Pagination
        total = dbItems.length
        items = dbItems.slice(offset, offset + limit)

    } else {
        // STANDARD SQL PATH (Browsing or short query/Meili fallback)
        [items, total] = await Promise.all([
            prisma.serviceAggregate.findMany({
                where,
                orderBy,
                skip: offset,
                take: limit
            }),
            prisma.serviceAggregate.count({ where })
        ])
    }

    return { items, total, page, limit }
}
