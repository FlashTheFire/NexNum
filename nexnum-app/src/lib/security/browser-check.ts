/**
 * Browser Attestation
 * 
 * Validates that requests come from real browsers, not scripts/bots.
 * Uses multiple signals:
 * 1. Sec-Fetch-* headers (modern browsers only)
 * 2. User-Agent patterns
 * 3. Required browser headers
 * 4. Bot signature detection
 */

export interface BrowserCheckResult {
    isBrowser: boolean
    confidence: 'high' | 'medium' | 'low' | 'none'
    signals: {
        hasSecFetch: boolean
        hasValidUA: boolean
        hasAcceptHeaders: boolean
        isBotSignature: boolean
        hasLanguage: boolean
    }
    reason?: string
}

/**
 * Known browser User-Agent patterns
 */
const BROWSER_PATTERNS = [
    // Chrome
    /Chrome\/[\d.]+/,
    // Firefox
    /Firefox\/[\d.]+/,
    // Safari
    /Safari\/[\d.]+/,
    // Edge
    /Edg\/[\d.]+/,
    // Opera
    /OPR\/[\d.]+/,
    // Mobile browsers
    /Mobile Safari/,
    /CriOS/, // Chrome on iOS
    /FxiOS/, // Firefox on iOS
]

/**
 * Known bot/automation signatures - EXPANDED
 */
const BOT_SIGNATURES = [
    // HTTP clients
    /^curl\b/i,
    /^wget\b/i,
    /^HTTPie\b/i,
    /^PostmanRuntime\b/i,
    /^insomnia\b/i,

    // Programming languages
    /python-requests/i,
    /python-urllib/i,
    /python-httpx/i,
    /aiohttp/i,
    /axios\//i,
    /node-fetch/i,
    /got \(/i,
    /undici/i,
    /libwww-perl/i,
    /Ruby/i,
    /Go-http-client/i,
    /Java\//i,
    /okhttp/i,
    /Apache-HttpClient/i,

    // Automation tools
    /Selenium/i,
    /Puppeteer/i,
    /Playwright/i,
    /PhantomJS/i,
    /HeadlessChrome/i,
    /Nightmare/i,
    /Cypress/i,

    // Scrapers
    /Scrapy/i,
    /Googlebot/i,
    /bingbot/i,
    /Baiduspider/i,
    /YandexBot/i,
    /DuckDuckBot/i,
    /Slurp/i,
    /facebookexternalhit/i,
    /Twitterbot/i,
    /LinkedInBot/i,

    // Generic bot patterns
    /bot\b/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
]

/**
 * Perform comprehensive browser check
 */
export function checkBrowser(headers: Headers): BrowserCheckResult {
    const userAgent = headers.get('user-agent') || ''
    const acceptLanguage = headers.get('accept-language')
    const acceptEncoding = headers.get('accept-encoding')
    const accept = headers.get('accept')
    const secFetchSite = headers.get('sec-fetch-site')
    const secFetchMode = headers.get('sec-fetch-mode')
    const secFetchDest = headers.get('sec-fetch-dest')

    // Build signals
    const signals = {
        hasSecFetch: !!(secFetchSite || secFetchMode || secFetchDest),
        hasValidUA: BROWSER_PATTERNS.some(p => p.test(userAgent)) && userAgent.includes('Mozilla/5.0'),
        hasAcceptHeaders: !!(accept && acceptEncoding),
        isBotSignature: BOT_SIGNATURES.some(p => p.test(userAgent)),
        hasLanguage: !!acceptLanguage
    }

    // Empty or very short UA is suspicious
    if (!userAgent || userAgent.length < 20) {
        return {
            isBrowser: false,
            confidence: 'none',
            signals,
            reason: 'Missing or invalid User-Agent'
        }
    }

    // Known bot
    if (signals.isBotSignature) {
        return {
            isBrowser: false,
            confidence: 'high',
            signals,
            reason: 'Bot signature detected in User-Agent'
        }
    }

    // Calculate confidence
    let score = 0
    if (signals.hasSecFetch) score += 3 // Modern browsers always send these
    if (signals.hasValidUA) score += 2
    if (signals.hasAcceptHeaders) score += 1
    if (signals.hasLanguage) score += 1

    // Additional checks for modern browsers
    if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') score += 2
    if (secFetchDest === 'empty' || secFetchDest === 'document') score += 1

    let confidence: 'high' | 'medium' | 'low' | 'none'
    if (score >= 7) confidence = 'high'
    else if (score >= 5) confidence = 'medium'
    else if (score >= 3) confidence = 'low'
    else confidence = 'none'

    return {
        isBrowser: score >= 3,
        confidence,
        signals,
        reason: score < 3 ? 'Insufficient browser signals' : undefined
    }
}

/**
 * Quick check for API endpoints - less strict
 */
export function isLikelyBrowser(headers: Headers): boolean {
    const result = checkBrowser(headers)
    return result.isBrowser
}

/**
 * Strict check for sensitive endpoints
 */
export function requireRealBrowser(headers: Headers): { allowed: boolean; reason?: string } {
    const result = checkBrowser(headers)

    if (!result.isBrowser) {
        return { allowed: false, reason: result.reason || 'Browser verification failed' }
    }

    if (result.confidence === 'low' || result.confidence === 'none') {
        return { allowed: false, reason: 'Low confidence browser check' }
    }

    return { allowed: true }
}

/**
 * Get browser info for logging/analytics
 */
export function getBrowserInfo(headers: Headers): {
    userAgent: string
    browser: string
    isBot: boolean
    confidence: string
} {
    const userAgent = headers.get('user-agent') || 'unknown'
    const check = checkBrowser(headers)

    // Try to extract browser name
    let browser = 'Unknown'
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) browser = 'Chrome'
    else if (userAgent.includes('Firefox')) browser = 'Firefox'
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari'
    else if (userAgent.includes('Edg')) browser = 'Edge'
    else if (userAgent.includes('Opera') || userAgent.includes('OPR')) browser = 'Opera'

    return {
        userAgent: userAgent.slice(0, 200), // Truncate for storage
        browser,
        isBot: !check.isBrowser,
        confidence: check.confidence
    }
}
