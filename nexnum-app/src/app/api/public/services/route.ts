import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { aggregateServices } from "@/lib/service-normalizer";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const q = searchParams.get("q") || "";

        // Fetch ALL active services (we need all to group them effectively)
        const services = await prisma.service.findMany({
            where: {
                isActive: true,
            },
            select: {
                id: true,
                name: true,
                externalId: true,
                provider: true,
                slug: true
                // We need 'code' for normalizer but 'externalId' serves as code usually
            },
            take: 2000 // Limit to avoid massive memory usage, but enough for most catalogs
        });

        // Adapt to Normalizer Interface
        const rawForNormalizer = services.map(s => ({
            ...s,
            code: s.externalId // Map externalId to code
        }));

        // Run Aggregation
        const groups = aggregateServices(rawForNormalizer);

        // Filter by Query (AFTER aggregation to ensure we search Canonical Names)
        const filteredGroups = q
            ? groups.filter(g => g.canonicalName.toLowerCase().includes(q.toLowerCase()))
            : groups;

        // Sort by Popularity or Name
        // (Usage count isn't readily available here, so alphabet + totalProviders)
        const sorted = filteredGroups.sort((a, b) => b.totalProviders - a.totalProviders || a.canonicalName.localeCompare(b.canonicalName));

        // Pagination Logic
        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "50");
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;

        const paginatedSlice = sorted.slice(startIndex, endIndex);

        // Map to Public API
        const mapped = paginatedSlice.map(g => ({
            id: g.canonicalName, // Use Canonical Name as ID for search
            searchName: g.canonicalName,
            displayName: g.canonicalName,
            providerCount: g.totalProviders
        }));

        return NextResponse.json({
            items: mapped,
            pagination: {
                total: sorted.length,
                page: page,
                limit: limit,
                hasMore: endIndex < sorted.length
            }
        });
    } catch (error) {
        console.error("Failed to fetch public services", error);
        return NextResponse.json([], { status: 500 });
    }
}
