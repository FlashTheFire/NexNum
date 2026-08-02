import { NextRequest, NextResponse } from "next/server";
import { getServiceAggregates } from "@/lib/search/service-aggregates";
import { calculatePrices } from "@/lib/pricing/pricing-utils";
import { checkSearchRateLimit } from "@/lib/api/search-rate-limit";
import { cacheGet, redis } from "@/lib/core/redis";
import { prisma } from "@/lib/core/db";
import { getCanonicalName, generateCanonicalCode } from "@/lib/normalizers/service-identity";
import { meili, INDEXES, resolveUniversalServiceFilter } from "@/lib/search/search";
import { getCountryFlagUrlSync } from "@/lib/normalizers/country-flags";
import { normalizeCountryName } from "@/lib/normalizers/country-normalizer";
import fs from 'fs';
import path from 'path';

// Local icon cache: populated once per process. Keyed by canonical service code.
// Avoids 24 fs.existsSync() calls per response (the previous bottleneck).
let _localIconCache: { webp: Map<string, string>; svg: Map<string, string> } | null = null;
let _localIconCacheBuiltAt = 0;
const LOCAL_ICON_TTL_MS = 60_000;

// Process-wide memory cache for precomputed service flag URLs (<0.01ms lookup)
const _localFlagCache = new Map<string, { flags: string[]; expiresAt: number }>();
const LOCAL_FLAG_TTL_MS = 600_000; // 10 minutes process memory cache
const REDIS_FLAG_TTL_SEC = 1800;    // 30 minutes Redis cache

function getLocalIconMaps() {
    const now = Date.now();
    if (_localIconCache && (now - _localIconCacheBuiltAt) < LOCAL_ICON_TTL_MS) {
        return _localIconCache;
    }
    const iconsDir = path.join(process.cwd(), 'public/assets/icons/services');
    const webp = new Map<string, string>();
    const svg = new Map<string, string>();
    try {
        if (fs.existsSync(iconsDir)) {
            for (const file of fs.readdirSync(iconsDir)) {
                const stem = file.replace(/\.(webp|svg)$/i, '');
                if (file.toLowerCase().endsWith('.webp')) webp.set(stem, `/assets/icons/services/${file}`);
                else if (file.toLowerCase().endsWith('.svg')) svg.set(stem, `/assets/icons/services/${file}`);
            }
        }
    } catch { /* directory missing in some envs */ }
    _localIconCache = { webp, svg };
    _localIconCacheBuiltAt = now;
    return _localIconCache;
}

/**
 * Batched icon resolver - replaces Promise.all(getServiceIconUrlByName * 24).
 * 1 fs readdir per minute + 1 Prisma findMany per request.
 * Returns a Map keyed by original service name for O(1) lookup.
 */
async function resolveServiceIconUrls(serviceNames: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (serviceNames.length === 0) return map;

    const codeToName = new Map<string, string>();
    for (const name of serviceNames) {
        if (!name) continue;
        const canonical = getCanonicalName(name);
        const code = generateCanonicalCode(canonical);
        codeToName.set(code, name);
    }

    const { webp, svg } = getLocalIconMaps();
    const resolvedCodes = new Set<string>();
    for (const [code, originalName] of codeToName) {
        if (webp.has(code)) { map.set(originalName, webp.get(code)!); resolvedCodes.add(code); }
        else if (svg.has(code)) { map.set(originalName, svg.get(code)!); resolvedCodes.add(code); }
    }

    const missingCodes = [...codeToName.keys()].filter(c => !resolvedCodes.has(c));
    if (missingCodes.length > 0) {
        try {
            const lookups = await prisma.serviceLookup.findMany({
                where: { serviceCode: { in: missingCodes } },
                select: { serviceCode: true, serviceIcon: true }
            });
            for (const row of lookups) {
                const originalName = codeToName.get(row.serviceCode);
                if (originalName && row.serviceIcon) map.set(originalName, row.serviceIcon);
            }
        } catch { /* fail open */ }
    }

    return map;
}

/**
 * Batched flag URL resolver (Ultra-Fast 2-Tier Caching Engine):
 * Tier 1: Process Memory (<0.01ms)
 * Tier 2: Redis Distributed Cache (<0.5ms)
 * Tier 3: MeiliSearch Multi-Search Calculation (on miss only, precomputed & cached for 30 min)
 */
