/**
 * Origin & Referer Validation
 * 
 * Blocks requests from unauthorized origins to prevent:
 * - Cross-origin attacks
 * - Unauthorized API usage
 * - Script-based automation from other domains
 */

// Allowed origins (loaded from environment)
const getAllowedOrigins = (): string[] => {
    const origins: string[] = []

    // Primary app URL
    if (process.env.NEXT_PUBLIC_APP_URL) {
        origins.push(process.env.NEXT_PUBLIC_APP_URL)
    }

    // Add localhost for development
    if (process.env.NODE_ENV !== 'production') {
        origins.push('http://localhost:3000')
        origins.push('http://localhost:3001')
        origins.push('http://127.0.0.1:3000')
    }

    // Additional allowed origins from env (comma-separated)
    if (process.env.ALLOWED_ORIGINS) {
        origins.push(...process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()))
    }

    return origins
}

export interface OriginValidationResult {
    valid: boolean
    error?: string
    origin?: string
}

/**
 * Validate request origin
 */
export function validateOrigin(headers: Headers): OriginValidationResult {
    const origin = headers.get('origin')
    const referer = headers.get('referer')

    // For same-origin requests, origin might be null
    // Check referer as fallback
    const sourceOrigin = origin || (referer ? new URL(referer).origin : null)

    // If no origin info, be cautious
    // Some legitimate requests (like from mobile apps) might not have origin
    // We allow these but track them
    if (!sourceOrigin) {
        // Check for API key authentication - if present, allow
        const hasApiKey = headers.get('x-api-key') || headers.get('authorization')?.startsWith('Bearer nxn_')
        if (hasApiKey) {
            return { valid: true, origin: 'api-key' }
        }

        // Check Sec-Fetch headers for browser attestation
        const secFetchSite = headers.get('sec-fetch-site')
        if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
            return { valid: true, origin: 'same-origin' }
        }

        // For missing origin, we're strict in production
        if (process.env.NODE_ENV === 'production') {
            return { valid: false, error: 'Missing origin header', origin: 'unknown' }
        }

        return { valid: true, origin: 'unknown-dev' }
    }

    const allowedOrigins = getAllowedOrigins()

    // Check if origin is allowed
    if (allowedOrigins.includes(sourceOrigin)) {
        return { valid: true, origin: sourceOrigin }
    }

    // Check for wildcard subdomain patterns (e.g., *.nexnum.io)
    for (const allowed of allowedOrigins) {
        if (allowed.startsWith('*.')) {
            const domain = allowed.slice(2)
            if (sourceOrigin.endsWith(domain) || sourceOrigin.endsWith('.' + domain)) {
                return { valid: true, origin: sourceOrigin }
            }
        }
    }

    return {
        valid: false,
        error: `Origin not allowed: ${sourceOrigin}`,
        origin: sourceOrigin
    }
}

/**
 * Get client info from headers
 */
export function getClientInfo(headers: Headers) {
    return {
        ip: headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            headers.get('x-real-ip') ||
            'unknown',
        userAgent: headers.get('user-agent') || 'unknown',
        origin: headers.get('origin') || headers.get('referer') || 'unknown',
        secFetchSite: headers.get('sec-fetch-site'),
        secFetchMode: headers.get('sec-fetch-mode'),
        secFetchDest: headers.get('sec-fetch-dest')
    }
}

/**
 * Quick check if request is likely from a real browser
 */
export function looksLikeBrowser(headers: Headers): boolean {
    const userAgent = headers.get('user-agent') || ''
    const secFetchSite = headers.get('sec-fetch-site')
    const secFetchMode = headers.get('sec-fetch-mode')

    // Check for common browser UA patterns
    const browserPatterns = [
        /Mozilla\/5\.0/i,
        /Chrome\/\d+/i,
        /Firefox\/\d+/i,
        /Safari\/\d+/i,
        /Edge\/\d+/i
    ]

    const hasValidUA = browserPatterns.some(p => p.test(userAgent))

    // Modern browsers send Sec-Fetch-* headers
    const hasSecFetchHeaders = secFetchSite !== null || secFetchMode !== null

    return hasValidUA && (hasSecFetchHeaders || process.env.NODE_ENV !== 'production')
}

/**
 * List of known bot/automation tool signatures
 */
const BOT_SIGNATURES = [
    /curl\//i,
    /wget\//i,
    /python-requests/i,
    /python-urllib/i,
    /axios\//i,
    /node-fetch/i,
    /httpie/i,
    /postman/i,
    /insomnia/i,
    /go-http-client/i,
    /java\//i,
    /okhttp/i,
    /scrapy/i,
    /selenium/i,
    /puppeteer/i,
    /playwright/i,
    /headless/i
]

/**
 * Check if request looks like automated/bot traffic
 */
export function isLikelyBot(headers: Headers): boolean {
    const userAgent = headers.get('user-agent') || ''

    // Empty UA is suspicious
    if (!userAgent || userAgent.length < 10) return true

    // Check for known bot signatures
    if (BOT_SIGNATURES.some(p => p.test(userAgent))) return true

    // Check for missing browser-only headers
    const acceptLanguage = headers.get('accept-language')
    const acceptEncoding = headers.get('accept-encoding')

    // Real browsers always send these
    if (!acceptLanguage && !acceptEncoding) return true

    return false
}
