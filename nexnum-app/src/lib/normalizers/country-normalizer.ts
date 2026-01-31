import metadata from '@/data/metadata.json'
import countriesMetadata from '@/data/countries-metadata.json'

/**
 * Country Name Normalizer & Phone Code Lookup
 */

// Country Name Mapping (Aliases)
export const COUNTRY_NAME_MAP: Record<string, string> = metadata.countryNameMap

// Variant patterns (virtual, numbered versions)
const VARIANT_PATTERN = /^(.+?)\s*\((?:virtual|v|[0-9]+)\)$/i

// Circle-flags base URL
const FLAG_BASE = "/assets/flags"

/**
 * Get ISO 3166-1 alpha-2 code from country name or provider code
 * Uses local metadata.json mappings (faster than external API)
 */

// Name -> ISO map (Generated from universal countries-metadata.json)
// New format: { code, name: { en, ar, ... }, region, subRegion, latitude, longitude }
const NAME_TO_ISO: Record<string, string> = {}
countriesMetadata.forEach(c => {
    // Use English name as the primary key
    if (c.name?.en && c.code) {
        NAME_TO_ISO[c.name.en.toLowerCase()] = c.code.toLowerCase()
    }
})



export function getCountryIsoCode(input: string): string | undefined {
    if (!input) return undefined
    const normalized = input.toLowerCase().trim()

    // 1. Check if it's already a 2-letter ISO code
    if (/^[a-z]{2}$/.test(normalized)) {
        return normalized
    }

    // 2. Check if it's a known country name (PRIORITY)
    const fromName = NAME_TO_ISO[normalized]
    if (fromName) return fromName

    const alias = COUNTRY_NAME_MAP[normalized]
    if (alias) {
        const fromAlias = NAME_TO_ISO[alias.toLowerCase()]
        if (fromAlias) return fromAlias
    }



    return undefined
}

/**
 * Parse a raw country name and extract base name + variant
 */
export function parseCountryName(rawName: string): { baseName: string, variant?: string } {
    const match = rawName.trim().match(VARIANT_PATTERN)
    if (match) {
        return { baseName: match[1].trim(), variant: rawName.match(/\((.+?)\)$/)?.[1] }
    }
    return { baseName: rawName.trim() }
}

/**
 * Normalize a country name to its canonical form
 * Prefers more detailed names (e.g., "Czech Republic" over "Czech")
 */
export function normalizeCountryName(rawName: string): string {
    const { baseName } = parseCountryName(rawName)
    const key = baseName.toLowerCase().trim()
    return COUNTRY_NAME_MAP[key] || baseName
}

/**
 * Choose the best (most detailed) display name from variations
 * Longer, more specific names are preferred
 */
export function getBestDisplayName(names: string[]): string {
    if (names.length === 0) return 'Unknown'
    if (names.length === 1) return names[0]

    // Sort by length descending, prefer names without (virtual) etc.
    const sorted = [...names].sort((a, b) => {
        const aIsVariant = VARIANT_PATTERN.test(a)
        const bIsVariant = VARIANT_PATTERN.test(b)

        // Prefer non-variant names
        if (aIsVariant && !bIsVariant) return 1
        if (!aIsVariant && bIsVariant) return -1

        // Then prefer longer (more detailed) names
        return b.length - a.length
    })

    return sorted[0]
}

/**
 * Full normalization: get canonical name, best display name
 */
export interface NormalizedCountry {
    canonical: string
    displayName: string
    variant?: string
}

export function normalizeCountryEntry(rawName: string): NormalizedCountry {
    const { baseName, variant } = parseCountryName(rawName)
    const canonical = normalizeCountryName(baseName)

    return {
        canonical,
        displayName: canonical,
        variant
    }
}

/**
 * Group countries by their canonical name for aggregation
 */
export interface AggregatedCountry {
    canonicalName: string
    displayName: string
    rawNames: string[]
    variants: string[]  // Only real variants like "(virtual)" or "(2)"
    variantCount: number  // Count of actual variants
    region?: string
    subRegion?: string
    intermediateRegion?: string
    providers: Array<{
        provider: string
        externalId: string
        name: string
    }>
    lastSyncedAt: Date
}

export function aggregateCountries(
    countries: Array<{
        name: string
        provider: string
        externalId: string
        lastSyncedAt: Date | string
    }>
): AggregatedCountry[] {
    const groups = new Map<string, AggregatedCountry>()

    for (const c of countries) {
        const normalized = normalizeCountryEntry(c.name)
        const key = normalized.canonical.toLowerCase()

        if (!groups.has(key)) {
            // New metadata format: name is object with language keys
            const meta = countriesMetadata.find(cm =>
                cm.name.en.toLowerCase() === key ||
                cm.code.toLowerCase() === key
            )
            groups.set(key, {
                canonicalName: normalized.canonical,
                displayName: normalized.canonical,
                rawNames: [],
                variants: [],
                variantCount: 0,
                region: meta?.region,
                subRegion: meta?.subRegion,
                intermediateRegion: undefined, // No longer in new format
                providers: [],
                lastSyncedAt: new Date(c.lastSyncedAt)
            })
        }

        const group = groups.get(key)!

        // Add this provider's data
        group.providers.push({
            provider: c.provider,
            externalId: c.externalId,
            name: c.name
        })

        // Track raw names for display name selection
        if (!group.rawNames.includes(c.name)) {
            group.rawNames.push(c.name)
        }

        // Track REAL variants only (names with "(virtual)", "(2)", "(v)" etc.)
        if (normalized.variant && !group.variants.includes(normalized.variant)) {
            group.variants.push(normalized.variant)
        }

        // Update last synced
        const syncDate = new Date(c.lastSyncedAt)
        if (syncDate > group.lastSyncedAt) {
            group.lastSyncedAt = syncDate
        }
    }

    // Finalize display names
    for (const group of groups.values()) {
        // Use canonical name as display name (it's the clean, standard form)
        group.displayName = group.canonicalName

        // Count only real variants (virtual, numbered)
        group.variantCount = group.variants.length
    }

    // Sort by canonical name
    return Array.from(groups.values()).sort((a, b) =>
        a.canonicalName.localeCompare(b.canonicalName)
    )
}
