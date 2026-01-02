import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getIsoByPhoneAndName } from "@/lib/country-data";

// Redundant map removed


export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const serviceName = searchParams.get("service");

        // Base query for active countries
        const whereClause: any = { isActive: true };

        // If we have a service context, we want to prioritize countries that have this service
        // But for getting stats, we might need a 2-step approach or a complex include.

        // Strategy:
        // 1. Fetch Stats if serviceName is present.
        // 2. Fetch Countries.
        // 3. Merge.

        let statsMap = new Map<string, { minPrice: number, totalStock: number }>();

        if (serviceName) {
            // Find services matching the name (loose match to catch "WhatsApp" and "WhatsApp Business" if desired, 
            // or strict if we sent Canonical ID. Actually we sent Canonical Name "WhatsApp").
            // Let's try to match by name.

            const services = await prisma.service.findMany({
                where: { name: { contains: serviceName, mode: 'insensitive' }, isActive: true },
                select: { id: true }
            });
            const serviceIds = services.map(s => s.id);

            if (serviceIds.length > 0) {
                const stats = await prisma.servicePricing.groupBy({
                    by: ['countryId'],
                    where: {
                        serviceId: { in: serviceIds },
                        isAvailable: true
                    },
                    _min: { price: true },
                    _sum: { count: true }
                });

                stats.forEach(s => {
                    statsMap.set(s.countryId, {
                        minPrice: Number(s._min.price || 0),
                        totalStock: s._sum.count || 0
                    });
                });
            }
        }

        // Fetch unique active countries based on phoneCode
        // We use distinct phoneCode to avoid showing "United States" 5 times if 5 providers offer it.
        // But we need to be careful: which Country ID do we use to match Stats?
        // ServicePricing is linked to specific Country IDs (provider specific).
        // If we have 5 "US" countries, Stats might be split across them.

        // Better Approach for Stats with Duplicates:
        // Group Stats by 'Country ISO' or 'PhoneCode'? 
        // ServicePricing -> Country.
        // We really need to fetch ALL active countries, then group by PhoneCode in memory to sum up stocks and find absolute min price.

        const allCountries = await prisma.country.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                phoneCode: true,
                externalId: true, // ISO?
            }
        });

        // Aggregation Map (Key: PhoneCode)
        const countryGroups = new Map<string, {
            id: string, // Use one ID as representative
            name: string,
            code: string,
            phoneCode: string,
            minPrice: number,
            totalStock: number,
            providerCount: number
        }>();

        for (const c of allCountries) {
            // Normalize Name (Remove " (Virt)", " Physical" etc if present, basic cleanup)
            const cleanName = c.name.replace(/\[.*?\]|\(.*?\)/g, "").trim();

            const code = (getIsoByPhoneAndName(c.phoneCode, cleanName) || (c.externalId.length === 2 ? c.externalId : "UN")).toUpperCase();

            const key = c.phoneCode; // Group by Phone Code

            const existing = countryGroups.get(key);
            const countryStats = statsMap.get(c.id) || { minPrice: Infinity, totalStock: 0 };

            const price = countryStats.minPrice;
            const stock = countryStats.totalStock;

            if (!existing) {
                countryGroups.set(key, {
                    id: c.id,
                    name: cleanName,
                    code: code,
                    phoneCode: c.phoneCode,
                    minPrice: price,
                    totalStock: stock,
                    providerCount: 1
                });
            } else {
                // Update stats
                existing.minPrice = Math.min(existing.minPrice, price);
                existing.totalStock += stock;
                existing.providerCount += 1;
                // Keep the shortest/cleanest name
                if (cleanName.length < existing.name.length) existing.name = cleanName;
            }
        }

        const result = Array.from(countryGroups.values()).map(c => ({
            ...c,
            minPrice: c.minPrice === Infinity ? 0 : c.minPrice // Restore 0 if no price found
        }));

        // Strict Filter: If service context is active, only return available countries
        const finalResult = serviceName
            ? result.filter(r => r.minPrice > 0)
            : result;

        // Sorting
        const sort = searchParams.get("sort") || "name";
        finalResult.sort((a, b) => {
            switch (sort) {
                case "price_asc":
                    // Nulls/Zeros last
                    if (!a.minPrice && !b.minPrice) return a.name.localeCompare(b.name);
                    if (!a.minPrice) return 1;
                    if (!b.minPrice) return -1;
                    return a.minPrice - b.minPrice;
                case "price_desc":
                    return (b.minPrice || 0) - (a.minPrice || 0);
                case "stock_desc":
                    return (b.totalStock || 0) - (a.totalStock || 0);
                case "name":
                default:
                    return a.name.localeCompare(b.name);
            }
        });

        // Pagination
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "50");
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        const paginatedItems = finalResult.slice(startIndex, endIndex);

        return NextResponse.json({
            items: paginatedItems,
            pagination: {
                total: finalResult.length,
                page,
                limit,
                hasMore: endIndex < finalResult.length
            }
        });
    } catch (error) {
        console.error("Failed to fetch public countries", error);
        return NextResponse.json([], { status: 500 });
    }
}
