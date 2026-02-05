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
    logger.box('MeiliSearch Aggregate Refresh');

    try {
        // 0. MeiliSearch Consistency Drain (Race Condition Prevention)
        // Wait for ALL pending tasks in MeiliSearch to ensure we have a consistent view.
        // This addresses the "Sync Race Condition Protection" by ensuring deletes/indexes are processed.
        logger.info('[AGGREGATES] Draining MeiliSearch task queue for consistency...');
        const tasks = await meili.tasks.getTasks({ statuses: ['enqueued', 'processing'] as any });
        if (tasks.results.length > 0) {
            const taskIds = tasks.results.map((t: any) => t.taskUid);
            const { waitForTasks } = await import('./search');
            await waitForTasks(taskIds);
            logger.debug(`Drained ${taskIds.length} pending MeiliSearch tasks.`, { context: 'AGGREGATES' });
        }

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
                attributesToRetrieve: ['providerServiceCode', 'serviceName', 'pointPrice', 'stock', 'countryName', 'provider']
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
                        lowestPrice: hit.pointPrice,
                        totalStock: BigInt(0),
                        _countries: new Set(),
                        _providers: new Set()
                    }
                    aggregates.set(serviceCode, agg)
                }

                agg.lowestPrice = Math.min(agg.lowestPrice, hit.pointPrice)
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
            // SAFETY: Before wiping aggregates, check if we actually have active providers.
            // If MeiliSearch is empty but we have providers, it's likely a sync race condition.
            const activeProviderCount = await prisma.provider.count({ where: { isActive: true } });

            if (activeProviderCount > 0) {
                logger.warn('MeiliSearch returned 0 documents, but active providers were found. Skipping cleanup (Sync Race Condition Protection).', { context: 'AGGREGATES' });
                return 0;
            }

            logger.warn('No documents found in MeiliSearch and no active providers. Clearing aggregates.', { context: 'AGGREGATES' });
            await prisma.serviceAggregate.deleteMany({})
            return 0
        }

        // 2. High-Speed Persistence (Optimized Batch Upserts)
        const finalStats = Array.from(aggregates.values());
        logger.info(`Computed ${finalStats.length} aggregates. Syncing to DB...`, { context: 'AGGREGATES' });

        // Senior-Level Optimization: Use larger batches and explicit transaction management
        // We increase the timeout to 30 seconds for production safety.
        const BATCH_SIZE = 100;

        for (let i = 0; i < finalStats.length; i += BATCH_SIZE) {
            const chunk = finalStats.slice(i, i + BATCH_SIZE);

            try {
                // Interactive transaction allows setting a custom timeout
                await prisma.$transaction(async (tx) => {
                    await Promise.all(
                        chunk.map(stat =>
                            tx.serviceAggregate.upsert({
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
                        )
                    );
                }, {
                    timeout: 30000, // 30 Seconds for production data volume
                    isolationLevel: 'ReadCommitted'
                });

                if (i % 500 === 0 && i > 0) {
                    logger.debug(`[AGGREGATES] Progress: Synchronized ${i} / ${finalStats.length} records...`);
                }
            } catch (batchError) {
                logger.error(`[AGGREGATES] Batch starting at ${i} failed:`, { error: batchError });
                // We continue with other batches instead of failing the whole refresh
            }
        }

        // 3. Cleanup Stale Aggregates
        const activeServiceCodes = finalStats.map(s => s.serviceCode);
        await prisma.serviceAggregate.deleteMany({
            where: { serviceCode: { notIn: activeServiceCodes } }
        });

        // 4. Invalidate Redis Cache
        await cacheSet(CACHE_KEYS.SERVICE_LIST_DEFAULT, null);

        const duration = Date.now() - startTime;
        logger.success(`Batch refresh complete. ${finalStats.length} services updated in ${duration}ms`, { context: 'AGGREGATES', durationMs: duration });
        return finalStats.length;

    } catch (error) {
        logger.error('Refresh failed critical', { context: 'AGGREGATES', error })
        return 0
    }
}

/**
 * Fallback: Compute aggregates directly from MeiliSearch when DB table is empty.
 * This is slower but ensures the search always works.
 */
