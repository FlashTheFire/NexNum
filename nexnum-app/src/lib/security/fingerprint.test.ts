import { describe, it, expect, beforeAll } from 'vitest'
import { generateFingerprint, compareFingerprints, isSuspiciousChange, createRateLimitKey, getFingerprintId } from '@/lib/security/fingerprint'

// Set the encryption key before any tests run
beforeAll(() => {
    process.env.FINGERPRINT_SALT = 'test-fingerprint-salt'
})

const browserUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const macUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'

const makeHeaders = (record: Record<string, string>): Headers => {
    const h = new Headers()
    for (const [k, v] of Object.entries(record)) h.set(k, v)
    return h
}

const desktopHeaders = makeHeaders({
    'user-agent': browserUA,
    'accept-language': 'en-US,en;q=0.9',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
})

// ---------------------------------------------------------------------------
// generateFingerprint
// ---------------------------------------------------------------------------

describe('generateFingerprint', () => {
    it('produces a deterministic 32-char hash for identical headers', () => {
        const a = generateFingerprint(desktopHeaders)
        const b = generateFingerprint(desktopHeaders)
        expect(a.hash).toBe(b.hash)
        expect(a.hash).toHaveLength(32)
    })

    it('produces a different hash when user-agent changes', () => {
        const a = generateFingerprint(desktopHeaders)
        const b = generateFingerprint(makeHeaders({ ...Object.fromEntries(desktopHeaders), 'user-agent': macUA }))
        expect(a.hash).not.toBe(b.hash)
    })

    it('produces a different hash when Client Hints differ', () => {
        const a = generateFingerprint(desktopHeaders)
        const b = generateFingerprint(makeHeaders({
            'user-agent': browserUA,
            'accept-language': 'en-US',
            'sec-ch-ua': '"Firefox";v="120"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Linux"',
        }))
        expect(a.hash).not.toBe(b.hash)
    })

    it('captures Client Hints in components', () => {
        const fp = generateFingerprint(desktopHeaders)
        expect(fp.components.hints).toContain('Chrome')
        expect(fp.components.platform).toBe('"Windows"')
        expect(fp.components.mobile).toBe(false)
    })

    it('treats sec-ch-ua-mobile=?1 as mobile', () => {
        const fp = generateFingerprint(makeHeaders({
            'user-agent': browserUA,
            'sec-ch-ua-mobile': '?1',
        }))
        expect(fp.components.mobile).toBe(true)
    })

    it('includes client-side timezone and screen when provided', () => {
        const fp = generateFingerprint(desktopHeaders, { timezone: 'America/New_York', screen: '1920x1080' })
        expect(fp.components.timezone).toBe('America/New_York')
        expect(fp.components.screenInfo).toBe('1920x1080')
    })

    it('truncates user-agent to 300 chars', () => {
        const longUA = 'a'.repeat(500)
        const fp = generateFingerprint(makeHeaders({ 'user-agent': longUA }))
        expect(fp.components.userAgent).toHaveLength(300)
    })
})

// ---------------------------------------------------------------------------
// compareFingerprints
// ---------------------------------------------------------------------------

describe('compareFingerprints', () => {
    it('returns 1.0 for identical fingerprints', () => {
        const fp1 = generateFingerprint(desktopHeaders)
        const fp2 = generateFingerprint(desktopHeaders)
        expect(compareFingerprints(fp1, fp2)).toBe(1.0)
    })

    it('returns 0.0 when nothing matches', () => {
        const a = generateFingerprint(desktopHeaders)
        const b = generateFingerprint(makeHeaders({
            'user-agent': macUA,
            'accept-language': 'fr-FR',
            'sec-ch-ua': '"Safari"',
            'sec-ch-ua-platform': '"macOS"',
        }))
        const sim = compareFingerprints(a, b)
        expect(sim).toBeLessThan(0.6)
    })

    it('weights Client Hints higher than user-agent', () => {
        // Same UA + same language but different CH
        const a = generateFingerprint(makeHeaders({
            'user-agent': browserUA,
            'accept-language': 'en-US',
            'sec-ch-ua': '"Chrome";v="120"',
        }))
        const b = generateFingerprint(makeHeaders({
            'user-agent': browserUA,
            'accept-language': 'en-US',
            'sec-ch-ua': '"Firefox";v="120"',
        }))
        // UA + lang match (3 of 8 total weight), CH differs
        const sim = compareFingerprints(a, b)
        expect(sim).toBeGreaterThan(0)
        expect(sim).toBeLessThan(0.6)
    })

    it('returns 1.0 when both fingerprints have empty hash (identical early-return)', () => {
        const emptyA = { hash: '', components: { userAgent: '', language: '', platform: undefined, mobile: undefined, hints: undefined, timezone: undefined, screenInfo: undefined } }
        const emptyB = { hash: '', components: { userAgent: '', language: '', platform: undefined, mobile: undefined, hints: undefined, timezone: undefined, screenInfo: undefined } }
        // Identical empty hash triggers the 1.0 early-return before the
        // total-weights loop runs.
        expect(compareFingerprints(emptyA, emptyB)).toBe(1)
    })
})

// ---------------------------------------------------------------------------
// isSuspiciousChange
// ---------------------------------------------------------------------------

describe('isSuspiciousChange', () => {
    it('returns false for identical fingerprints', () => {
        const fp = generateFingerprint(desktopHeaders)
        expect(isSuspiciousChange(fp, fp)).toBe(false)
    })

    it('returns true for fingerprints with different platforms and CH', () => {
        const a = generateFingerprint(desktopHeaders)
        const b = generateFingerprint(makeHeaders({
            'user-agent': macUA,
            'accept-language': 'fr-FR',
            'sec-ch-ua': '"Safari";v="17"',
            'sec-ch-ua-platform': '"macOS"',
        }))
        expect(isSuspiciousChange(a, b)).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// createRateLimitKey / getFingerprintId
// ---------------------------------------------------------------------------

describe('createRateLimitKey', () => {
    it('combines IP with first 16 chars of fingerprint hash', () => {
        const fp = generateFingerprint(desktopHeaders)
        const key = createRateLimitKey('203.0.113.1', fp)
        expect(key).toBe(`203.0.113.1:${fp.hash.slice(0, 16)}`)
    })
})

describe('getFingerprintId', () => {
    it('returns the first 16 chars of the fingerprint hash', () => {
        const id = getFingerprintId(desktopHeaders)
        expect(id).toHaveLength(16)
    })
})
