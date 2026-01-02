import { NextResponse } from "next/server";
import { searchCountries } from "@/lib/search";

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
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const serviceSlug = searchParams.get("service");
        const q = searchParams.get("q") || "";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "50");
        const sort = (searchParams.get("sort") || "name") as 'name' | 'price' | 'stock';

        if (!serviceSlug) {
            return NextResponse.json(
                { error: "Missing required param: service" },
                { status: 400 }
            );
        }

        const result = await searchCountries(serviceSlug, q, { page, limit, sort });

        // Map to API response format
        const items = result.countries.map(country => ({
            code: country.code,
            name: country.name,
            phoneCode: country.phoneCode,
            flagUrl: country.flagUrl,
            lowestPrice: country.lowestPrice,
            totalStock: country.totalStock,
            serverCount: country.serverCount,
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
        console.error("Failed to search countries:", error);
        return NextResponse.json(
            { items: [], pagination: { total: 0, page: 1, hasMore: false } },
            { status: 500 }
        );
    }
}
