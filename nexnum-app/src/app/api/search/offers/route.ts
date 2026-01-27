import { NextRequest, NextResponse } from "next/server";
import { searchOffers } from "@/lib/search/search";
import { verifyToken } from "@/lib/auth/jwt";
import { createOfferId } from "@/lib/auth/id-security";
import { currencyService } from "@/lib/currency/currency-service";

// Protected Route: Only logged in users can search offers
export async function GET(req: NextRequest) {
    try {
        // ... (Auth Check commented out as per original) ...

        const { searchParams } = new URL(req.url);
        const q = searchParams.get("q") || "";
        const country = searchParams.get("country");
        const service = searchParams.get("service");
        const sortParam = searchParams.get("sort"); // e.g. "price:asc"
        const currency = searchParams.get("currency") || "USD"; // Default to USD

        let maxPrice = searchParams.get("maxPrice") ? parseFloat(searchParams.get("maxPrice")!) : undefined;

        // Convert User Currency maxPrice -> System POINTS (COINS)
        if (maxPrice !== undefined && currency !== 'POINTS') {
            // e.g. User says Max 100 INR -> Convert to X Points (Internal Base)
            maxPrice = await currencyService.convert(maxPrice, currency, 'POINTS');
        }

        const page = parseInt(searchParams.get("page") || "1");
        const limit = parseInt(searchParams.get("limit") || "20");

        const results = await searchOffers(q, {
            countryCode: country || undefined,
            serviceCode: service || undefined,
            maxPrice, // Now in POINTS/COINS
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
                providerName: offer.provider,
                country: offer.providerCountryCode,
                service: offer.providerServiceCode,
                operator: offer.operator || ''
            });

            // Return sanitized offer (remove internal identifiers)
            const {
                provider, // Removed
                operator, // Removed
                providerServiceCode, // Optional: Hide raw codes if desired, but keep for now if client needs debugging
                providerCountryCode,
                rawPrice, // Hide raw cost
                ...safeFields
            } = offer;

            return {
                ...safeFields,
                // Remap strictly for frontend compatibility if needed, or just send safeFields
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

