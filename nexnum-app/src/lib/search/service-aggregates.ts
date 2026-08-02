import { prisma } from '@/lib/core/db'
import { meili, INDEXES } from './search'
import { logger } from '@/lib/core/logger'
import { cacheSet, cacheGet, CACHE_KEYS, redis } from '@/lib/core/redis'
import { withHeartbeat } from '@/lib/workers/with-heartbeat'
import { getCountryFlagUrlSync } from '@/lib/normalizers/country-flags'
import { normalizeCountryName } from '@/lib/normalizers/country-normalizer'

interface ServiceAggregateData {
    serviceCode: string
    serviceName: string
    lowestPrice: number
    totalStock: bigint
    countryCount: number
    providerCount: number
    flagUrls: string[]
}

/**
 * Recalculate all service aggregates from MeiliSearch (Source of Truth)
 * Run after a full sync or periodically.
 * 
 * Scalability: Uses chunked retrieval to prevent OOM on large indices.
 */
export async function refreshAllServiceAggregatesImpl() {
    const startTime = Date.now();
    logger.box('MeiliSearch Aggregate Refresh');

    try {
        // 0. MeiliSearch Consistency Drain (Race Condition Prevention)
        logger.info('[AGGREGATES] Draining MeiliSearch task queue for consistency...');
        const tasks = await meili.tasks.getTasks({ statuses: ['enqueued', 'processing'] as any });
        if (tasks.results && tasks.results.length > 0) {
            const taskIds = tasks.results.map((t: any) => t.uid ?? t.taskUid).filter((id: any) => typeof id === 'number');
            if (taskIds.length > 0) {
                const { waitForTasks } = await import('./search');
                await waitForTasks(taskIds);
                logger.debug(`Drained ${taskIds.length} pending MeiliSearch tasks.`, { context: 'AGGREGATES' });
            }
        }

        const index = meili.index(INDEXES.OFFERS)
        const aggregates = new Map<string, {
            serviceCode: string;
            serviceName: string;
            lowestPrice: number;
            totalStock: bigint;
            _countries: Set<string>;
            _providers: Set<string>;
            _countryStats: Map<string, { displayName: string; minPrice: number; totalStock: number }>;
            flagUrls: string[];
        }>()

        const activeProviders = await prisma.provider.findMany({ where: { isActive: true }, select: { name: true } })
        const activeProviderNames = new Set(activeProviders.map(p => p.name.toLowerCase()))

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
                const providerName = typeof hit.provider === 'string' ? hit.provider.toLowerCase() : ''
                if (!activeProviderNames.has(providerName)) continue;
                const rawCode = hit.providerServiceCode || 'unknown';
                const displayName = (hit.serviceName || rawCode).trim();
                const dedupKey = displayName.toLowerCase();

                let agg = aggregates.get(dedupKey)
                if (!agg) {
                    agg = {
                        serviceCode: dedupKey,
                        serviceName: displayName,
                        lowestPrice: hit.pointPrice,
                        totalStock: BigInt(0),
                        _countries: new Set(),
                        _providers: new Set(),
                        _countryStats: new Map(),
                        flagUrls: []
                    }
                    aggregates.set(dedupKey, agg)
                }

                if (displayName.length > agg.serviceName.length) {
                    agg.serviceName = displayName;
                }

                agg.lowestPrice = Math.min(agg.lowestPrice, hit.pointPrice)
                agg.totalStock += BigInt(hit.stock || 0)
                if (hit.countryName) {
                    agg._countries.add(hit.countryName);
                    const normName = normalizeCountryName(hit.countryName).toLowerCase();
                    if (normName) {
                        let cStat = agg._countryStats.get(normName);
                        if (!cStat) {
                            cStat = { displayName: hit.countryName, minPrice: hit.pointPrice, totalStock: hit.stock || 0 };
                            agg._countryStats.set(normName, cStat);
                        } else {
                            cStat.minPrice = Math.min(cStat.minPrice, hit.pointPrice);
                            cStat.totalStock += hit.stock || 0;
                        }
                    }
                }
                if (hit.provider) agg._providers.add(hit.provider)
            }

            offset += limit;
            if (offset >= result.estimatedTotalHits || result.hits.length < limit) {
                hasMore = false;
            }
        }

        if (aggregates.size === 0) {
            const activeProviderCount = await prisma.provider.count({ where: { isActive: true } });
            if (activeProviderCount > 0) {
                logger.warn('MeiliSearch returned 0 documents, but active providers were found. Skipping cleanup (Sync Race Condition Protection).', { context: 'AGGREGATES' });
                return 0;
            }

            logger.info('No documents found in MeiliSearch and no active providers. Clearing aggregates.', { context: 'AGGREGATES' })
            await prisma.serviceAggregate.deleteMany({})
            return 0
        }

        // Compute precalculated flag URLs for each service using Step 2 Smart Sort
        for (const agg of aggregates.values()) {
            const sorted = Array.from(agg._countryStats.values())
                .map(c => ({ ...c, flagUrl: getCountryFlagUrlSync(c.displayName) || '' }))
                .filter(c => Boolean(c.flagUrl));

            sorted.sort((a, b) => {
                const priceDiff = a.minPrice - b.minPrice;
                if (Math.abs(priceDiff) > 1) return priceDiff;
                return b.totalStock - a.totalStock;
            });

            const flagsSet = new Set<string>();
            for (const c of sorted) {
                flagsSet.add(c.flagUrl);
                if (flagsSet.size >= 4) break;
            }
            agg.flagUrls = Array.from(flagsSet);
        }

        // 2. High-Speed Persistence (Optimized Batch Upserts)
        const finalStats = Array.from(aggregates.values());
        logger.info(`Computed ${finalStats.length} aggregates with precomputed flagUrls. Syncing to DB...`, { context: 'AGGREGATES' });

        const BATCH_SIZE = 500;

        for (let i = 0; i < finalStats.length; i += BATCH_SIZE) {
            const chunk = finalStats.slice(i, i + BATCH_SIZE);
            const nowIso = new Date().toISOString();

            try {
                const ids = chunk.map(() => crypto.randomUUID());
                const codes = chunk.map(s => s.serviceCode);
                const names = chunk.map(s => s.serviceName);
                const prices = chunk.map(s => s.lowestPrice.toString());
                const stocks = chunk.map(s => s.totalStock.toString());
                const countryCounts = chunk.map(s => s._countries.size);
                const providerCounts = chunk.map(s => s._providers.size);
                const flagUrlsNested = chunk.map(s => s.flagUrls);
                const updatedAts = chunk.map(() => nowIso);

                await prisma.$executeRaw`
                    INSERT INTO "service_aggregates" (
                        "id",
                        "service_code",
                        "service_name",
                        "lowest_price",
                        "total_stock",
                        "country_count",
                        "provider_count",
                        "flag_urls",
                        "last_updated_at"
                    )
                    SELECT
                        src."id",
                        src."service_code",
                        src."service_name",
                        src."lowest_price"::numeric(8,2),
                        src."total_stock"::bigint,
                        src."country_count",
                        src."provider_count",
                        src."flag_urls"::text[],
                        src."last_updated_at"::timestamptz
                    FROM unnest(
                        ${ids}::text[],
                        ${codes}::text[],
                        ${names}::text[],
                        ${prices}::text[],
                        ${stocks}::text[],
                        ${countryCounts}::int[],
                        ${providerCounts}::int[],
                        ${flagUrlsNested}::text[][],
                        ${updatedAts}::text[]
                    ) AS src(
                        "id",
                        "service_code",
                        "service_name",
                        "lowest_price",
                        "total_stock",
                        "country_count",
                        "provider_count",
                        "flag_urls",
                        "last_updated_at"
                    )
                    ON CONFLICT ("service_code") DO UPDATE SET
                        "service_name"    = EXCLUDED."service_name",
                        "lowest_price"    = EXCLUDED."lowest_price",
                        "total_stock"     = EXCLUDED."total_stock",
                        "country_count"   = EXCLUDED."country_count",
                        "provider_count"  = EXCLUDED."provider_count",
                        "flag_urls"       = EXCLUDED."flag_urls",
                        "last_updated_at" = EXCLUDED."last_updated_at"
                `;

                // Warm up Redis for flagUrls AND Step 2 Country Search per service
                const { generateCanonicalCode } = await import('@/lib/normalizers/service-identity');
                for (const s of chunk) {

                    try {
                        const rKey = `cache:flag_urls:${s.serviceCode}`;
                        await redis.set(rKey, JSON.stringify(s.flagUrls), 'EX', 1800);

                        // Pre-warm Step 2 Country Search Redis Cache
                        const sortedCountries = Array.from(s._countryStats.values())
                            .map(c => ({
                                code: generateCanonicalCode(c.displayName),
                                name: c.displayName,
                                flagUrl: getCountryFlagUrlSync(c.displayName) || '',
                                lowestPrice: c.minPrice,
                                totalStock: c.totalStock,
                                serverCount: 1
                            }))
                            .sort((a, b) => {
                                const priceDiff = a.lowestPrice - b.lowestPrice;
                                if (Math.abs(priceDiff) > 1) return priceDiff;
                                return b.totalStock - a.totalStock;
                            });

                        const step2Key = `cache:search:countries:v3:${s.serviceCode}::1:50:name`;
                        await redis.set(step2Key, JSON.stringify({ countries: sortedCountries.slice(0, 50), total: sortedCountries.length }), 'EX', 1800);
                    } catch { /* fail open */ }
                }


                if (i % 1000 === 0 && i > 0) {
                    logger.debug(`[AGGREGATES] Progress: Synchronized ${i} / ${finalStats.length} records...`);
                }
            } catch (batchError) {
                logger.error(`[AGGREGATES] Batch starting at ${i} failed:`, { error: batchError });
            }
        }

        // 3. Cleanup Stale Aggregates
        const activeServiceCodes = finalStats.map(s => s.serviceCode);
        await prisma.serviceAggregate.deleteMany({
            where: { serviceCode: { notIn: activeServiceCodes } }
        });


        // 4. Invalidate and Pre-Bake Default Search Responses in Redis for Instant Cold-Starts (<0.1ms)
        await cacheSet(CACHE_KEYS.SERVICE_LIST_DEFAULT, null);

        try {
            const { resolveServiceIconUrls, dicebearUrl } = await import('./icon-resolver');
            const { calculatePrices } = await import('@/lib/pricing/pricing-utils');

            const defaultLimits = [24, 50, 100];
            const defaultSorts: ('stock' | 'pointPrice' | 'pointPriceDesc' | 'name')[] = ['stock', 'pointPrice', 'pointPriceDesc', 'name'];

            for (const limit of defaultLimits) {
                for (const mappedSort of defaultSorts) {
                    const cacheKey = `cache:search:services:global:v6::1:${limit}:${mappedSort}`;

                    let sorted = [...finalStats];
                    if (mappedSort === 'pointPrice') sorted.sort((a, b) => a.lowestPrice - b.lowestPrice);
                    else if (mappedSort === 'pointPriceDesc') sorted.sort((a, b) => b.lowestPrice - a.lowestPrice);
                    else sorted.sort((a, b) => Number(b.totalStock - a.totalStock));

                    const sliced = sorted.slice(0, limit);
                    const serviceNames = sliced.map(s => s.serviceName);
                    const iconMap = await resolveServiceIconUrls(serviceNames);

                    const items = await Promise.all(sliced.map(async (item) => {
                        const iconUrl = iconMap.get(item.serviceName) || dicebearUrl(item.serviceName);
                        const currencyPrices = await calculatePrices(Number(item.lowestPrice));
                        return {
                            slug: item.serviceCode,
                            name: item.serviceName,
                            lowestPrice: Number(item.lowestPrice),
                            totalStock: Number(item.totalStock),
                            serverCount: item._providers ? item._providers.size : 0,
                            countryCount: item._countries ? item._countries.size : 0,

                            iconUrl,
                            currencyPrices,
                            flagUrls: item.flagUrls || [],
                        };
                    }));

                    const payload = {
                        items,
                        total: finalStats.length,
                        page: 1,
                        limit,
                        hasMore: limit < finalStats.length
                    };

                    await redis.set(cacheKey, JSON.stringify(payload), 'EX', 1800);
                }
            }
            logger.info('[AGGREGATES] Pre-baked default service search pages into Redis cache.', { context: 'AGGREGATES' });
        } catch (prebakeError) {
            logger.warn('[AGGREGATES] Pre-baking default service search responses failed:', { error: prebakeError });
        }

        const duration = Date.now() - startTime;
        logger.success(`Batch refresh complete. ${finalStats.length} services updated in ${duration}ms`, { context: 'AGGREGATES', durationMs: duration });

        return finalStats.length;

    } catch (error) {
        logger.error('Refresh failed critical', { context: 'AGGREGATES', error })
        return 0
    }
}

