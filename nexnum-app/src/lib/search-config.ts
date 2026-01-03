
// Professional Search Configuration
// Defines synonyms, stop words, and ranking rules for the "Deep Search" engine.

export const SEARCH_SYNONYMS = {
    // Social Media
    'fb': ['facebook'],
    'facebook': ['fb'],
    'ig': ['instagram', 'insta'],
    'instagram': ['ig', 'insta'],
    'insta': ['instagram', 'ig'],
    'tg': ['telegram'],
    'telegram': ['tg'],
    'wa': ['whatsapp'],
    'whatsapp': ['wa'],
    'vk': ['vkontakte'],
    'vkontakte': ['vk'],
    'dc': ['discord'],
    'discord': ['dc'],
    'tw': ['twitter', 'x'],
    'twitter': ['tw', 'x'],

    // E-commerce / Tech
    'amz': ['amazon'],
    'amazon': ['amz'],
    'pp': ['paypal'],
    'paypal': ['pp'],
    'goog': ['google', 'gmail'],
    'google': ['goog', 'gmail', 'yt', 'youtube'],
    'gmail': ['google'],
    'yt': ['youtube', 'google'],
    'youtube': ['yt', 'google'],
    'ms': ['microsoft', 'outlook', 'hotmail'],
    'microsoft': ['ms', 'outlook'],

    // Regions
    'usa': ['united states', 'us'],
    'us': ['united states', 'usa'],
    'uk': ['united kingdom', 'england', 'gb'],
    'united kingdom': ['uk', 'gb'],
    'ru': ['russia'],
    'russia': ['ru'],
}

export const SEARCH_STOP_WORDS = [
    'the', 'a', 'an', 'in', 'on', 'at', 'for', 'to', 'of', 'and'
]

// Ordered ranking rules for professional results
export const RANKING_RULES = [
    'words',      // Number of matched words
    'typo',       // Typo tolerance
    'proximity',  // Words close to each other
    'attribute',  // Match in important attributes (Name > Description)
    'sort',       // Custom sort (Price, Stock)
    'exactness',  // Exact match
    // Custom: Prioritize items with high stock (availability)
    'stock:desc',
    // Custom: Prioritize newer items (freshness)
    'lastSyncedAt:desc'
]

// Attributes to search, ordered by importance
export const SEARCHABLE_ATTRIBUTES = [
    'serviceName', // Highest priority
    'serviceSlug',
    'countryName',
    'countryCode',
    'provider',
    'displayName'
]

// Attributes allowed for filtering
export const FILTERABLE_ATTRIBUTES = [
    'serviceSlug',
    'countryCode',
    'provider',
    'price',
    'stock',
    'lastSyncedAt'
]
