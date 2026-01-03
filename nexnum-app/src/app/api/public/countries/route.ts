import { NextResponse } from "next/server";
import { searchCountries } from "@/lib/search";

/**
 * GET /api/public/countries
 * 
 * Legacy endpoint - redirects to /api/search/countries
 * Kept for backwards compatibility with existing frontend.
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
            const { prisma } = await import('@/lib/db');
            const [countries, total] = await Promise.all([
                prisma.countryLookup.findMany({
                    where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
                    take: limit,
                    skip: (page - 1) * limit,
                    orderBy: { name: 'asc' }
                }),
                prisma.countryLookup.count({
                    where: q ? { name: { contains: q, mode: 'insensitive' } } : {}
                })
            ]);

            return NextResponse.json({
                items: countries.map(c => ({
                    id: c.code,
                    name: c.name,
                    code: c.code,
                    // phoneCode removed
                    flagUrl: c.flagUrl,
                    minPrice: 0, // No specific price without service
                    totalStock: 0,
                    serverCount: 0
                })),
                pagination: { total, page, limit, hasMore: page * limit < total }
            });
        }

        // Sanitize service name to slug logic needs to be smarter.
        // The user might send "Telegram" (name) or "tg" (code).
        // We need to resolve it to the canonical 'code' used in our DB/Meili.
        let serviceSlug = serviceName.toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9\-]/g, '');

        try {
            const { prisma } = await import('@/lib/db');
            // Try to find exact match on Code or Name
            // We prioritize exact code match, then name match
            // Try to find exact match on Code or Name using ACTIVE Service Aggregates
            // This ensures we resolve to the code that actually has offers (e.g. 'tg' instead of 'telegram')
            const serviceRef = await prisma.serviceAggregate.findFirst({
                where: {
                    OR: [
                        { serviceCode: { equals: serviceSlug, mode: 'insensitive' } },
                        { serviceName: { equals: serviceName, mode: 'insensitive' } },
                        { serviceName: { contains: serviceName, mode: 'insensitive' } }
                    ]
                },
                select: { serviceCode: true }
            });

            if (serviceRef) {
                serviceSlug = serviceRef.serviceCode;
            } else {
                // If not found in lookup, maybe it's a raw slug provided by user?
                // We keep the sanitized version as fallback.
            }
        } catch (e) {
            console.warn("Failed to resolve service name:", e);
        }

        const result = await searchCountries(serviceSlug, q, { page, limit, sort });

        // Map to legacy format for backwards compatibility
        const items = result.countries.map(country => ({
            id: country.code,
            name: country.name,
            code: country.code,
            // phoneCode removed
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
