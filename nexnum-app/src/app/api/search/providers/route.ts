import { NextResponse } from "next/server";
import { searchProviders } from "@/lib/search/search";
import { prisma } from "@/lib/core/db";

/**
 * GET /api/search/providers
 * 
 * Get providers for a selected service + country combination.
 * Returns individual offer entries with price and stock.
 * 
 * Query Params:
 * - service: Service slug (required)
 * - country: Country code (required)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - sort: Sort option (price | stock)
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const serviceSlug = searchParams.get("service");
        const countryCode = searchParams.get("country");
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "20");
        const sort = (searchParams.get("sort") || "price") as 'price' | 'stock';

        if (!serviceSlug || !countryCode) {
            return NextResponse.json(
                { error: "Missing required params: service and country" },
                { status: 400 }
            );
        }

        const result = await searchProviders(serviceSlug, countryCode, { page, limit, sort });

        // Get unique provider slugs from results
        const providerSlugs = [...new Set(result.providers.map(p => p.provider))];

        // Fetch provider display info from database (displayName, logoUrl)
        const providerInfoMap = new Map<string, { displayName: string; logoUrl: string | null }>();
        if (providerSlugs.length > 0) {
            const providers = await prisma.provider.findMany({
                where: { name: { in: providerSlugs } },
                select: { name: true, displayName: true, logoUrl: true }
            });
            providers.forEach(p => providerInfoMap.set(p.name, { displayName: p.displayName, logoUrl: p.logoUrl }));
        }

        // Map to API response format (id/provider slug hidden for security)
        const items = result.providers.map(p => {
            const providerInfo = providerInfoMap.get(p.provider);
            return {
                displayName: providerInfo?.displayName || p.provider, // Fallback to slug if not found
                logoUrl: providerInfo?.logoUrl || null,
                serviceName: p.serviceName,
                serviceSlug: p.serviceSlug,
                countryName: p.countryName,
                countryCode: p.countryCode,
                flagUrl: p.flagUrl,
                price: p.price,
                stock: p.stock,
                successRate: p.successRate,
                // Operator info
                operatorId: p.operatorId,
                operatorDisplayName: p.operatorDisplayName || '',
                iconUrl: (p as any).iconUrl, // Standardized icon name
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
        console.error("Failed to search providers:", error);
        return NextResponse.json(
            { items: [], pagination: { total: 0, page: 1, hasMore: false } },
            { status: 500 }
        );
    }
}

