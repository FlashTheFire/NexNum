/**
 * Security Headers Configuration
 * 
 * Defense-in-depth HTTP headers that protect against:
 * - XSS
 * - Clickjacking
 * - MIME sniffing
 * - Referrer leakage
 */

export const SECURITY_HEADERS = {
    // Enforce HTTPS
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',

    // Prevent clickjacking
    'X-Frame-Options': 'DENY',

    // XSS Protection
    'X-XSS-Protection': '1; mode=block',

    // Control referrer information
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Disable dangerous browser features
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',

    // CSP - Content Security Policy (Industrial Hardening)
    'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://hcaptcha.com https://*.hcaptcha.com", // 'unsafe-eval' needed for Next.js, 'unsafe-inline' for hydration
        "style-src 'self' 'unsafe-inline' https://hcaptcha.com https://*.hcaptcha.com",
        "img-src 'self' data: https: blob:",
        "font-src 'self' data:",
        "connect-src 'self' https://api.nowpayments.io https://*.hcaptcha.com wss: ws:",
        "frame-src 'self' https://hcaptcha.com https://*.hcaptcha.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
    ].join('; ')
}

/**
 * Headers for API responses
 */
export const API_SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store, max-age=0',
    'Pragma': 'no-cache'
}

/**
 * CORS headers for API
 */
export function getCORSHeaders(origin?: string): Record<string, string> {
    const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : ''

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-CSRF-Token, X-Signature, X-Timestamp, X-Nonce',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400' // 24 hours
    }
}

/**
 * Check if origin is allowed
 */
function isAllowedOrigin(origin: string): boolean {
    const allowed = [
        process.env.NEXT_PUBLIC_APP_URL,
        'http://localhost:3000',
        'http://localhost:3951'
    ].filter(Boolean) as string[]

    return allowed.includes(origin)
}

/**
 * Apply security headers to response
 */
export function applySecurityHeaders(response: Response): Response {
    const headers = new Headers(response.headers)
    const IS_SECURE = process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://') || false

    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        if (key === 'Strict-Transport-Security' && !IS_SECURE) continue
        headers.set(key, value)
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    })
}

/**
 * Create headers for JSON API response
 */
export function createSecureAPIHeaders(): Headers {
    const headers = new Headers()
    headers.set('Content-Type', 'application/json')

    for (const [key, value] of Object.entries(API_SECURITY_HEADERS)) {
        headers.set(key, value)
    }

    return headers
}
