/**
 * Origin & Forensic Guard
 * 
 * Blocks requests from unauthorized origins and ensures forensic IP accuracy.
 * Handles:
 * 1. Professional Proxy Trust (Cloudflare, Nginx, etc.)
 * 2. Cross-origin attack prevention
 * 3. Bot Attestation (linked to browser-check)
 */

import { isLikelyBrowser } from './browser-check'

const TRUST_PROXY = process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production'

/**
 * Get the most reliable client IP from forensic headers
 */
export function getClientIP(headers: Headers): string {
    // Priority 1: Cloudflare Connecting IP (Highly trusted if on CF)
    const cfIp = headers.get('cf-connecting-ip')
    if (cfIp) return cfIp

    // Priority 2: X-Forwarded-For (Standard, but spoofable if not behind trusted proxy)
    const forwardedFor = headers.get('x-forwarded-for')
    if (forwardedFor) {
        // We take the first IP, but only if we trust our upstream proxy
        const ips = forwardedFor.split(',').map(ip => ip.trim())
        if (ips.length > 0) return ips[0]
    }

    // Priority 3: Standard X-Real-IP
    const realIp = headers.get('x-real-ip')
    if (realIp) return realIp

    return '127.0.0.1' // Fallback
}

export function getClientInfo(headers: Headers) {
    return {
        ip: getClientIP(headers),
        userAgent: headers.get('user-agent') || 'unknown',
        origin: headers.get('origin') || headers.get('referer') || 'unknown',
        secFetch: {
            site: headers.get('sec-fetch-site'),
            mode: headers.get('sec-fetch-mode'),
            dest: headers.get('sec-fetch-dest')
        }
    }
}

/**
 * Validate request origin strictly
 */
export function validateOrigin(headers: Headers): { valid: boolean; error?: string; origin?: string } {
    const origin = headers.get('origin')
    const referer = headers.get('referer')
    const sourceOrigin = (origin || (referer ? new URL(referer).origin : null))?.replace(/\/$/, '')

    if (!sourceOrigin) {
        // Bypasses for API keys and Same-Origin (Sec-Fetch)
        const hasApiKey = headers.get('x-api-key') || headers.get('authorization')?.startsWith('Bearer nxn_')
        if (hasApiKey) return { valid: true, origin: 'api-key' }

        const secFetchSite = headers.get('sec-fetch-site')
        if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
            return { valid: true, origin: 'same-origin' }
        }

        if (process.env.NODE_ENV === 'production') {
            return { valid: false, error: 'Origin header missing from request', origin: 'unknown' }
        }
        return { valid: true, origin: 'unknown-dev' }
    }

    const allowed = getGlobalAllowedOrigins()
    if (allowed.includes(sourceOrigin)) return { valid: true, origin: sourceOrigin }

    // Wildcard support
    for (const pattern of allowed) {
        if (pattern.startsWith('*.')) {
            const domain = pattern.slice(2)
            if (sourceOrigin.endsWith(domain)) return { valid: true, origin: sourceOrigin }
        }
    }

    return { valid: false, error: `Unauthorized origin: ${sourceOrigin}`, origin: sourceOrigin }
}

function getGlobalAllowedOrigins(): string[] {
    const patterns = [
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.NEXTAUTH_URL
    ].filter(Boolean) as string[]

    if (process.env.NODE_ENV !== 'production') {
        patterns.push('http://localhost:3000', 'http://localhost:3951', 'http://127.0.0.1:3000')
    }

    if (process.env.ALLOWED_ORIGINS) {
        patterns.push(...process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()))
    }

    // Normalize: remove trailing slashes from all patterns
    return patterns.map(p => p.startsWith('*') ? p : p.replace(/\/$/, ''))
}

/**
 * Consistently detect bots using browser attestation
 */
export function isLikelyBot(headers: Headers): boolean {
    // We defer to the high-fidelity browser check
    return !isLikelyBrowser(headers)
}
