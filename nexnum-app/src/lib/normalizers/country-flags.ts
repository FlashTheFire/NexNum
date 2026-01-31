/**
 * Country Flag Lookup
 * 
 * Uses the local metadata.json (via country-normalizer) for reliable ISO code resolution.
 * Returns circle-flags SVG URLs for display.
 */

import { getCountryIsoCode, normalizeCountryName } from './country-normalizer';

// Circle-flags base URL (Served locally)
const FLAG_BASE = "/assets/flags";


/**
 * Get circle-flags SVG URL by country name or code
 * Returns undefined if country not found or invalid ISO code
 */
export async function getCountryFlagUrl(countryName: string): Promise<string | undefined> {
    const cleanName = normalizeCountryName(countryName);
    const isoCode = getCountryIsoCode(cleanName || countryName);
    if (isoCode) {
        return `${FLAG_BASE}/${isoCode}.svg`;
    }
    return undefined;
}

/**
 * Get ISO 3166-1 alpha-2 code from country name
 * Returns undefined if not found
 */
export async function getIsoCodeFromCountryName(countryName: string): Promise<string | undefined> {
    const cleanName = normalizeCountryName(countryName);
    const isoCode = getCountryIsoCode(cleanName || countryName);
    return isoCode;
}

/**
 * Synchronous version using local metadata (no preload needed anymore)
 */
export function getCountryFlagUrlSync(identifier: string): string | undefined {
    if (!identifier) return undefined;

    // Normalize name first (e.g. "India (75)" -> "India")
    // This is crucial because some providers send numeric IDs in the name field
    const cleanName = normalizeCountryName(identifier);

    // 1. Try resolving via getCountryIsoCode (handles both ID and Name)
    const isoCode = getCountryIsoCode(cleanName || identifier);
    if (isoCode) {
        return `${FLAG_BASE}/${isoCode}.svg`;
    }

    return undefined;
}

/**
 * React hook for country flags
 */
export function useCountryFlags() {
    return {
        getFlagUrl: getCountryFlagUrlSync,
    };
}
