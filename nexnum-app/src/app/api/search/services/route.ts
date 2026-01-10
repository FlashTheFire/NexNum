import { NextResponse } from "next/server";
import { searchServices } from "@/lib/search/search";

/**
 * GET /api/search/services
 * 
 * Search services with aggregated stats from offers index.
 * Returns: lowestPrice, totalStock, serverCount, countryCount per service.
 * 
 * Query Params:
 * - q: Search query (optional)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50)
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const q = searchParams.get("q") || "";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "50");
        const sort = searchParams.get("sort") || undefined;

        const result = await searchServices(q, { page, limit, sort });

        // Map to API response format
        const items = result.services.map(service => ({
            slug: service.slug,
            name: service.name,
            lowestPrice: service.lowestPrice,
            totalStock: service.totalStock,
            serverCount: service.serverCount,
            countryCount: service.countryCount,
            iconUrl: service.iconUrl,
            flagUrls: service.topCountries.map(c => c.flagUrl).filter(Boolean),
        }));

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
        console.error("Failed to search services:", error);
        return NextResponse.json(
            { items: [], pagination: { total: 0, page: 1, hasMore: false } },
            { status: 500 }
        );
    }
}
