/**
 * Country Flag Lookup
 * 
 * Uses the Gist JSON for country ISO codes with accent-safe normalization.
 * Returns circle-flags SVG URLs for display.
 */

const COUNTRIES_URL = "https://gist.githubusercontent.com/devhammed/78cfbee0c36dfdaa4fce7e79c0d39208/raw/449258552611926be9ee7a8b4acc2ed9b2243a97/countries.json";

// Circle-flags base URL
const FLAG_BASE = "https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags";

interface CountryData {
    name: string;
    flag: string;  // Emoji flag (not used)
    code: string;  // ISO code (e.g., "AF", "US")
    dial_code: string;
}

// Fast + accent-safe normalizer
const normalize = (s: string | undefined | null): string =>
    String(s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");

// Cache for country name -> ISO code mapping
let countryCache: Map<string, string> | null = null;
let cachePromise: Promise<Map<string, string>> | null = null;

/**
 * Build and cache the country name -> ISO code lookup
 */
async function buildCountryCodeMap(): Promise<Map<string, string>> {
    if (countryCache) return countryCache;
    if (cachePromise) return cachePromise;

    cachePromise = (async () => {
        try {
            const res = await fetch(COUNTRIES_URL);
            if (!res.ok) throw new Error("Failed to fetch countries");

            const data: CountryData[] = await res.json();
            const map = new Map<string, string>();

            for (const c of data) {
                const normalizedName = normalize(c.name);
                const isoCode = c.code?.toLowerCase();

                if (normalizedName && isoCode) {
                    map.set(normalizedName, isoCode);
                }
                // Also add by ISO code itself (for direct lookups)
                if (isoCode) {
                    map.set(isoCode, isoCode);
                }
            }

            countryCache = map;
            return map;
        } catch (error) {
            console.error("Failed to build country code map:", error);
            return new Map();
        }
    })();

    return cachePromise;
}

/**
 * Get circle-flags SVG URL by country name or code
 * Returns undefined if country not found or invalid ISO code
 */
export async function getCountryFlagUrl(countryName: string): Promise<string | undefined> {
    const map = await buildCountryCodeMap();
    const normalized = normalize(countryName);
    const isoCode = map.get(normalized);
    // Validate: must be exactly 2 lowercase letters (ISO 3166-1 alpha-2)
    if (isoCode && /^[a-z]{2}$/.test(isoCode)) {
        return `${FLAG_BASE}/${isoCode}.svg`;
    }
    return undefined;
}

/**
 * Synchronous version using pre-loaded cache (for React components)
 * Call preloadCountryFlags() first to ensure cache is ready
 * Only returns URL if we find a valid 2-letter ISO code
 */
export function getCountryFlagUrlSync(countryName: string): string | undefined {
    if (!countryCache) return undefined;
    const normalized = normalize(countryName);
    const isoCode = countryCache.get(normalized);
    // Validate: must be exactly 2 lowercase letters (ISO 3166-1 alpha-2)
    if (isoCode && /^[a-z]{2}$/.test(isoCode)) {
        return `${FLAG_BASE}/${isoCode}.svg`;
    }
    return undefined;
}

/**
 * Preload the country flags cache
 * Call this on app init or component mount
 */
export async function preloadCountryFlags(): Promise<void> {
    await buildCountryCodeMap();
}

/**
 * React hook for country flags
 */
export function useCountryFlags() {
    return {
        getFlagUrl: getCountryFlagUrlSync,
        preload: preloadCountryFlags,
    };
}
