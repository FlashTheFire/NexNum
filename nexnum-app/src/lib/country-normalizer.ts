import metadata from './metadata.json'

/**
 * Country Name Normalizer & Phone Code Lookup
 */

// Provider ID → ISO Code mapping
export const PROVIDER_ID_TO_ISO: Record<string, string> = metadata.providerIdToIso

// Country Name Mapping
export const COUNTRY_NAME_MAP: Record<string, string> = metadata.countryNameMap

// Variant patterns (virtual, numbered versions)
const VARIANT_PATTERN = /^(.+?)\s*\((?:virtual|v|[0-9]+)\)$/i

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
            groups.set(key, {
                canonicalName: normalized.canonical,
                displayName: normalized.canonical,
                rawNames: [],
                variants: [],
                variantCount: 0,
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
