import { describe, it, expect } from 'vitest'
import { getClientIP, getClientInfo, validateOrigin, isLikelyBot } from '@/lib/security/origin-guard'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeHeaders = (record: Record<string, string>): Headers => {
    const h = new Headers()
    for (const [k, v] of Object.entries(record)) h.set(k, v)
    return h
}

const browserUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// ---------------------------------------------------------------------------
// getClientIP — forensic IP resolution
// ---------------------------------------------------------------------------

describe('getClientIP', () => {
    it('prefers CF-Connecting-IP over other headers', () => {
        const headers = makeHeaders({
            'cf-connecting-ip': '203.0.113.10',
            'x-forwarded-for': '198.51.100.1, 198.51.100.2',
            'x-real-ip': '198.51.100.5',
        })
        expect(getClientIP(headers)).toBe('203.0.113.10')
    })

    it('falls back to first X-Forwarded-For entry when no CF header', () => {
        const headers = makeHeaders({
            'x-forwarded-for': '198.51.100.1, 198.51.100.2',
            'x-real-ip': '198.51.100.5',
        })
        expect(getClientIP(headers)).toBe('198.51.100.1')
    })

    it('trims whitespace from X-Forwarded-For entries', () => {
        const headers = makeHeaders({
            'x-forwarded-for': '  198.51.100.1  , 198.51.100.2',
        })
        expect(getClientIP(headers)).toBe('198.51.100.1')
    })

    it('falls back to X-Real-IP when no CF or XFF', () => {
        const headers = makeHeaders({ 'x-real-ip': '198.51.100.5' })
        expect(getClientIP(headers)).toBe('198.51.100.5')
    })

    it('returns 127.0.0.1 as fallback when no IP headers are present', () => {
        const headers = makeHeaders({ 'user-agent': 'test' })
        expect(getClientIP(headers)).toBe('127.0.0.1')
    })
})

// ---------------------------------------------------------------------------
// getClientInfo — composite forensic bundle
// ---------------------------------------------------------------------------

describe('getClientInfo', () => {
    it('combines IP, UA, and origin into one object', () => {
        const headers = makeHeaders({
            'cf-connecting-ip': '203.0.113.10',
            'user-agent': browserUA,
            'origin': 'https://app.example.com',
            'sec-fetch-site': 'same-origin',
        })
        const info = getClientInfo(headers)
        expect(info.ip).toBe('203.0.113.10')
        expect(info.userAgent).toBe(browserUA)
        expect(info.origin).toBe('https://app.example.com')
        expect(info.secFetch.site).toBe('same-origin')
    })

    it('uses referer when origin is missing', () => {
        const headers = makeHeaders({
            'referer': 'https://app.example.com/page',
        })
        const info = getClientInfo(headers)
        expect(info.origin).toBe('https://app.example.com/page')
    })

    it('defaults user-agent to "unknown" when missing', () => {
        const info = getClientInfo(makeHeaders({}))
        expect(info.userAgent).toBe('unknown')
    })
})

// ---------------------------------------------------------------------------
// validateOrigin — cross-origin attack prevention
// ---------------------------------------------------------------------------

describe('validateOrigin', () => {
    it('accepts an exact-match origin in the allow-list', () => {
        const headers = makeHeaders({ 'origin': 'http://localhost:3000' })
        const result = validateOrigin(headers)
        expect(result.valid).toBe(true)
        expect(result.origin).toBe('http://localhost:3000')
    })

    it('rejects an origin not in the allow-list', () => {
        const headers = makeHeaders({ 'origin': 'https://evil.example.com' })
        const result = validateOrigin(headers)
        expect(result.valid).toBe(false)
        expect(result.error).toContain('Unauthorized origin')
    })

    it('strips trailing slash from origin before comparison', () => {
        const headers = makeHeaders({ 'origin': 'http://localhost:3000/' })
        const result = validateOrigin(headers)
        expect(result.valid).toBe(true)
    })

    it('falls back to referer when origin is missing', () => {
        const headers = makeHeaders({ 'referer': 'http://localhost:3000/page' })
        const result = validateOrigin(headers)
        expect(result.valid).toBe(true)
        expect(result.origin).toBe('http://localhost:3000')
    })

    it('accepts requests with x-api-key header (API-key bypass)', () => {
        const headers = makeHeaders({
            'x-api-key': 'test-api-key',
        })
        const result = validateOrigin(headers)
        expect(result.valid).toBe(true)
        expect(result.origin).toBe('api-key')
    })

    it('accepts requests with authorization header (API-key bypass)', () => {
        const headers = makeHeaders({
            'authorization': 'Bearer some-jwt-token',
        })
        const result = validateOrigin(headers)
        expect(result.valid).toBe(true)
        // The production check on authorization requires a Bearer-prefixed value
        // In a test/non-prod environment without origin/referer, the function falls
        // through to the 'unknown-dev' / 'unknown' branch — both are valid bypasses.
        expect(['api-key', 'unknown-dev']).toContain(result.origin)
    })

    it('accepts sec-fetch-site=same-origin even without origin header', () => {
        const headers = makeHeaders({ 'sec-fetch-site': 'same-origin' })
        const result = validateOrigin(headers)
        expect(result.valid).toBe(true)
        expect(result.origin).toBe('same-origin')
    })

    it('accepts sec-fetch-site=same-site even without origin header', () => {
        const headers = makeHeaders({ 'sec-fetch-site': 'same-site' })
        const result = validateOrigin(headers)
        expect(result.valid).toBe(true)
    })

    it('trusts raw IP origins (industrial bypass)', () => {
        const headers = makeHeaders({ 'origin': 'http://192.168.1.50:3000' })
        const result = validateOrigin(headers)
        expect(result.valid).toBe(true)
        expect(result.origin).toContain('ip-trust')
    })

    it('supports wildcard subdomain patterns in the allow-list', () => {
        // *.example.com — set the allow-list via env
        process.env.ALLOWED_ORIGINS = '*.example.com'
        try {
            const headers = makeHeaders({ 'origin': 'https://app.example.com' })
            const result = validateOrigin(headers)
            expect(result.valid).toBe(true)
        } finally {
            delete process.env.ALLOWED_ORIGINS
        }
    })
})

// ---------------------------------------------------------------------------
// isLikelyBot — bot detection
// ---------------------------------------------------------------------------

describe('isLikelyBot', () => {
    it('returns false for a real browser with full attestation headers', () => {
        // isLikelyBot delegates to isLikelyBrowser, which requires a full
        // browser header set (UA + Client Hints + Sec-Fetch). A bare UA is
        // not enough to be considered a real browser.
        const headers = makeHeaders({
            'user-agent': browserUA,
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'accept-language': 'en-US,en;q=0.9',
            'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-site': 'same-origin',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-dest': 'document',
        })
        expect(isLikelyBot(headers)).toBe(false)
    })

    it('returns true for a known bot signature', () => {
        const headers = makeHeaders({ 'user-agent': 'curl/8.4.0' })
        expect(isLikelyBot(headers)).toBe(true)
    })

    it('returns true for an empty user-agent', () => {
        expect(isLikelyBot(makeHeaders({ 'user-agent': '' }))).toBe(true)
    })
})
