import { NextRequest, NextResponse } from "next/server";
import { searchOffers } from "@/lib/search/search";
import { verifyToken } from "@/lib/auth/jwt";
import { createOfferId } from "@/lib/auth/id-security";
import { getCurrencyService, toSupportedCurrency } from "@/lib/currency/currency-service";
import { checkSearchRateLimit } from "@/lib/api/search-rate-limit";

// Protected Route: Only logged in users can search offers
export async function GET(req: NextRequest) {
    const rl = await checkSearchRateLimit(req);
    if (!rl.success) return rl.response!;

    try {
        // Require authentication - this route generates per-user obfuscated IDs
        // and would be a high-cost DoS vector if left open.
        const cookieToken = req.cookies.get('token')?.value;
        const authHeader = req.headers.get('authorization');
        const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        const token = cookieToken || bearerToken;
        if (!token) {
            return NextResponse.json({ hits: [], total: 0, error: "Authentication required" }, { status: 401 });
        }
        const user = verifyToken(token);
        if (!user) {
            return NextResponse.json({ hits: [], total: 0, error: "Invalid or expired token" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const q = searchParams.get("q") || "";
        const country = searchParams.get("country");
        const service = searchParams.get("service");
        const sortParam = searchParams.get("sort"); // e.g. "price:asc"
        const currency = searchParams.get("currency") || "USD"; // Default to USD

        let maxPrice = searchParams.get("maxPrice") ? parseFloat(searchParams.get("maxPrice")!) : undefined;

        // Convert User Currency maxPrice -> System POINTS (single source: payment currency-service)
        if (maxPrice !== undefined && currency !== 'POINTS') {
            maxPrice = await getCurrencyService().fiatToPoints(maxPrice, toSupportedCurrency(currency));
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
