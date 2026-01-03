/**
 * Country Name Normalizer & Phone Code Lookup
 * 
 * Handles inconsistent country naming across SMS providers:
 * - Normalizes variations to canonical names
 * - Prefers more detailed names (e.g., "Czech Republic" over "Czech")
 * - Provides phone code lookup fallbacks
 */

// Canonical name mappings - maps alternate/short names to preferred detailed names
const COUNTRY_NAME_MAP: Record<string, string> = {
    // Argentina variations
    'argentina': 'Argentina',
    'argentinas': 'Argentina',

    // Vietnam variations
    'viet nam': 'Vietnam',
    'vietnam': 'Vietnam',

    // Czech variations
    'czech': 'Czech Republic',
    'czechia': 'Czech Republic',
    'czech republic': 'Czech Republic',

    // USA variations
    'usa': 'United States',
    'us': 'United States',
    'united states': 'United States',
    'america': 'United States',

    // UK variations
    'uk': 'United Kingdom',
    'england': 'United Kingdom',
    'britain': 'United Kingdom',
    'great britain': 'United Kingdom',
    'united kingdom': 'United Kingdom',

    // Congo variations
    'congo': 'Congo',
    'dr congo': 'Congo (Dem. Republic)',
    'democratic republic of congo': 'Congo (Dem. Republic)',
    'congo (dem. republic)': 'Congo (Dem. Republic)',
    'congo (democratic republic)': 'Congo (Dem. Republic)',

    // Russia variations
    'russia': 'Russia',
    'russian federation': 'Russia',

    // China variations
    'china': 'China',
    'prc': 'China',

    // UAE variations
    'uae': 'United Arab Emirates',
    'emirates': 'United Arab Emirates',
    'united arab emirates': 'United Arab Emirates',

    // South Korea
    'korea': 'South Korea',
    'south korea': 'South Korea',
    'republic of korea': 'South Korea',

    // North Korea
    'north korea': 'North Korea',
    'dprk': 'North Korea',

    // Philippines
    'philippines': 'Philippines',
    'the philippines': 'Philippines',

    // Netherlands
    'holland': 'Netherlands',
    'netherlands': 'Netherlands',
    'the netherlands': 'Netherlands',

    // Ivory Coast / Cote d'Ivoire variations
    'ivory coast': 'Ivory Coast',
    'cote d\'ivoire': 'Ivory Coast',
    'côte d\'ivoire': 'Ivory Coast',
    'cote divoire': 'Ivory Coast',
    'cote d\'ivoire ivory coast': 'Ivory Coast',

    // Guinea-Bissau variations
    'guinea bissau': 'Guinea-Bissau',
    'guinea-bissau': 'Guinea-Bissau',
    'guineabissau': 'Guinea-Bissau',

    // Laos variations
    'laos': 'Laos',
    'lao': 'Laos',
    'lao people\'s': 'Laos',
    'lao people\'s democratic republic': 'Laos',
    'lao pdr': 'Laos',

    // Moldova variations
    'moldova': 'Moldova',
    'moldova, republic of': 'Moldova',
    'republic of moldova': 'Moldova',

    // Tanzania variations
    'tanzania': 'Tanzania',
    'tanzania, united republic of': 'Tanzania',
    'united republic of tanzania': 'Tanzania',

    // Bolivia variations
    'bolivia': 'Bolivia',
    'bolivia, plurinational state of': 'Bolivia',

    // Venezuela variations
    'venezuela': 'Venezuela',
    'venezuela, bolivarian republic of': 'Venezuela',

    // Iran variations
    'iran': 'Iran',
    'iran, islamic republic of': 'Iran',
    'islamic republic of iran': 'Iran',

    // Syria variations
    'syria': 'Syria',
    'syrian arab republic': 'Syria',
    'syrie': 'Syria',

    // Taiwan variations
    'taiwan': 'Taiwan',
    'taiwan, province of china': 'Taiwan',
    'chinese taipei': 'Taiwan',

    // Macau/Macao variations
    'macao': 'Macao',
    'macau': 'Macao',

    // Myanmar/Burma variations
    'myanmar': 'Myanmar',
    'burma': 'Myanmar',

    // Kyrgyzstan variations
    'kyrgyzstan': 'Kyrgyzstan',
    'kyrgyz republic': 'Kyrgyzstan',

    // Macedonia variations
    'north macedonia': 'North Macedonia',
    'macedonia': 'North Macedonia',
    'republic of north macedonia': 'North Macedonia',
    'fyrom': 'North Macedonia',

    // Bosnia variations
    'bosnia': 'Bosnia and Herzegovina',
    'bosnia and herzegovina': 'Bosnia and Herzegovina',
    'bosnia & herzegovina': 'Bosnia and Herzegovina',

    // Trinidad variations
    'trinidad': 'Trinidad and Tobago',
    'trinidad and tobago': 'Trinidad and Tobago',
    'trinidad & tobago': 'Trinidad and Tobago',

    // Papua New Guinea variations
    'papua new guinea': 'Papua New Guinea',
    'papua': 'Papua New Guinea',
    'papua new gvineya': 'Papua New Guinea',
    'png': 'Papua New Guinea',

    // Sri Lanka variations
    'sri lanka': 'Sri Lanka',
    'srilanka': 'Sri Lanka',

    // South Africa variations
    'south africa': 'South Africa',
    'za': 'South Africa',
    'rsa': 'South Africa',

    // Saudi Arabia variations
    'saudi arabia': 'Saudi Arabia',
    'saudi': 'Saudi Arabia',
    'ksa': 'Saudi Arabia',

    // New Zealand variations
    'new zealand': 'New Zealand',
    'nz': 'New Zealand',

    // Sierra Leone variations
    'sierra leone': 'Sierra Leone',
    'sierre lyone': 'Sierra Leone',
    'sierraleone': 'Sierra Leone',
}

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
