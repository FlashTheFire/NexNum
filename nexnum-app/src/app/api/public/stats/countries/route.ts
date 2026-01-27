import { NextResponse } from "next/server";
import { prisma } from "@/lib/core/db";
import countriesMetadata from "@/data/countries-metadata.json";

// Advanced Map Calibration Settings
// Tuned for Aspect Ratio Mismatch (Image AR 2.51 vs Map AR 1.88)
// "Extra Space" in image requires significant horizontal padding
const MAP_CALIBRATION = {
    // Geographic Boundaries (Degrees)
    bounds: {
        minLng: -180,
        maxLng: 180,
        minLat: -60,  // Verified "Vertical is Correct" bounds
        maxLat: 75,
    },
    // Visual Padding (Percentage of Container)
    // User Manual Override: Asymmetric padding to match image margins
    padding: {
        top: 4,     // "Vertical is Correct"
        bottom: 4,  // "Vertical is Correct"
        left: 12,   // User Request: 12%
        right: 20,  // User Request: 20%
    }
};

/**
 * Dynamic Advance Calculation: Lat/Lng -> Map %
 * Uses calibrated Mercator projection with visual adjustments
 */
function latLngToMapPosition(lat: number, lng: number): { x: number; y: number } {
    const { bounds, padding } = MAP_CALIBRATION;

    // Calculate usable area dimensions
    const usableWidth = 100 - padding.left - padding.right;
    const usableHeight = 100 - padding.top - padding.bottom;

    // --- Longitude Calculation (Linear) ---
    // Normalize longitude to 0-1 range within defined bounds
    let normLng = (lng - bounds.minLng) / (bounds.maxLng - bounds.minLng);
    normLng = Math.max(0, Math.min(1, normLng)); // Clamp to bounds

    // --- Latitude Calculation (Mercator) ---
    // 1. Clamp latitude to map bounds
    const clampedLat = Math.max(bounds.minLat, Math.min(bounds.maxLat, lat));

    // 2. Convert to Radians
    const latRad = clampedLat * Math.PI / 180;
    const minLatRad = bounds.minLat * Math.PI / 180;
    const maxLatRad = bounds.maxLat * Math.PI / 180;

    // 3. Apply Mercator Logarithmic Scaling
    // formula: ln(tan(pi/4 + lat/2))
    const mercN = Math.log(Math.tan((Math.PI / 4) + (latRad / 2)));
    const mercMin = Math.log(Math.tan((Math.PI / 4) + (minLatRad / 2)));
    const mercMax = Math.log(Math.tan((Math.PI / 4) + (maxLatRad / 2)));

    // 4. Normalize to 0-1 (Inverted Y for map coordinate system: Top=0)
    let normLat = (mercMax - mercN) / (mercMax - mercMin);
    normLat = Math.max(0, Math.min(1, normLat));

    // --- Final Position Mapping ---
    return {
        x: Number((padding.left + (normLng * usableWidth)).toFixed(1)),
        y: Number((padding.top + (normLat * usableHeight)).toFixed(1))
    };
}

// Build lookups from unified metadata
type CountryMeta = typeof countriesMetadata[number];

// ISO code -> metadata (e.g., "US" -> { code: "US", name: {...}, ... })
const CODE_TO_META = new Map<string, CountryMeta>();
// Normalized name -> metadata (e.g., "united states" -> { code: "US", ... })
const NAME_TO_META = new Map<string, CountryMeta>();

countriesMetadata.forEach(c => {
    CODE_TO_META.set(c.code.toUpperCase(), c);
    // Add English name as key (normalized)
    NAME_TO_META.set(c.name.en.toLowerCase().trim(), c);
});

// Add common aliases for name lookup
function findMetadataByName(name: string): CountryMeta | undefined {
    const normalized = name.toLowerCase().trim();

    // 1. Direct name match
    const direct = NAME_TO_META.get(normalized);
    if (direct) return direct;

    // 2. Partial match - check if any metadata name contains the search
    for (const [key, meta] of NAME_TO_META) {
        if (key.includes(normalized) || normalized.includes(key)) {
            return meta;
        }
    }

    return undefined;
}

function getFlagUrl(code: string): string {
    return `/assets/flags/${code.toLowerCase()}.svg`;
}



interface CountryStats {
    code: string;
    name: string;
    flagUrl: string;
    totalServices: number;
    totalStock: number;
    totalProviders: number;
    lowestPrice: number;
    avgPrice: number;
    x: number;
    y: number;
}

