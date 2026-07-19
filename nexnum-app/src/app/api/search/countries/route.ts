import { NextRequest, NextResponse } from "next/server";
import { searchCountries } from "@/lib/search/search";
import { checkSearchRateLimit } from "@/lib/api/search-rate-limit";
import { cacheGet } from "@/lib/core/redis";
import { prisma } from "@/lib/core/db";

/**
 * GET /api/search/countries
 *
 * Search countries for a selected service with aggregated stats.
 * Returns: lowestPrice, totalStock, serverCount per country.
 *
 * Query Params:
 * - service: Service slug (required)
 * - q: Search query (optional)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
 * - sort: Sort option (name | price | stock)
 *
 * Performance (v2): per-user 60/min + per-IP 30/min rate limit, 60s Redis cache,
 * per-user favorite merge.
 */
export async function GET(req: NextRequest) {
    const rl = await checkSearchRateLimit(req);
    if (!rl.success) return rl.response!;

    try {
        const { searchParams } = new URL(req.url);
        const serviceCode = searchParams.get("service");
        const q = searchParams.get("q") || "";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "50");
        const sort = (searchParams.get("sort") || "name") as 'name' | 'pointPrice' | 'stock';

        if (!serviceCode) {
            return NextResponse.json(
                { error: "Missing required param: service" },
                { status: 400 }
            );
        }

        const cacheKey = `cache:search:countries:v2:${rl.userId || rl.ip}:${serviceCode}:${q}:${page}:${limit}:${sort}`;

        const result = await cacheGet<{ countries: any[]; total: number }>(
            cacheKey,
            () => searchCountries(serviceCode, q, { page, limit, sort }),
            60
        );

        const countryNames = (result.countries || []).map((c: any) => c.name).filter(Boolean);
        let favoriteMap = new Map<string, string>();
        if (rl.userId && countryNames.length > 0) {
            try {
                const favs = await prisma.userFavorite.findMany({
                    where: {
                        userId: rl.userId,
                        type: 'COUNTRY',
                        value: { in: countryNames.map(n => n.toLowerCase()) }
                    },
                    select: { id: true, value: true }
                });
                favoriteMap = new Map(favs.map(f => [f.value, f.id]));
            } catch { /* fail open */ }
        }

        const items = (result.countries || []).map((country: any) => {
            const value = (country.name || '').toLowerCase();
            return {
                code: country.code,
                name: country.name,
                flagUrl: country.flagUrl,
                lowestPrice: country.lowestPrice,
                totalStock: country.totalStock,
                serverCount: country.serverCount,
                isFavorite: favoriteMap.has(value),
                favoriteId: favoriteMap.get(value) || null,
            };
        });

        return NextResponse.json({
            items,
            pagination: {
                total: result.total,
                page,
                limit,
                hasMore: page * limit < result.total
            }
        });
    } catch (error) {
        console.error("Failed to search countries:", error);
        return NextResponse.json(
            { items: [], pagination: { total: 0, page: 1, hasMore: false } },
            { status: 500 }
        );
    }
}