async function getAggregatesFromMeiliSearch(
    query: string,
    page: number,
    limit: number,
    sortBy?: 'name' | 'pointPrice' | 'pointPriceDesc' | 'stock'
) {
    const index = meili.index(INDEXES.OFFERS)

    // Search with query or get all
    const searchResults = await index.search(query || '', {
        limit: 5000, // Get enough to aggregate
        attributesToRetrieve: ['providerServiceCode', 'serviceName', 'pointPrice', 'stock', 'countryName', 'provider']
    })

    // Aggregate by service code
    const aggregates = new Map<string, {
        serviceCode: string;
        serviceName: string;
        lowestPrice: number;
        totalStock: number;
        countryCount: number;
        providerCount: number;
        _countries: Set<string>;
        _providers: Set<string>;
    }>()

    for (const hit of searchResults.hits as any[]) {
        const serviceCode = hit.providerServiceCode || 'unknown';

        let agg = aggregates.get(serviceCode)
        if (!agg) {
            agg = {
                serviceCode,
                serviceName: hit.serviceName || serviceCode,
                lowestPrice: hit.pointPrice,
                totalStock: 0,
                countryCount: 0,
                providerCount: 0,
                _countries: new Set(),
                _providers: new Set()
            }
            aggregates.set(serviceCode, agg)
        }

        agg.lowestPrice = Math.min(agg.lowestPrice, hit.pointPrice)
        agg.totalStock += hit.stock || 0
        if (hit.countryName) agg._countries.add(hit.countryName)
        if (hit.provider) agg._providers.add(hit.provider)
    }

    // Convert to array and add counts
    let items = Array.from(aggregates.values()).map(agg => ({
        serviceCode: agg.serviceCode,
        serviceName: agg.serviceName,
        lowestPrice: agg.lowestPrice,
        totalStock: agg.totalStock,
        countryCount: agg._countries.size,
        providerCount: agg._providers.size
    }))

    // Sort based on sortBy option
    switch (sortBy) {
        case 'pointPrice':
            items.sort((a, b) => a.lowestPrice - b.lowestPrice); // Price ascending
            break;
        case 'pointPriceDesc':
            items.sort((a, b) => b.lowestPrice - a.lowestPrice); // Price descending
            break;
        case 'stock':
        default:
            items.sort((a, b) => b.totalStock - a.totalStock); // Stock/popularity descending
            break;
    }

    const total = items.length
    const offset = (page - 1) * limit
    items = items.slice(offset, offset + limit)

    return { items, total, page, limit }
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
    sortBy?: 'name' | 'pointPrice' | 'pointPriceDesc' | 'stock'
}) {
    const limit = options?.limit || 50
    const page = options?.page || 1
    const offset = (page - 1) * limit
    const isDefaultList = !options?.query && page === 1 && limit === 50 && (!options?.sortBy || options.sortBy === 'name');

    // FALLBACK CHECK: If ServiceAggregate table is empty, use direct MeiliSearch
    const dbCount = await prisma.serviceAggregate.count();
    if (dbCount === 0) {
        logger.warn('[SEARCH] ServiceAggregate table is empty. Using MeiliSearch fallback...');
        return await getAggregatesFromMeiliSearch(options?.query || '', page, limit, options?.sortBy);
    }

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
            logger.warn('[SEARCH] Meili search failed, using DB fallback:', { error: e })
            where = {
                OR: [
                    { serviceCode: { contains: options.query, mode: 'insensitive' } },
                    { serviceName: { contains: options.query, mode: 'insensitive' } }
                ]
            }
        }
    }

    // Build orderBy based on sortBy option
    let orderBy: { lowestPrice?: 'asc' | 'desc'; totalStock?: 'desc'; serviceName?: 'asc' };
    switch (options?.sortBy) {
        case 'pointPrice':
            orderBy = { lowestPrice: 'asc' };
            break;
        case 'pointPriceDesc':
            orderBy = { lowestPrice: 'desc' };
            break;
        case 'stock':
        default:
            orderBy = { totalStock: 'desc' };
            break;
    }

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
