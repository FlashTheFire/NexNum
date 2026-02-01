import { NextResponse } from "next/server";
import { searchProviders } from "@/lib/search/search";
import { prisma } from "@/lib/core/db";

/**
 * GET /api/search/providers
 * 
 * Get providers for a selected service + country combination.
 * Returns individual offer entries with price and stock.
 * Also includes Smart Route info when multiple providers available.
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
        const serviceCode = searchParams.get("service");
        const countryCode = searchParams.get("country");
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "20");
        const sort = (searchParams.get("sort") || "pointPrice") as 'pointPrice' | 'stock';

        if (!serviceCode || !countryCode) {
            return NextResponse.json(
                { error: "Missing required params: service and country" },
                { status: 400 }
            );
        }

        const result = await searchProviders(serviceCode, countryCode, { page, limit, sort });

        // Get unique provider names from results
        const providerNames = [...new Set(result.providers.map(p => p.provider))].filter(Boolean) as string[];

        // Fetch provider display info from database (displayName, logoUrl, Reliability Stats)
        const providerInfoMap = new Map<string, {
            displayName: string;
            logoUrl: string | null;
            successRate: number;
            totalOrders: number;
        }>();

        if (providerNames.length > 0) {
            const providers = await prisma.provider.findMany({
                where: { name: { in: providerNames } },
                select: {
                    name: true,
                    displayName: true,
                    logoUrl: true,
                    // @ts-ignore: Schema updated but client types might be stale in dev
                    successRate: true,
                    // @ts-ignore: Schema updated but client types might be stale in dev
                    totalOrders: true
                }
            });
            providers.forEach(p => providerInfoMap.set(p.name, {
                displayName: p.displayName,
                logoUrl: p.logoUrl,
                // @ts-ignore: Schema updated
                successRate: Number(p.successRate || 98), // Default to 98 if new
                // @ts-ignore: Schema updated
                totalOrders: p.totalOrders || 0
            }));
        }

        // Best Practice: Calculate "Ecological Average" (Dynamic Baseline)
        // If a new provider appears, we assume they perform at the average level of the current ecosystem.
        let totalRate = 0;
        let ratedCount = 0;

        providerInfoMap.forEach(info => {
            // Only count providers with actual data (assuming totalOrders > 0 check or deviation from default)
            // But for simplicity, we treat all current DB values as "Known State".
            if (info.successRate > 0) {
                totalRate += info.successRate;
                ratedCount++;
            }
        });

        // Default to 80 (Neutral/Good) if no ecosystem data exists yet.
        // This avoids the "Cold Start" problem where everyone looks bad initially.
        const dynamicBaseline = ratedCount > 0 ? (totalRate / ratedCount) : 80.0;

        // Map to API response format with reliability info
        const items = result.providers.map((p, index) => {
            const providerInfo = providerInfoMap.get(p.provider);

            // USE DYNAMIC BASELINE: 
            // If provider has no custom stats/record in DB, use the calculated ecosystem average.
            const successRate = providerInfo?.successRate && providerInfo.successRate > 0
                ? providerInfo.successRate
                : dynamicBaseline;

            // Determine Label
            let reliabilityLabel = 'Standard';
            if (successRate >= 95) reliabilityLabel = 'Elite';
            else if (successRate >= 85) reliabilityLabel = 'High';
            else if (successRate >= 70) reliabilityLabel = 'Good';
            else if (successRate >= 50) reliabilityLabel = 'Medium';
            else reliabilityLabel = 'Low';

            return {
                displayName: providerInfo?.displayName || p.provider,
                serviceName: p.serviceName,
                serviceCode: p.providerServiceCode,
                countryName: p.countryName,
                countryCode: p.providerCountryCode,
                flagUrl: p.countryIcon,
                price: p.pointPrice,
                currencyPrices: p.currencyPrices,
                stock: p.stock,
                successRate: successRate,
                operatorId: p.operator,
                iconUrl: p.serviceIcon,
                // NEW: Added reliability and ranking
                rank: index + 1,
                reliability: reliabilityLabel,
            };
        });

        // Compute Smart Route info (only when >1 provider)
        const smartRoute = items.length > 1 ? {
            enabled: true,
            topProvider: items[0]?.displayName || null,
            fallbackCount: items.length - 1,
            priceRange: {
                min: Math.min(...items.map(i => i.price)),
                max: Math.max(...items.map(i => i.price))
            },
            totalStock: items.reduce((sum, i) => sum + i.stock, 0),
            // Full provider list for smart routing decisions
            providers: items.map(i => ({
                name: i.displayName,
                price: i.price,
                stock: i.stock,
                rank: i.rank,
                reliability: i.reliability,
                successRate: i.successRate,
                operatorId: i.operatorId
            })),
            // Computed reliability estimate based on top providers
            estimatedReliability: items[0]?.reliability || 'Standard',
            // Best route recommendation
            bestRoute: items[0] ? {
                provider: items[0].displayName,
                price: items[0].price,
                stock: items[0].stock,
                reliability: items[0].reliability
            } : null
        } : null;

        return NextResponse.json({
            items,
            pagination: {
                total: result.total,
                page,
                limit,
                hasMore: page * limit < result.total
            },
            // NEW: Smart Route info included
            smartRoute
        });
    } catch (error) {
        console.error("Failed to search providers:", error);
        return NextResponse.json(
            { items: [], pagination: { total: 0, page: 1, hasMore: false }, smartRoute: null },
            { status: 500 }
        );
    }
}

