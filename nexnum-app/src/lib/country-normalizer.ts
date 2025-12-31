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

// Comprehensive phone codes by canonical name
const PHONE_CODES: Record<string, string> = {
    'Afghanistan': '93',
    'Albania': '355',
    'Algeria': '213',
    'Andorra': '376',
    'Angola': '244',
    'Argentina': '54',
    'Armenia': '374',
    'Australia': '61',
    'Austria': '43',
    'Azerbaijan': '994',
    'Bahrain': '973',
    'Bangladesh': '880',
    'Belarus': '375',
    'Belgium': '32',
    'Benin': '229',
    'Bolivia': '591',
    'Bosnia and Herzegovina': '387',
    'Botswana': '267',
    'Brazil': '55',
    'Bulgaria': '359',
    'Burkina Faso': '226',
    'Cambodia': '855',
    'Cameroon': '237',
    'Canada': '1',
    'Chad': '235',
    'Chile': '56',
    'China': '86',
    'Colombia': '57',
    'Congo': '242',
    'Congo (Dem. Republic)': '243',
    'Costa Rica': '506',
    'Croatia': '385',
    'Cuba': '53',
    'Cyprus': '357',
    'Czech Republic': '420',
    'Denmark': '45',
    'Dominican Republic': '1809',
    'Ecuador': '593',
    'Egypt': '20',
    'El Salvador': '503',
    'Estonia': '372',
    'Ethiopia': '251',
    'Finland': '358',
    'France': '33',
    'Gabon': '241',
    'Gambia': '220',
    'Georgia': '995',
    'Germany': '49',
    'Ghana': '233',
    'Greece': '30',
    'Guatemala': '502',
    'Guinea': '224',
    'Guinea-Bissau': '245',
    'Haiti': '509',
    'Honduras': '504',
    'Hong Kong': '852',
    'Hungary': '36',
    'Iceland': '354',
    'India': '91',
    'Indonesia': '62',
    'Iran': '98',
    'Iraq': '964',
    'Ireland': '353',
    'Israel': '972',
    'Italy': '39',
    'Ivory Coast': '225',
    'Jamaica': '1876',
    'Japan': '81',
    'Jordan': '962',
    'Kazakhstan': '7',
    'Kenya': '254',
    'Kuwait': '965',
    'Kyrgyzstan': '996',
    'Laos': '856',
    'Latvia': '371',
    'Lebanon': '961',
    'Liberia': '231',
    'Libya': '218',
    'Lithuania': '370',
    'Luxembourg': '352',
    'Macao': '853',
    'Madagascar': '261',
    'Malawi': '265',
    'Malaysia': '60',
    'Maldives': '960',
    'Mali': '223',
    'Malta': '356',
    'Mauritania': '222',
    'Mauritius': '230',
    'Mexico': '52',
    'Moldova': '373',
    'Monaco': '377',
    'Mongolia': '976',
    'Montenegro': '382',
    'Morocco': '212',
    'Mozambique': '258',
    'Myanmar': '95',
    'Namibia': '264',
    'Nepal': '977',
    'Netherlands': '31',
    'New Zealand': '64',
    'Nicaragua': '505',
    'Niger': '227',
    'Nigeria': '234',
    'North Korea': '850',
    'North Macedonia': '389',
    'Norway': '47',
    'Oman': '968',
    'Pakistan': '92',
    'Palestine': '970',
    'Panama': '507',
    'Papua New Guinea': '675',
    'Paraguay': '595',
    'Peru': '51',
    'Philippines': '63',
    'Poland': '48',
    'Portugal': '351',
    'Puerto Rico': '1787',
    'Qatar': '974',
    'Romania': '40',
    'Russia': '7',
    'Rwanda': '250',
    'Saudi Arabia': '966',
    'Senegal': '221',
    'Serbia': '381',
    'Sierra Leone': '232',
    'Singapore': '65',
    'Slovakia': '421',
    'Slovenia': '386',
    'Somalia': '252',
    'South Africa': '27',
    'South Korea': '82',
    'South Sudan': '211',
    'Spain': '34',
    'Sri Lanka': '94',
    'Sudan': '249',
    'Suriname': '597',
    'Sweden': '46',
    'Switzerland': '41',
    'Syria': '963',
    'Taiwan': '886',
    'Tajikistan': '992',
    'Tanzania': '255',
    'Thailand': '66',
    'Togo': '228',
    'Trinidad and Tobago': '1868',
    'Tunisia': '216',
    'Turkey': '90',
    'Turkmenistan': '993',
    'Uganda': '256',
    'Ukraine': '380',
    'United Arab Emirates': '971',
    'United Kingdom': '44',
    'United States': '1',
    'Uruguay': '598',
    'Uzbekistan': '998',
    'Venezuela': '58',
    'Vietnam': '84',
    'Yemen': '967',
    'Zambia': '260',
    'Zimbabwe': '263',
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
 * Get phone code for a country by its canonical name
 */
export function getPhoneCode(canonicalName: string): string | null {
    return PHONE_CODES[canonicalName] || null
}

/**
 * Get the best phone code from multiple entries
 * Prioritizes non-empty, valid phone codes
 */
export function getBestPhoneCode(codes: string[]): string {
    for (const code of codes) {
        const clean = code?.replace(/[^0-9]/g, '')
        if (clean && clean.length > 0) {
            return clean
        }
    }
    return ''
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
 * Full normalization: get canonical name, best display name, and phone code
 */
export interface NormalizedCountry {
    canonical: string
    displayName: string
    phoneCode: string
    variant?: string
}

export function normalizeCountryEntry(rawName: string, providedPhoneCode?: string): NormalizedCountry {
    const { baseName, variant } = parseCountryName(rawName)
    const canonical = normalizeCountryName(baseName)

    // Get phone code: use provided if valid, else lookup
    let phoneCode = providedPhoneCode?.replace(/[^0-9]/g, '') || ''
    if (!phoneCode) {
        phoneCode = getPhoneCode(canonical) || ''
    }

    return {
        canonical,
        displayName: canonical,
        phoneCode,
        variant
    }
}

/**
 * Group countries by their canonical name for aggregation
 */
export interface AggregatedCountry {
    canonicalName: string
    displayName: string
    phoneCode: string
    rawNames: string[]
    variants: string[]  // Only real variants like "(virtual)" or "(2)"
    variantCount: number  // Count of actual variants
    providers: Array<{
        provider: string
        externalId: string
        name: string
        phoneCode: string
    }>
    lastSyncedAt: Date
}

export function aggregateCountries(
    countries: Array<{
        name: string
        phoneCode: string
        provider: string
        externalId: string
        lastSyncedAt: Date | string
    }>
): AggregatedCountry[] {
    const groups = new Map<string, AggregatedCountry>()

    for (const c of countries) {
        const normalized = normalizeCountryEntry(c.name, c.phoneCode)
        const key = normalized.canonical.toLowerCase()

        if (!groups.has(key)) {
            groups.set(key, {
                canonicalName: normalized.canonical,
                displayName: normalized.canonical,
                phoneCode: normalized.phoneCode,
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
            name: c.name,
            phoneCode: c.phoneCode
        })

        // Track raw names for display name selection
        if (!group.rawNames.includes(c.name)) {
            group.rawNames.push(c.name)
        }

        // Track REAL variants only (names with "(virtual)", "(2)", "(v)" etc.)
        if (normalized.variant && !group.variants.includes(normalized.variant)) {
            group.variants.push(normalized.variant)
        }

        // Update best phone code
        if (!group.phoneCode && normalized.phoneCode) {
            group.phoneCode = normalized.phoneCode
        }

        // Update last synced
        const syncDate = new Date(c.lastSyncedAt)
        if (syncDate > group.lastSyncedAt) {
            group.lastSyncedAt = syncDate
        }
    }

    // Finalize display names and phone codes
    for (const group of groups.values()) {
        // Use canonical name as display name (it's the clean, standard form)
        group.displayName = group.canonicalName

        // Count only real variants (virtual, numbered)
        group.variantCount = group.variants.length

        // If still no phone code, try lookup by canonical name
        if (!group.phoneCode) {
            group.phoneCode = getPhoneCode(group.canonicalName) || ''
        }
    }

    // Sort by canonical name
    return Array.from(groups.values()).sort((a, b) =>
        a.canonicalName.localeCompare(b.canonicalName)
    )
}
