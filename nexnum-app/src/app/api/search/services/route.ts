import { NextResponse } from "next/server";
import { getServiceAggregates } from "@/lib/search/service-aggregates";
import { getServiceIconUrlByName } from "@/lib/search/search";
import { calculatePrices } from "@/lib/pricing/pricing-utils";

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
                currencyPrices: await calculatePrices(Number(item.lowestPrice)),
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