/**
 * GET /api/public/stats/countries
 * 
 * Returns aggregated country statistics for the Global Coverage Map.
 * Top countries by total stock, with service counts, provider counts, and pricing.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 300);
        const locale = (searchParams.get("locale") || "en") as keyof CountryMeta["name"];

        // Aggregate country stats from ProviderCountry
        const countryStats: any[] = [];


        // FORCE INCLUSION: Ensure key markets (India, China, Russia) are always in the results
        // Check by CODE and NAME to be robust against DB inconsistencies
        const PRIORITY_TARGETS = [
            { code: 'IN', names: ['INDIA'] },
            { code: 'CN', names: ['CHINA'] },
            { code: 'RU', names: ['RUSSIA', 'RUSSIAN FEDERATION'] }
        ];

        const existingCodes = new Set(countryStats.map((c: any) => c.country_code?.toUpperCase()));
        const existingNames = new Set(countryStats.map((c: any) => c.country_name?.toUpperCase()));

        const targetsToFetch: { codes: string[], names: string[] } = { codes: [], names: [] };

        PRIORITY_TARGETS.forEach(target => {
            const hasCode = existingCodes.has(target.code);
            const hasName = target.names.some(n => existingNames.has(n));

            if (!hasCode && !hasName) {
                targetsToFetch.codes.push(target.code);
                targetsToFetch.names.push(...target.names);
            }
        });

        if (targetsToFetch.codes.length > 0) {
            // SECURITY: Use parameterized query instead of string concatenation
            // Note: These values come from hardcoded PRIORITY_TARGETS, but using params is safer pattern
            const priorityStats = await prisma.providerCountry.findMany({
                where: {
                    OR: [
                        { code: { in: targetsToFetch.codes, mode: 'insensitive' } },
                        { name: { in: targetsToFetch.names, mode: 'insensitive' } }
                    ]
                },
                select: {
                    code: true,
                    name: true,
                    flagUrl: true,
                    id: true
                }
            });

            // For each priority country, get basic stats
            // STUB: ProviderPricing is deleted. Returning 0s for now.
            // TODO: Implement MeiliSearch aggregation
            for (const pc of priorityStats) {
                countryStats.push({
                    country_code: pc.code,
                    country_name: pc.name,
                    flag_url: pc.flagUrl,
                    total_services: 0,
                    total_stock: 0,
                    total_providers: 0,
                    lowest_price: 0,
                    avg_price: 0
                });
            }
        }

        // STUB: Overall summary
        const summaryData = { total_countries: 0, total_services: 0, grand_total_stock: 0 };

        // Map to response format with coordinates from unified metadata
        const countries: CountryStats[] = countryStats.map(row => {
            const countryName = row.country_name || "";
            const dbCode = row.country_code || "";

            // PRIORITY: Always look up by NAME first since DB codes are often incorrect/corrupted
            let meta: CountryMeta | undefined = findMetadataByName(countryName);

            // Fallback: If name lookup fails AND dbCode is 2-letter ISO, try by code
            if (!meta && dbCode.length === 2) {
                meta = CODE_TO_META.get(dbCode.toUpperCase());
            }

            // Final ISO code (use metadata code if found, else fallback)
            const isoCode = meta?.code || (dbCode.length === 2 ? dbCode.toUpperCase() : "XX");

            // Calculate coordinates
            const coords = meta && meta.latitude && meta.longitude
                ? latLngToMapPosition(meta.latitude, meta.longitude)
                : { x: 50, y: 50 }; // Default center

            // Final localized name
            const localizedName = meta?.name[locale] || meta?.name["en"] || countryName || "Unknown";

            return {
                code: isoCode,
                name: localizedName,
                flagUrl: getFlagUrl(isoCode),
                totalServices: Number(row.total_services) || 0,
                totalStock: Number(row.total_stock) || 0,
                totalProviders: Number(row.total_providers) || 0,
                lowestPrice: parseFloat(row.lowest_price) || 0,
                avgPrice: parseFloat(row.avg_price) || 0,
                x: coords.x,
                y: coords.y,
            };
        });

        // DEDUPLICATE: Ensure all codes are unique to prevent React Key errors (e.g. duplicate 'NL', 'CA')
        // Prioritize the first occurrence (which is highest stock due to sorting)
        const uniqueCountries: CountryStats[] = [];
        const seenCodes = new Set<string>();

        for (const c of countries) {
            if (!seenCodes.has(c.code)) {
                seenCodes.add(c.code);
                uniqueCountries.push(c);
            }
        }



        return NextResponse.json({
            countries: uniqueCountries,
            summary: {
                totalCountries: Number(summaryData.total_countries),
                totalServices: Number(summaryData.total_services),
                grandTotalStock: Number(summaryData.grand_total_stock),
            }
        }, {
            headers: {
                "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
            }
        });

    } catch (error) {
        console.error("Failed to fetch country stats:", error);
        return NextResponse.json(
            { countries: [], summary: { totalCountries: 0, totalServices: 0, grandTotalStock: 0 } },
            { status: 500 }
        );
    }
}