async function resolveServiceFlagUrls(serviceNames: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (serviceNames.length === 0) return map;

    const now = Date.now();
    const missingInMem: string[] = [];

    // 1. Tier 1: Check Process Memory
    for (const name of serviceNames) {
        const cached = _localFlagCache.get(name);
        if (cached && cached.expiresAt > now) {
            map.set(name, cached.flags);
        } else {
            missingInMem.push(name);
        }
    }

    if (missingInMem.length === 0) return map;

    // 2. Tier 2: Check Redis MGET for services missing in memory
    const missingInRedis: string[] = [];
    try {
        const redisKeys = missingInMem.map(name => `cache:flag_urls:${name.toLowerCase().trim()}`);
        const redisVals = await redis.mget(...redisKeys);

        missingInMem.forEach((name, idx) => {
            const val = redisVals[idx];
            if (val) {
                try {
                    const parsedFlags: string[] = JSON.parse(val);
                    map.set(name, parsedFlags);
                    _localFlagCache.set(name, { flags: parsedFlags, expiresAt: now + LOCAL_FLAG_TTL_MS });
                } catch {
                    missingInRedis.push(name);
                }
            } else {
                missingInRedis.push(name);
            }
        });
    } catch {
        missingInRedis.push(...missingInMem);
    }

    if (missingInRedis.length === 0) return map;

    // 3. Tier 3: Compute via MeiliSearch multiSearch for uncached services ONLY
    try {
        const indexObj = meili.index(INDEXES.OFFERS);

        const queries = await Promise.all(missingInRedis.map(async (name) => {
            const serviceFilter = await resolveUniversalServiceFilter(indexObj, name);
            return {
                indexUid: INDEXES.OFFERS,
                q: '',
                filter: `${serviceFilter} AND isActive = true`,
                limit: 1000,
                attributesToRetrieve: ['countryName', 'providerCountryCode', 'pointPrice', 'stock']
            };
        }));

        const response = await meili.multiSearch({ queries });

        await Promise.all(response.results.map(async (res, index) => {
            const serviceName = missingInRedis[index];

            const countryMap = new Map<string, {
                displayName: string;
                minPrice: number;
                totalStock: number;
            }>();

            for (const hit of (res.hits || []) as any[]) {
                if (!hit.countryName) continue;
                const normalizedName = normalizeCountryName(hit.countryName).toLowerCase();
                if (!normalizedName) continue;

                const price = Number(hit.pointPrice || 0);
                const stock = Number(hit.stock || 0);

                let stats = countryMap.get(normalizedName);
                if (!stats) {
                    stats = {
                        displayName: hit.countryName,
                        minPrice: price,
                        totalStock: 0
                    };
                    countryMap.set(normalizedName, stats);
                }

                stats.minPrice = Math.min(stats.minPrice, price);
                stats.totalStock += stock;
            }

            // Step 2 Exact Relevance Sort Algorithm ("Smart Sort"):
            // Cheapest first if price difference > 1 point ($0.01), otherwise higher stock wins
            const sortedCountries = Array.from(countryMap.values()).map(g => ({
                name: g.displayName,
                lowestPrice: g.minPrice,
                totalStock: g.totalStock,
                flagUrl: getCountryFlagUrlSync(g.displayName) || ''
            })).filter(c => Boolean(c.flagUrl));

            sortedCountries.sort((a, b) => {
                const priceDiff = a.lowestPrice - b.lowestPrice;
                if (Math.abs(priceDiff) > 1) return priceDiff;
                return b.totalStock - a.totalStock;
            });

            // Extract top unique flag URLs
            const flagsSet = new Set<string>();
            for (const c of sortedCountries) {
                if (c.flagUrl) {
                    flagsSet.add(c.flagUrl);
                    if (flagsSet.size >= 4) break;
                }
            }

            const flagsList = Array.from(flagsSet);
            map.set(serviceName, flagsList);
            _localFlagCache.set(serviceName, { flags: flagsList, expiresAt: now + LOCAL_FLAG_TTL_MS });

            // Store in Redis with 30 minute TTL for multi-instance distributed fast lookup
            try {
                const rKey = `cache:flag_urls:${serviceName.toLowerCase().trim()}`;
                await redis.set(rKey, JSON.stringify(flagsList), 'EX', REDIS_FLAG_TTL_SEC);
            } catch { /* fail open */ }
        }));
    } catch {
        /* fail open */
    }

    return map;
}


function dicebearUrl(seed: string) {
    return `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0ea5e9,6366f1,8b5cf6,ec4899`;
}

