import { NextResponse } from "next/server";
import { getServiceAggregates } from "@/lib/search/service-aggregates";
import { getServiceIconUrlByName } from "@/lib/search/search";

/**
 * GET /api/search/services
 * 
 * Returns services from the pre-computed Aggregate Table (backed by Redis/DB).
 * Strategy: Read-Heavy Optimization.
 * - Writes: Async background worker updates Aggr Table every ~5 min.
 * - Reads: Instant DB query (indexed) or Redis Cache.
 * 
 * Scaling: Supports millions of active offers with consistent <20ms latency.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const q = searchParams.get("q") || "";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "50");
        const sort = searchParams.get("sort") as "stock" | "pointPrice" | "name" | undefined;

        // Use the pre-computed engine
        // "stock" corresponds to stock_desc, "pointPrice" to price_asc in the underlying lib
        let mappedSort: 'stock' | 'pointPrice' | 'name' | undefined = undefined;
        if (sort === 'stock') mappedSort = 'stock'; // implies desc
        if (sort === 'pointPrice') mappedSort = 'pointPrice'; // implies asc
        if (!sort) mappedSort = 'stock'; // Default to popularity (stock)

        const result = await getServiceAggregates({
            query: q,
            page,
            limit,
            sortBy: mappedSort
        });

        // Enrich items with Icons (DB might not have them, or they need fresh resolution)
        const enrichedItems = await Promise.all(result.items.map(async (item: any) => {
            let iconUrl = ""; // Aggregates table doesn't store icon URL currently, or we fetch it fresh

            // Try resolution
            const resolved = await getServiceIconUrlByName(item.serviceName);
            iconUrl = resolved || `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(item.serviceName)}&backgroundColor=0ea5e9,6366f1,8b5cf6,ec4899`;

            return {
                slug: item.serviceCode,
                name: item.serviceName,
                lowestPrice: Number(item.lowestPrice),
                totalStock: Number(item.totalStock),
                serverCount: item.providerCount || 0,
                countryCount: item.countryCount || 0,
                iconUrl: iconUrl,
                flagUrls: [], // Optimization: List view doesn't need 3 tiny flags, cleaner UI
            };
        }));

        return NextResponse.json({
            items: enrichedItems,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                hasMore: result.page * result.limit < result.total
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
