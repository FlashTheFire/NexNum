import { describe, it, expect } from 'vitest'
import { checkBrowser, isLikelyBrowser, requireRealBrowser, getBrowserInfo } from '@/lib/security/browser-check'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const browserHeaders = (overrides: Record<string, string> = {}): Headers => {
    const h = new Headers({
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'accept-encoding': 'gzip, deflate, br',
        'sec-ch-ua': '"Google Chrome";v="120", "Chromium";v="120", "Not_A Brand";v="24"',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'document',
        ...overrides,
    })
    return h
}

const emptyHeaders = (): Headers => new Headers()

// ---------------------------------------------------------------------------
// checkBrowser — comprehensive browser attestation
// ---------------------------------------------------------------------------

describe('checkBrowser', () => {
    it('detects a fully-valid modern Chrome browser (high confidence)', () => {
        const result = checkBrowser(browserHeaders())
        expect(result.isBrowser).toBe(true)
        expect(result.confidence).toBe('high')
    })

    it('rejects an empty User-Agent (low/none confidence)', () => {
        const result = checkBrowser(browserHeaders({ 'user-agent': '' }))
        expect(result.isBrowser).toBe(false)
        expect(result.reason).toContain('User-Agent')
    })

    it('rejects a very short User-Agent', () => {
        const result = checkBrowser(browserHeaders({ 'user-agent': 'curl' }))
        expect(result.isBrowser).toBe(false)
    })

    it('detects known bot signatures (curl, wget, python-requests, etc.)', () => {
        const bots = [
            'curl/8.4.0',
            'wget/1.21.3',
            'python-requests/2.31.0',
            'PostmanRuntime/7.35.0',
            'axios/1.6.0',
            'node-fetch/1.0',
            'undici/5.0.0',
            'Java/17.0.0',
            'Go-http-client/1.1',
        ]
        for (const ua of bots) {
            const result = checkBrowser(browserHeaders({ 'user-agent': ua }))
            expect(result.isBrowser, `expected ${ua} to be rejected`).toBe(false)
            expect(result.reason, `expected ${ua} to have bot reason`).toMatch(/Bot|User-Agent/)
        }
    })

    it('detects automation tools (Selenium, Puppeteer, Playwright)', () => {
        const bots = [
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Puppeteer',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Cypress',
        ]
        for (const ua of bots) {
            const result = checkBrowser(browserHeaders({ 'user-agent': ua }))
            expect(result.isBrowser, `expected ${ua.slice(0, 40)}... to be rejected`).toBe(false)
        }
    })

    it('detects web crawlers (Googlebot, bingbot, etc.)', () => {
        const bots = [
            'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
            'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
            'facebookexternalhit/1.1',
        ]
        for (const ua of bots) {
            const result = checkBrowser(browserHeaders({ 'user-agent': ua }))
            expect(result.isBrowser, `expected ${ua.slice(0, 30)}... to be rejected`).toBe(false)
        }
    })

    it('detects when Chrome UA is present but no Client Hints at all', () => {
        // Build a Chrome UA but no sec-ch-ua header at all
        const headers = new Headers({
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'accept': 'text/html',
            'accept-encoding': 'gzip',
            'accept-language': 'en-US',
            'sec-fetch-site': 'same-origin',
        })
        const result = checkBrowser(headers)
        // Still passes (not a hard fail), but signals.hasClientHints is false
        expect(result.signals.hasClientHints).toBe(false)
    })

    it('penalizes Chrome UA when Client Hints explicitly say a different browser', () => {
        // UA claims Chrome but Client Hints claim Firefox (strong spoofing signal)
        const headers = new Headers({
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'accept': 'text/html',
            'accept-encoding': 'gzip',
            'accept-language': 'en-US',
            'sec-fetch-site': 'same-origin',
            'sec-ch-ua': '"Firefox";v="121"',
        })
        const result = checkBrowser(headers)
        // Conflict detected — should NOT be high confidence
        expect(result.confidence).not.toBe('high')
    })

    it('returns signals object with all expected fields', () => {
        const result = checkBrowser(browserHeaders())
        expect(result.signals).toHaveProperty('hasSecFetch')
        expect(result.signals).toHaveProperty('hasValidUA')
        expect(result.signals).toHaveProperty('hasAcceptHeaders')
        expect(result.signals).toHaveProperty('isBotSignature')
        expect(result.signals).toHaveProperty('hasLanguage')
    })
})

// ---------------------------------------------------------------------------
// isLikelyBrowser — quick API check
// ---------------------------------------------------------------------------

describe('isLikelyBrowser', () => {
    it('returns true for a real browser', () => {
        expect(isLikelyBrowser(browserHeaders())).toBe(true)
    })

    it('returns false for a bot', () => {
        expect(isLikelyBrowser(browserHeaders({ 'user-agent': 'curl/8.4.0' }))).toBe(false)
    })

    it('returns false for empty headers', () => {
        expect(isLikelyBrowser(emptyHeaders())).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// requireRealBrowser — strict gate for sensitive endpoints
// ---------------------------------------------------------------------------

describe('requireRealBrowser', () => {
    it('allows a high-confidence browser', () => {
        const result = requireRealBrowser(browserHeaders())
        expect(result.allowed).toBe(true)
    })

    it('rejects a bot signature', () => {
        const result = requireRealBrowser(browserHeaders({ 'user-agent': 'curl/8.4.0' }))
        expect(result.allowed).toBe(false)
        expect(result.reason).toBeDefined()
    })

    it('rejects an empty header set', () => {
        const result = requireRealBrowser(emptyHeaders())
        expect(result.allowed).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// getBrowserInfo — logging/analytics helper
// ---------------------------------------------------------------------------

describe('getBrowserInfo', () => {
    it('returns browser name for Chrome UA', () => {
        const info = getBrowserInfo(browserHeaders())
        expect(info.browser).toBe('Chrome')
        expect(info.isBot).toBe(false)
        expect(info.confidence).toBe('high')
    })

    it('returns browser name for Firefox UA', () => {
        const info = getBrowserInfo(browserHeaders({
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        }))
        expect(info.browser).toBe('Firefox')
    })

    it('returns browser name for Edge UA', () => {
        const info = getBrowserInfo(browserHeaders({
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        }))
        expect(info.browser).toBe('Edge')
    })

    it('returns Unknown browser for unrecognized UA', () => {
        const info = getBrowserInfo(browserHeaders({ 'user-agent': 'Some Random App/1.0' }))
        expect(info.browser).toBe('Unknown')
    })

    it('flags bots via isBot', () => {
        const info = getBrowserInfo(browserHeaders({ 'user-agent': 'curl/8.4.0' }))
        expect(info.isBot).toBe(true)
    })

    it('truncates userAgent at 200 chars', () => {
        const longUA = 'A'.repeat(500)
        const info = getBrowserInfo(browserHeaders({ 'user-agent': longUA }))
        expect(info.userAgent.length).toBeLessThanOrEqual(200)
    })
})
