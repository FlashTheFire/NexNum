// ==============================================================================
//  NEXNUM SEARCH ENGINE CONFIGURATION
//  Clean, Minimal, Professional
// ==============================================================================

/**
 * 1. SERVICE OVERRIDES
 * Consolidated config for special service handling.
 * Format: { displayName, slugAliases?, iconUrl? }
 * 
 * Only add services that need special treatment:
 * - Different names across providers
 * - Specific icons not in DB
 * - Slug aliases for routing
 */
export const SERVICE_OVERRIDES: Record<string, {
    displayName: string;
    slugAliases?: string[];
    iconUrl?: string;
}> = {
    'twitter': {
        displayName: 'Twitter / X',
    },
    'instagram': {
        displayName: 'Instagram + Threads',
    },
    'any-other': {
        displayName: 'Any Other',
        slugAliases: ['other'],
        iconUrl: 'https://i.ibb.co/v4jQgdBT/image.png',
    },
    'tata-1mg': {
        displayName: 'Tata 1mg',
        slugAliases: ['1mg', 'bby', 'tata1mg'],
        iconUrl: 'https://grizzlysms.com/api/storage/image/50266.webp',
    },
    'tata-neu': {
        displayName: 'Tata Neu',
        slugAliases: ['ace', 'tataneu'],
        iconUrl: 'https://grizzlysms.com/api/storage/image/15663.webp',
    },
}

/**
 * 2. POPULAR SERVICES
 * Services that get a sparkle/popular badge.
 */
export const POPULAR_SERVICES = [
    'telegram', 'whatsapp', 'google', 'instagram',
    'facebook', 'tiktok', 'tinder', 'twitter', 'uber'
]

/**
 * 3. MEILISEARCH CONFIG
 * Search engine settings.
 */
export const MEILI_CONFIG = {
    synonyms: {
        'goog': ['google', 'gmail', 'youtube', 'yt'],
        'usa': ['united states', 'us', 'america'],
    },
    stopWords: ['the', 'a', 'an', 'in', 'on', 'at', 'for', 'to', 'of', 'and', 'sms', 'verification', 'code', 'verify'],
    rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness', 'stock:desc', 'lastSyncedAt:desc'],
    searchableAttributes: ['serviceName', 'serviceSlug', 'countryName', 'countryCode', 'provider', 'displayName'],
    filterableAttributes: ['serviceSlug', 'serviceName', 'countryCode', 'countryName', 'provider', 'operatorId', 'price', 'stock', 'lastSyncedAt'],
}

// ==============================================================================
//  LEGACY EXPORTS (for backward compatibility - will deprecate)
// ==============================================================================

// Extract legacy format for existing code
export const SEARCH_SYNONYMS = MEILI_CONFIG.synonyms
export const SEARCH_STOP_WORDS = MEILI_CONFIG.stopWords
export const RANKING_RULES = MEILI_CONFIG.rankingRules
export const SEARCHABLE_ATTRIBUTES = MEILI_CONFIG.searchableAttributes
export const FILTERABLE_ATTRIBUTES = MEILI_CONFIG.filterableAttributes

// Build legacy maps from SERVICE_OVERRIDES
export const CANONICAL_SERVICE_NAME_MAP: Record<string, string> = {}
export const CANONICAL_SERVICE_NAMES: Record<string, string> = {}
export const CANONICAL_DISPLAY_NAMES: Record<string, string> = {}
export const CANONICAL_SERVICE_ICONS: Record<string, string> = {}

for (const [key, config] of Object.entries(SERVICE_OVERRIDES)) {
    // Name map (lowercase key -> display name)
    CANONICAL_SERVICE_NAME_MAP[key.toLowerCase()] = config.displayName

    // Display names
    CANONICAL_DISPLAY_NAMES[key] = config.displayName

    // Slug aliases
    if (config.slugAliases) {
        for (const alias of config.slugAliases) {
            CANONICAL_SERVICE_NAMES[alias] = key
        }
    }

    // Icons
    if (config.iconUrl) {
        CANONICAL_SERVICE_ICONS[key] = config.iconUrl
    }
}
