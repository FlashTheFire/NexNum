import { prisma } from '@/lib/core/db'
import { meili, INDEXES } from './search'
import { logger } from '@/lib/core/logger'
import { cacheSet, cacheGet, CACHE_KEYS } from '@/lib/core/redis'

interface ServiceAggregateData {
    serviceCode: string
    serviceName: string
    lowestPrice: number
    totalStock: bigint
    countryCount: number
    providerCount: number
}

/**
 * Recalculate all service aggregates from MeiliSearch (Source of Truth)
 * Run after a full sync or periodically.
 * 
 * Scalability: Uses chunked retrieval to prevent OOM on large indices.
 */
export async function refreshAllServiceAggregates() {
    const startTime = Date.now();
    logger.info('[AGGREGATES] Starting batch refresh from MeiliSearch...');

    try {
        const index = meili.index(INDEXES.OFFERS)
        const aggregates = new Map<string, {
            serviceCode: string;
            serviceName: string;
            lowestPrice: number;
            totalStock: bigint;
            _countries: Set<string>;
            _providers: Set<string>;
        }>()

        // 1. Chunked Retrieval (5000 docs per page)
        let offset = 0;
        const limit = 5000;
        let hasMore = true;

        while (hasMore) {
            const result = await index.search('', {
                offset,
                limit,
                attributesToRetrieve: ['providerServiceCode', 'serviceName', 'price', 'stock', 'countryName', 'provider']
            })

            if (result.hits.length === 0) {
                hasMore = false;
                break;
            }

            for (const hit of result.hits as any[]) {
                const serviceCode = hit.providerServiceCode || 'unknown';

                let agg = aggregates.get(serviceCode)
                if (!agg) {
                    agg = {
                        serviceCode,
                        serviceName: hit.serviceName || serviceCode,
                        lowestPrice: hit.price,
                        totalStock: BigInt(0),
                        _countries: new Set(),
                        _providers: new Set()
                    }
                    aggregates.set(serviceCode, agg)
                }

                agg.lowestPrice = Math.min(agg.lowestPrice, hit.price)
                agg.totalStock += BigInt(hit.stock || 0)
                if (hit.countryName) agg._countries.add(hit.countryName)
                if (hit.provider) agg._providers.add(hit.provider)
            }

            offset += limit;
            if (offset >= result.estimatedTotalHits || result.hits.length < limit) {
                hasMore = false;
            }
        }

        if (aggregates.size === 0) {
            logger.warn('[AGGREGATES] No documents found in MeiliSearch. Clearing aggregates.');
            await prisma.serviceAggregate.deleteMany({})
            return 0
        }

        // 2. High-Speed Persistence (Batch Upserts)
        const finalStats = Array.from(aggregates.values());
        logger.info(`[AGGREGATES] Computed ${finalStats.length} aggregates. Syncing to DB...`);

        // We use a transaction of upserts grouped in smaller batches (Prisma overhead)
        const BATCH_SIZE = 100;
        for (let i = 0; i < finalStats.length; i += BATCH_SIZE) {
            const chunk = finalStats.slice(i, i + BATCH_SIZE);
            const operations = chunk.map(stat =>
                prisma.serviceAggregate.upsert({
                    where: { serviceCode: stat.serviceCode },
                    create: {
                        serviceCode: stat.serviceCode,
                        serviceName: stat.serviceName,
                        lowestPrice: stat.lowestPrice,
                        totalStock: stat.totalStock,
                        countryCount: stat._countries.size,
                        providerCount: stat._providers.size,
                    },
                    update: {
                        serviceName: stat.serviceName,
                        lowestPrice: stat.lowestPrice,
                        totalStock: stat.totalStock,
                        countryCount: stat._countries.size,
                        providerCount: stat._providers.size,
                        lastUpdatedAt: new Date()
                    }
                })
            );
            await prisma.$transaction(operations);
        }

        // 3. Cleanup Stale Aggregates
        const activeServiceCodes = finalStats.map(s => s.serviceCode);
        await prisma.serviceAggregate.deleteMany({
            where: { serviceCode: { notIn: activeServiceCodes } }
        });

        // 4. Invalidate Redis Cache
        await cacheSet(CACHE_KEYS.SERVICE_LIST_DEFAULT, null);

        const duration = (Date.now() - startTime) / 1000;
        logger.info(`[AGGREGATES] Refresh complete in ${duration}s. Synchronized ${finalStats.length} records.`);

        return finalStats.length

    } catch (error) {
        logger.error('[AGGREGATES] Refresh failed critical:', error)
        return 0
    }
}

