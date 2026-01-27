import { NextResponse } from "next/server";
import { searchCountries } from "@/lib/search/search";

/**
 * GET /api/public/countries
 * 
 * Redirect endpoint - redirects to /api/search/countries
 * Kept for backwards compatibility.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const serviceName = searchParams.get("service") || "";
        const q = searchParams.get("q") || "";
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "24");
        const sort = (searchParams.get("sort") || "name") as 'name' | 'price' | 'stock';


        if (!serviceName) {
            // New Behavior: If no service selected, return generic country list from Lookup
            const { prisma } = await import('@/lib/core/db');
            const [countries, total] = await Promise.all([
                prisma.countryLookup.findMany({
                    where: q ? { countryName: { contains: q, mode: 'insensitive' } } : {},
                    take: limit,
                    skip: (page - 1) * limit,
                    orderBy: { countryName: 'asc' }
                }),
                prisma.countryLookup.count({
                    where: q ? { countryName: { contains: q, mode: 'insensitive' } } : {}
                })
            ]);

            return NextResponse.json({
                items: countries.map(c => ({
                    id: c.countryCode,
                    name: c.countryName,
                    code: c.countryCode,
                    flagUrl: c.countryIcon,
                    minPrice: 0, // No specific price without service
                    totalStock: 0,
                    serverCount: 0
                })),
                pagination: { total, page, limit, hasMore: page * limit < total }
            });
        }

        // Delegate resolution to the search library's robust name-based logic
        const result = await searchCountries(serviceName, q, { page, limit, sort });

        // Map to standard format for backwards compatibility
        const items = result.countries.map(country => ({
            id: country.code,
            name: country.name,
            code: country.code,
            flagUrl: country.flagUrl,
            minPrice: country.lowestPrice,
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
