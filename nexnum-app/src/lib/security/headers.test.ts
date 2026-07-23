import { describe, it, expect } from 'vitest'
import { SECURITY_HEADERS, API_SECURITY_HEADERS, getCORSHeaders, createSecureAPIHeaders, applySecurityHeaders } from '@/lib/security/headers'

// ---------------------------------------------------------------------------
// SECURITY_HEADERS — page-level headers
// ---------------------------------------------------------------------------

describe('SECURITY_HEADERS', () => {
    it('contains HSTS with max-age >= 1 year', () => {
        const hsts = SECURITY_HEADERS['Strict-Transport-Security']
        expect(hsts).toMatch(/max-age=(\d+)/)
        const match = hsts!.match(/max-age=(\d+)/)!
        const maxAge = parseInt(match[1], 10)
        expect(maxAge).toBeGreaterThanOrEqual(31536000) // 1 year
    })

    it('sets X-Content-Type-Options to nosniff', () => {
        expect(SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff')
    })

    it('sets X-Frame-Options to DENY (clickjacking protection)', () => {
        expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY')
    })

    it('has a Content-Security-Policy with safe defaults', () => {
        const csp = SECURITY_HEADERS['Content-Security-Policy']
        expect(csp).toContain("default-src 'self'")
        expect(csp).toContain("frame-ancestors 'none'")
        expect(csp).toContain("base-uri 'self'")
        expect(csp).toContain("form-action 'self'")
    })

    it('CSP disallows object/embed sources', () => {
        const csp = SECURITY_HEADERS['Content-Security-Policy']
        // The CSP we use doesn't whitelist object-src, so it falls back to default-src 'self'
        expect(csp).not.toMatch(/object-src\s+[\*'"]/)  // not unrestricted
    })

    it('Referrer-Policy is strict-origin-when-cross-origin', () => {
        expect(SECURITY_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    })

    it('Permissions-Policy disables dangerous features', () => {
        const pp = SECURITY_HEADERS['Permissions-Policy']
        expect(pp).toContain('geolocation=()')
        expect(pp).toContain('camera=()')
        expect(pp).toContain('microphone=()')
    })
})

// ---------------------------------------------------------------------------
// API_SECURITY_HEADERS — JSON response headers
// ---------------------------------------------------------------------------

describe('API_SECURITY_HEADERS', () => {
    it('sets X-Content-Type-Options: nosniff', () => {
        expect(API_SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff')
    })

    it('sets Cache-Control to no-store (no caching of API responses)', () => {
        expect(API_SECURITY_HEADERS['Cache-Control']).toContain('no-store')
    })

    it('sets Pragma: no-cache (HTTP/1.0 backward compat)', () => {
        expect(API_SECURITY_HEADERS['Pragma']).toBe('no-cache')
    })
})

// ---------------------------------------------------------------------------
// getCORSHeaders — CORS configuration
// ---------------------------------------------------------------------------

describe('getCORSHeaders', () => {
    it('returns the standard CORS method set', () => {
        const headers = getCORSHeaders()
        expect(headers['Access-Control-Allow-Methods']).toBe('GET, POST, PUT, DELETE, OPTIONS')
    })

    it('exposes the CSRF + signature + API-key headers', () => {
        const headers = getCORSHeaders()
        expect(headers['Access-Control-Allow-Headers']).toContain('X-CSRF-Token')
        expect(headers['Access-Control-Allow-Headers']).toContain('X-API-Key')
        expect(headers['Access-Control-Allow-Headers']).toContain('X-Signature')
    })

    it('enables credentials', () => {
        expect(getCORSHeaders()['Access-Control-Allow-Credentials']).toBe('true')
    })

    it('sets max-age to 24 hours', () => {
        expect(getCORSHeaders()['Access-Control-Max-Age']).toBe('86400')
    })

    it('returns empty Allow-Origin when no origin provided', () => {
        const headers = getCORSHeaders()
        expect(headers['Access-Control-Allow-Origin']).toBe('')
    })

    it('returns empty Allow-Origin when origin is not in the allow-list', () => {
        const headers = getCORSHeaders('https://evil.example.com')
        expect(headers['Access-Control-Allow-Origin']).toBe('')
    })
})

// ---------------------------------------------------------------------------
// createSecureAPIHeaders — JSON response helper
// ---------------------------------------------------------------------------

describe('createSecureAPIHeaders', () => {
    it('sets Content-Type to application/json', () => {
        const headers = createSecureAPIHeaders()
        expect(headers.get('Content-Type')).toBe('application/json')
    })

    it('includes all API security headers', () => {
        const headers = createSecureAPIHeaders()
        expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
        expect(headers.get('X-Frame-Options')).toBe('DENY')
        expect(headers.get('Cache-Control')).toContain('no-store')
    })
})

// ---------------------------------------------------------------------------
// applySecurityHeaders — response mutator
// ---------------------------------------------------------------------------

describe('applySecurityHeaders', () => {
    it('adds security headers to an existing response', () => {
        const original = new Response('body', { status: 200 })
        const secured = applySecurityHeaders(original)
        expect(secured.headers.get('X-Content-Type-Options')).toBe('nosniff')
        expect(secured.headers.get('X-Frame-Options')).toBe('DENY')
    })

    it('preserves original status code and body', async () => {
        const original = new Response(JSON.stringify({ ok: true }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' }
        })
        const secured = applySecurityHeaders(original)
        expect(secured.status).toBe(201)
        const body = await secured.json()
        expect(body).toEqual({ ok: true })
    })

    it('preserves existing custom headers', () => {
        const original = new Response('body', {
            status: 200,
            headers: { 'X-Custom-Header': 'preserve-me' }
        })
        const secured = applySecurityHeaders(original)
        expect(secured.headers.get('X-Custom-Header')).toBe('preserve-me')
    })
})