/**
 * Get service aggregates for the main list view
 * Hybrid Approach: 
 * 1. If no query: Use Redis cache for sub-5ms responses.
 * 2. If query present: Use MeiliSearch for typo-tolerance + DB for aggregates.
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
    const isDefaultList = !options?.query && page === 1 && limit === 50 && (!options?.sortBy || options.sortBy === 'name');

    // 1. FAST PATH: Redis Cache for Default Page
    if (isDefaultList) {
        const cached = await cacheGet<{ items: any[], total: number }>(CACHE_KEYS.SERVICE_LIST_DEFAULT, async () => {
            const [dbItems, count] = await Promise.all([
                prisma.serviceAggregate.findMany({
                    orderBy: { serviceName: 'asc' },
                    take: limit
                }),
                prisma.serviceAggregate.count()
            ]);

            return {
                items: dbItems.map(i => ({ ...i, totalStock: Number(i.totalStock) })),
                total: count
            }
        }, 600); // 10 minute cache for default list

        return { ...cached, page, limit };
    }

    let where: any = {}
    let matchedSlugsOrder: string[] = []

    // 2. SEARCH PATH: MeiliSearch + DB
    if (options?.query && options.query.length > 0) {
        try {
            const index = meili.index(INDEXES.OFFERS)
            const searchResults = await index.search(options.query, {
                limit: 100,
                attributesToRetrieve: ['providerServiceCode'],
            })

            matchedSlugsOrder = [...new Set(searchResults.hits.map((h: any) => h.providerServiceCode).filter(Boolean))]

            if (matchedSlugsOrder.length > 0) {
                where = { serviceCode: { in: matchedSlugsOrder } }
            } else {
                where = {
                    OR: [
                        { serviceCode: { contains: options.query, mode: 'insensitive' } },
                        { serviceName: { contains: options.query, mode: 'insensitive' } }
                    ]
                }
            }
        } catch (e) {
            logger.warn('[SEARCH] Meili search failed, using DB fallback:', e)
            where = {
                OR: [
                    { serviceCode: { contains: options.query, mode: 'insensitive' } },
                    { serviceName: { contains: options.query, mode: 'insensitive' } }
                ]
            }
        }
    }

    const orderBy = options?.sortBy === 'price'
        ? { lowestPrice: 'asc' as const }
        : options?.sortBy === 'stock'
            ? { totalStock: 'desc' as const }
            : { serviceName: 'asc' as const }

    let items, total;

    if (matchedSlugsOrder.length > 0) {
        const dbItems = await prisma.serviceAggregate.findMany({ where })

        const orderMap = new Map(matchedSlugsOrder.map((slug, i) => [slug, i]))
        dbItems.sort((a, b) => {
            const indexA = orderMap.get(a.serviceCode) ?? 999
            const indexB = orderMap.get(b.serviceCode) ?? 999
            return indexA - indexB
        })

        total = dbItems.length
        items = dbItems.slice(offset, offset + limit).map(i => ({ ...i, totalStock: Number(i.totalStock) }))
    } else {
        const [dbItems, count] = await Promise.all([
            prisma.serviceAggregate.findMany({
                where,
                orderBy,
                skip: offset,
                take: limit
            }),
            prisma.serviceAggregate.count({ where })
        ])
        items = dbItems.map(i => ({ ...i, totalStock: Number(i.totalStock) }))
        total = count
    }

    return { items, total, page, limit }
}
