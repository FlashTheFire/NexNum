import metadata from '@/data/metadata.json'

/**
 * Service Identity Library
 * 
 * Central source of truth for service names, slugs, and aliases.
 */

// Aggregated Config
export const SERVICE_OVERRIDES = metadata.serviceOverrides as Record<string, {
    displayName: string;
    slugAliases?: string[];
    iconUrl?: string;
}>

export const POPULAR_SERVICES = metadata.popularServices
export const COUNTRY_NAME_MAP = metadata.countryNameMap

// Legacy/Compatibility Maps
export const CANONICAL_SERVICE_NAME_MAP: Record<string, string> = {}
export const CANONICAL_SERVICE_NAMES: Record<string, string> = {}
export const CANONICAL_DISPLAY_NAMES: Record<string, string> = {}
export const CANONICAL_SERVICE_ICONS: Record<string, string> = {}

for (const [key, config] of Object.entries(SERVICE_OVERRIDES)) {
    CANONICAL_SERVICE_NAME_MAP[key.toLowerCase()] = config.displayName
    CANONICAL_DISPLAY_NAMES[key] = config.displayName
    if (config.slugAliases) {
        for (const alias of config.slugAliases) {
            CANONICAL_SERVICE_NAMES[alias] = key
        }
    }
    if (config.iconUrl) {
        CANONICAL_SERVICE_ICONS[key] = config.iconUrl
    }
}

/**
 * Standardize a country name for consistent lookup/aggregation.
 */
export function normalizeCountryName(name: string): string {
    if (!name) return 'unknown'
    const key = name.toLowerCase().trim()
    const canonicalName = COUNTRY_NAME_MAP[key as keyof typeof COUNTRY_NAME_MAP] || name

    return canonicalName
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z\s]/g, '')
        .trim()
        .replace(/\s+/g, '')
}

/**
 * Standardize a service name.
 */
export function normalizeServiceName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim()
}

/**
 * Resolve any input string to its canonical display name.
 */
export function resolveToCanonicalName(input: string): string {
    if (!input) return ''

    // 0. Preliminary cleaning for slugs/codes
    const cleanInput = input
        .toLowerCase()
        .replace(/[_-]/g, ' ')           // india-91 -> india 91
        .replace(/\(.*\)/g, '')          // India (91) -> India
        .trim();


    // 1. Check SERVICE MAPS
    const normalizedInput = normalizeServiceName(cleanInput)
    if (CANONICAL_SERVICE_NAME_MAP[normalizedInput]) {
        return CANONICAL_SERVICE_NAME_MAP[normalizedInput]
    }

    if (CANONICAL_SERVICE_NAMES[normalizedInput]) {
        const key = CANONICAL_SERVICE_NAMES[normalizedInput]
        return CANONICAL_DISPLAY_NAMES[key] || key
    }

    // 2. Check COUNTRY MAP
    if (COUNTRY_NAME_MAP[cleanInput as keyof typeof COUNTRY_NAME_MAP]) {
        return COUNTRY_NAME_MAP[cleanInput as keyof typeof COUNTRY_NAME_MAP]
    }

    // 3. Fallback: Title Case
    return cleanInput
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}

/**
 * Convert any string to a URL-safe kebab-case slug (Derived from Name)
 */
export function getSlugFromName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
}
