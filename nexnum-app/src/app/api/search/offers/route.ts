import { NextRequest, NextResponse } from "next/server";
import { searchOffers } from "@/lib/search/search";
import { verifyToken } from "@/lib/auth/jwt";
import { createOfferId } from "@/lib/auth/id-security";

// Protected Route: Only logged in users can search offers
export async function GET(req: NextRequest) {
    try {
        // 1. Auth Check (Optional: Could be public if you want SEO pages to use it, but safe to protect pricing)
        // const token = req.cookies.get("token")?.value;
        // if (!token || !(await verifyToken(token))) {
        //     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        // }
        // Keeping it open for now to allow easier frontend dev/demo, but easily uncommented.

        const { searchParams } = new URL(req.url);
        const q = searchParams.get("q") || "";
        const country = searchParams.get("country");
        const service = searchParams.get("service");
        const maxPrice = searchParams.get("maxPrice") ? parseFloat(searchParams.get("maxPrice")!) : undefined;
        const sortParam = searchParams.get("sort"); // e.g. "price:asc"

        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "20");

        const results = await searchOffers(q, {
            countryCode: country || undefined,
            serviceCode: service || undefined,
            maxPrice,
            minCount: 1 // Only show items in stock
        }, {
            page,
            limit,
            sort: sortParam ? [sortParam] : ['price:asc']
        });

        // 2. Obfuscate internal IDs before sending to client
        const secureHits = results.hits.map(offer => {
            // Create secure ID that hides provider/operator details
            const secureId = createOfferId({
                provider: offer.provider,
                country: offer.countryCode,
                service: offer.serviceSlug,
                operator: String(offer.externalOperator || offer.operatorId || '')
            });

            // Return sanitized offer (remove internal identifiers)
            const {
                provider,
                operatorId,
                externalOperator,
                operatorDisplayName,
                ...safeFields
            } = offer;

            return {
                ...safeFields,
                id: secureId, // Replace with secure ID
            };
        });

        return NextResponse.json({
            hits: secureHits,
            total: results.total,
        });

    } catch (error) {
        console.error("Search API Error:", error);
        return NextResponse.json({ hits: [], total: 0, error: "Search failed" }, { status: 500 });
    }
}

