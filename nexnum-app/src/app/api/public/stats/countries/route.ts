import { NextResponse } from "next/server";
import { meili, INDEXES, OfferDocument } from "@/lib/search/search";
import { normalizeCountryName, generateCanonicalCode } from "@/lib/normalizers/service-identity";
import { getCountryFlagUrlSync } from "@/lib/normalizers/country-flags";
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
 * Aggregates data directly from MeiliSearch offers index.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 300);
        const locale = (searchParams.get("locale") || "en") as keyof CountryMeta["name"];

        // Fetch all active offers from MeiliSearch for global aggregation
        const index = meili.index(INDEXES.OFFERS);

        const result = await index.search('', {
            filter: 'isActive = true',
            limit: 10000, // Get enough data for global aggregation
            attributesToRetrieve: ['countryName', 'serviceName', 'provider', 'pointPrice', 'stock'],
        });

        // Aggregate country stats from MeiliSearch hits
        const countryMap = new Map<string, {
            displayName: string;
            minPrice: number;
            totalPrice: number;
            priceCount: number;
            totalStock: number;
            services: Set<string>;
            providers: Set<string>;
        }>();

        for (const hit of result.hits as OfferDocument[]) {
            const normalizedName = normalizeCountryName(hit.countryName);
            if (!normalizedName) continue;

            let stats = countryMap.get(normalizedName);
            if (!stats) {
                stats = {
                    displayName: hit.countryName,
                    minPrice: hit.pointPrice,
                    totalPrice: hit.pointPrice,
                    priceCount: 1,
                    totalStock: 0,
                    services: new Set(),
                    providers: new Set(),
                };
                countryMap.set(normalizedName, stats);
            }

            stats.minPrice = Math.min(stats.minPrice, hit.pointPrice);
            stats.totalPrice += hit.pointPrice;
            stats.priceCount += 1;
            stats.totalStock += hit.stock || 0;
            stats.services.add(hit.serviceName);
            stats.providers.add(hit.provider);

            // Prefer longer/better display name
            if (hit.countryName && hit.countryName.length > stats.displayName.length) {
                stats.displayName = hit.countryName;
            }
        }

        // Map to response format with coordinates from unified metadata
        let countries: CountryStats[] = Array.from(countryMap.values()).map(stats => {
            const countryName = stats.displayName;

            // PRIORITY: Always look up by NAME first
            let meta: CountryMeta | undefined = findMetadataByName(countryName);

            // Final ISO code (use metadata code if found, else generate)
            const isoCode = meta?.code || generateCanonicalCode(countryName);

            // Calculate coordinates
            const coords = meta && meta.latitude && meta.longitude
                ? latLngToMapPosition(meta.latitude, meta.longitude)
                : { x: 50, y: 50 }; // Default center

            // Final localized name
            const localizedName = meta?.name[locale] || meta?.name["en"] || countryName || "Unknown";

            return {
                code: isoCode,
                name: localizedName,
                flagUrl: getCountryFlagUrlSync(countryName) || getFlagUrl(isoCode),
                totalServices: stats.services.size,
                totalStock: stats.totalStock,
                totalProviders: stats.providers.size,
                lowestPrice: stats.minPrice,
                avgPrice: stats.priceCount > 0 ? Number((stats.totalPrice / stats.priceCount).toFixed(2)) : 0,
                x: coords.x,
                y: coords.y,
            };
        });

        // Sort by total stock descending (most popular first)
        countries.sort((a, b) => b.totalStock - a.totalStock);

        // FORCE INCLUSION: Ensure key markets (India, China, Russia) are always in the results
        const PRIORITY_TARGETS = [
            { code: 'IN', names: ['INDIA'] },
            { code: 'CN', names: ['CHINA'] },
            { code: 'RU', names: ['RUSSIA'] }
        ];

        // Check which priority countries are missing
        const existingCodes = new Set(countries.map(c => c.code.toUpperCase()));
        const existingNames = new Set(countries.map(c => c.name.toUpperCase()));

        for (const target of PRIORITY_TARGETS) {
            const hasCode = existingCodes.has(target.code);
            const hasName = target.names.some(n => existingNames.has(n));

            if (!hasCode && !hasName) {
                // Country is missing - add placeholder from metadata
                const meta = CODE_TO_META.get(target.code);
                if (meta) {
                    const coords = meta.latitude && meta.longitude
                        ? latLngToMapPosition(meta.latitude, meta.longitude)
                        : { x: 50, y: 50 };

                    countries.push({
                        code: meta.code,
                        name: meta.name[locale] || meta.name["en"],
                        flagUrl: getFlagUrl(meta.code),
                        totalServices: 0,
                        totalStock: 0,
                        totalProviders: 0,
                        lowestPrice: 0,
                        avgPrice: 0,
                        x: coords.x,
                        y: coords.y,
                    });
                }
            }
        }

        // DEDUPLICATE: Ensure all codes are unique to prevent React Key errors
        const uniqueCountries: CountryStats[] = [];
        const seenCodes = new Set<string>();

        for (const c of countries) {
            if (!seenCodes.has(c.code)) {
                seenCodes.add(c.code);
                uniqueCountries.push(c);
            }
        }

        // Apply limit
        const limitedCountries = uniqueCountries.slice(0, limit);

        // Calculate summary from all countries (before limiting)
        const summary = {
            totalCountries: uniqueCountries.length,
            totalServices: new Set(Array.from(countryMap.values()).flatMap(s => Array.from(s.services))).size,
            grandTotalStock: Array.from(countryMap.values()).reduce((sum, s) => sum + s.totalStock, 0),
        };

        return NextResponse.json({
            countries: limitedCountries,
            summary,
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