/**
 * Public entry point with zombie-detection heartbeat wrapping.
 */
export const refreshAllServiceAggregates = withHeartbeat(
    'search_aggregates',
    refreshAllServiceAggregatesImpl
)

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
        const rawCode = hit.providerServiceCode || 'unknown';
        // DEDUP: same canonical key logic as refreshAllServiceAggregates — collapse
        // multiple raw codes (e.g. "am" + "amazon") that all represent the same
        // logical service into ONE aggregate row.
        const displayName = (hit.serviceName || rawCode).trim();
        const dedupKey = displayName.toLowerCase();

        let agg = aggregates.get(dedupKey)
        if (!agg) {
            agg = {
                serviceCode: dedupKey,
                serviceName: displayName,
                lowestPrice: hit.pointPrice,
                totalStock: 0,
                countryCount: 0,
                providerCount: 0,
                _countries: new Set(),
                _providers: new Set()
            }
            aggregates.set(dedupKey, agg)
        }

        if (displayName.length > agg.serviceName.length) {
            agg.serviceName = displayName;
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
    const isUnlimited = options?.limit === 0 || (options?.limit !== undefined && options.limit >= 10000);
    const limit = isUnlimited ? 0 : (options?.limit || 50);
    const page = options?.page || 1;
    const offset = isUnlimited ? 0 : (page - 1) * limit;
    const isDefaultList = !isUnlimited && !options?.query && page === 1 && limit === 50 && (!options?.sortBy || options.sortBy === 'name');

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

        return { 
            items: cached?.items || [], 
            total: cached?.total || 0, 
            page, 
            limit 
        };
    }

    let where: any = {}
    let matchedSlugsOrder: string[] = []

    // 2. SEARCH PATH: MeiliSearch + DB
    if (options?.query && options.query.length > 0) {
        try {
            const index = meili.index(INDEXES.OFFERS)
            const searchResults = await index.search(options.query, {
                limit: 200,
                attributesToRetrieve: ['providerServiceCode', 'serviceName'],
            })

            const matchedCodes = new Set<string>()
            const matchedNames = new Set<string>()

            for (const hit of (searchResults.hits || []) as any[]) {
                if (hit.providerServiceCode) matchedCodes.add(hit.providerServiceCode.toLowerCase().trim())
                if (hit.serviceName) {
                    const cleanedName = hit.serviceName.toLowerCase().trim()
                    matchedNames.add(cleanedName)
                    matchedCodes.add(cleanedName)
                }
            }

            const codeList = Array.from(matchedCodes)
            const nameList = Array.from(matchedNames)

            where = {
                OR: [
                    { serviceCode: { in: codeList } },
                    { serviceName: { in: nameList } },
                    { serviceName: { contains: options.query, mode: 'insensitive' } },
                    { serviceCode: { contains: options.query, mode: 'insensitive' } }
                ]
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

    const [dbItems, count] = await Promise.all([
        prisma.serviceAggregate.findMany({
            where,
            orderBy,
            skip: offset,
            take: isUnlimited ? undefined : limit
        }),
        prisma.serviceAggregate.count({ where })
    ])
    const items = dbItems.map(i => ({ ...i, totalStock: Number(i.totalStock) }))
    const total = count

    return { items, total, page, limit: isUnlimited ? total : limit }
}
