import { NextRequest, NextResponse } from "next/server";
import { getServiceAggregates } from "@/lib/search/service-aggregates";
import { calculatePrices } from "@/lib/pricing/pricing-utils";
import { checkSearchRateLimit } from "@/lib/api/search-rate-limit";
import { cacheGet } from "@/lib/core/redis";
import { prisma } from "@/lib/core/db";
import { getCanonicalName, generateCanonicalCode } from "@/lib/normalizers/service-identity";
import fs from 'fs';
import path from 'path';

// Local icon cache: populated once per process. Keyed by canonical service code.
// Avoids 24 fs.existsSync() calls per response (the previous bottleneck).
let _localIconCache: { webp: Map<string, string>; svg: Map<string, string> } | null = null;
let _localIconCacheBuiltAt = 0;
const LOCAL_ICON_TTL_MS = 60_000;

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

        // 60s Redis cache; key is per-user so the per-user favorite merge is correct.
        // Anonymous users are partitioned by IP.
        // v3 prefix: the v2 cache was populated with currencyPrices as a Promise (JSON
        // serialized to {}), which is why "from --" was showing on cards. Bumping
        // the prefix flushes all stale v2 entries without manual Redis surgery.
        const cacheKey = `cache:search:services:v3:${rl.userId || rl.ip}:${q}:${page}:${limit}:${mappedSort}`;

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

        // 1. BATCHED icon resolve - 1 dir read + 1 Prisma findMany, not 24
        const serviceNames = (result.items as any[]).map(i => i.serviceName).filter(Boolean);
        const iconMap = await resolveServiceIconUrls(serviceNames);

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
                flagUrls: [],
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