/**
 * GET /api/search/services
 *
 * Returns services from the pre-computed Aggregate Table (backed by Redis/DB).
 * Performance hardening (v2):
 * - Per-user (60/min) + per-IP (30/min) sliding-window rate limit
 * - 60s Redis cache keyed per-user (so per-user favorite flags can be merged in)
 * - Batched icon resolution (1 fs readdir + 1 Prisma findMany instead of 24 lookups)
 * - Per-user favorite merge in the same response (no second round-trip from frontend)
 */
export async function GET(req: NextRequest) {
    const rl = await checkSearchRateLimit(req);
    if (!rl.success) return rl.response!;

    try {
        const { searchParams } = new URL(req.url);
        const q = searchParams.get("q") || "";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "50");
        const sort = searchParams.get("sort") || "relevance";

        // Map frontend sort values to internal sort options
        // Frontend: relevance, price_asc, price_desc, stock
        // Internal: 'stock' | 'pointPrice' | 'pointPriceDesc' | 'name'
        let mappedSort: 'stock' | 'pointPrice' | 'pointPriceDesc' | 'name';

        switch (sort) {
            case 'price_asc':
            case 'pointPrice':
                mappedSort = 'pointPrice';
                break;
            case 'price_desc':
                mappedSort = 'pointPriceDesc';
                break;
            case 'stock':
            case 'relevance': // Relevance = popularity = stock desc
            default:
                mappedSort = 'stock';
                break;
        }

        // v4 prefix: country dedup key is now lowercased; v3 keys may have
        // already been cached as un-deduped (e.g. India + india both present)
        const cacheKey = `cache:search:services:v4:${rl.userId || rl.ip}:${q}:${page}:${limit}:${mappedSort}`;

        const result = await cacheGet<{ items: any[]; total: number; page: number; limit: number; hasMore: boolean }>(
            cacheKey,
            async () => {
                const r = await getServiceAggregates({
                    query: q,
                    page,
                    limit,
                    sortBy: mappedSort
                });
                // Pre-compute prices inside the cache so cached entries are complete.
                // This means we never return a Promise (which JSON.stringify turns into {})
                // and the hot read path never re-runs currency conversion.
                const items = await Promise.all((r.items || []).map(async (item: any) => ({
                    ...item,
                    currencyPrices: await calculatePrices(Number(item.lowestPrice)),
                })));
                return {
                    items,
                    total: r.total,
                    page: r.page,
                    limit: r.limit,
                    hasMore: r.page * r.limit < r.total
                };
            },
            60
        );

        // 1. BATCHED icon and flag URL resolve
        const serviceNames = (result.items as any[]).map(i => i.serviceName).filter(Boolean);
        const [iconMap, flagMap] = await Promise.all([
            resolveServiceIconUrls(serviceNames),
            resolveServiceFlagUrls(serviceNames)
        ]);

        // 2. Per-user favorite merge (1 extra query when authenticated, 0 when anon)
        let favoriteMap = new Map<string, string>();
        if (rl.userId) {
            try {
                const favs = await prisma.userFavorite.findMany({
                    where: {
                        userId: rl.userId,
                        type: 'SERVICE',
                        value: { in: serviceNames.map(n => n.toLowerCase()) }
                    },
                    select: { id: true, value: true }
                });
                favoriteMap = new Map(favs.map(f => [f.value, f.id]));
            } catch { /* fail open */ }
        }

        // 3. Enrich with icons + prices + favorite flags
        const enrichedItems = (result.items as any[]).map((item) => {
            const iconUrl = iconMap.get(item.serviceName) || dicebearUrl(item.serviceName);
            const value = (item.serviceName || '').toLowerCase();
            return {
                slug: item.serviceCode,
                name: item.serviceName,
                lowestPrice: Number(item.lowestPrice),
                totalStock: Number(item.totalStock),
                serverCount: item.providerCount || 0,
                countryCount: item.countryCount || 0,
                iconUrl,
                // currencyPrices was pre-computed inside the cache callback (line above)
                // to avoid storing a Promise (which JSON.stringify turns into {}).
                currencyPrices: item.currencyPrices || {},
                flagUrls: flagMap.get(item.serviceName) || [],
                isFavorite: favoriteMap.has(value),
                favoriteId: favoriteMap.get(value) || null,
            };
        });

        return NextResponse.json({
            items: enrichedItems,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                hasMore: result.hasMore
            }
        });
    } catch (error) {
        console.error("Failed to search services:", error);
        return NextResponse.json(
            { items: [], pagination: { total: 0, page: 1, hasMore: false } },
            { status: 500 }
        );
    }
}
