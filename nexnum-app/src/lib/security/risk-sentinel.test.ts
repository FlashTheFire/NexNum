import { describe, it, expect, beforeAll } from 'vitest'
import { RiskSentinel, type RiskSignal } from '@/lib/security/risk-sentinel'
import { generateFingerprint, type DeviceFingerprint } from '@/lib/security/fingerprint'

beforeAll(() => {
    process.env.FINGERPRINT_SALT = 'test-fingerprint-salt'
})

const browserUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const makeHeaders = (record: Record<string, string>): Headers => {
    const h = new Headers()
    for (const [k, v] of Object.entries(record)) h.set(k, v)
    return h
}

const desktopHeaders = makeHeaders({
    'user-agent': browserUA,
    'accept-language': 'en-US',
    'sec-ch-ua': '"Chrome";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
})

const fp = (overrides: Partial<{ ua: string; ch: string; platform: string }> = {}): DeviceFingerprint => {
    return generateFingerprint(makeHeaders({
        'user-agent': overrides.ua ?? browserUA,
        'accept-language': 'en-US',
        'sec-ch-ua': overrides.ch ?? '"Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': overrides.platform ?? '"Windows"',
    }))
}

// ---------------------------------------------------------------------------
// RiskSentinel.assess
// ---------------------------------------------------------------------------

describe('RiskSentinel.assess', () => {
    it('returns a low-risk clean bill of health when all signals are good', () => {
        const stored = fp()
        const fresh = fp()
        const signals: RiskSignal = {
            fingerprint: fresh,
            storedFingerprint: stored,
            isBot: false,
            signatureValid: true,
            originValid: true,
            ipReputation: 0.9
        }
        const result = RiskSentinel.assess(signals)
        expect(result.level).toBe('low')
        expect(result.action).toBe('allow')
        expect(result.score).toBeLessThan(20)
    })

    it('flags new device with +5 score (low risk, allow)', () => {
        const signals: RiskSignal = {
            fingerprint: fp(),
            // no storedFingerprint → new device
            isBot: false,
            signatureValid: true,
            originValid: true,
        }
        const result = RiskSentinel.assess(signals)
        expect(result.score).toBe(5)
        expect(result.level).toBe('low')
        expect(result.factors).toContain('New Device/Fingerprint')
    })

    it('flags mismatched fingerprint with +35 and "Fingerprint Mismatch" factor', () => {
        const stored = fp({ ch: '"Chrome";v="120"' })
        const fresh = fp({ ch: '"Firefox";v="120"', platform: '"Linux"' })
        const result = RiskSentinel.assess({
            fingerprint: fresh,
            storedFingerprint: stored,
        })
        expect(result.score).toBeGreaterThanOrEqual(35)
        expect(result.factors.some(f => f.includes('Fingerprint Mismatch'))).toBe(true)
    })

    it('flags bot traffic with +50', () => {
        const result = RiskSentinel.assess({ isBot: true })
        expect(result.score).toBe(50)
        expect(result.factors).toContain('Automated Traffic Patterns (Bot Attestation)')
        expect(result.level).toBe('high')
        expect(result.action).toBe('challenge')
    })

    it('flags invalid signature with +60 → high risk', () => {
        const result = RiskSentinel.assess({ signatureValid: false })
        expect(result.score).toBe(60)
        expect(result.factors).toContain('Request Integrity Violation (Invalid Signature)')
        expect(result.level).toBe('high')
        expect(result.action).toBe('challenge')
    })

    it('flags invalid origin with +40', () => {
        const result = RiskSentinel.assess({ originValid: false })
        expect(result.score).toBe(40)
        expect(result.factors).toContain('Unauthorized Origin/Referer')
    })

    it('flags low IP reputation scaled by severity', () => {
        const result = RiskSentinel.assess({ ipReputation: 0.2 })
        expect(result.score).toBe(24) // (1 - 0.2) * 30 = 24
        expect(result.factors).toContain('Low IP Reputation')
    })

    it('classifies score >= 75 as malicious → block', () => {
        const result = RiskSentinel.assess({
            isBot: true,         // +50
            signatureValid: false, // +60 → 110 capped to 100
        })
        expect(result.score).toBe(100)
        expect(result.level).toBe('malicious')
        expect(result.action).toBe('block')
    })

    it('classifies 20-39 as suspicious → challenge', () => {
        const result = RiskSentinel.assess({
            fingerprint: fp(),
            // no storedFingerprint → +5 (just over 20 boundary via combined signals)
        })
        // 5 alone is "low"; we need to push it above 20
        const result2 = RiskSentinel.assess({
            fingerprint: fp(),
            isBot: false,
            ipReputation: 0.6, // >= 0.5 → no cost → still 5 (low)
        })
        // Push above 20 with new-device (5) + low IP rep (cost scales 0-30)
        const result3 = RiskSentinel.assess({
            fingerprint: fp(),
            ipReputation: 0.4, // (1-0.4)*30 = 18 → 5+18 = 23 → suspicious
        })
        expect(result.score).toBe(5)
        expect(result2.score).toBe(5)
        expect(result3.score).toBe(23)
        expect(result3.level).toBe('suspicious')
        expect(result3.action).toBe('challenge')
    })

    it('caps total score at 100', () => {
        const result = RiskSentinel.assess({
            isBot: true,           // +50
            signatureValid: false, // +60
            originValid: false,    // +40
        })
        expect(result.score).toBeLessThanOrEqual(100)
    })

    it('accumulates multiple factors in the factors array', () => {
        const result = RiskSentinel.assess({
            isBot: true,
            signatureValid: false,
            originValid: false,
            ipReputation: 0.1,
        })
        expect(result.factors.length).toBeGreaterThanOrEqual(3)
    })
})

// ---------------------------------------------------------------------------
// RiskSentinel.logAssessment
// ---------------------------------------------------------------------------

describe('RiskSentinel.logAssessment', () => {
    it('does not throw for clean (low) assessments', () => {
        const clean = { score: 5, level: 'low' as const, factors: [], action: 'allow' as const }
        expect(() => RiskSentinel.logAssessment('user-1', clean, {})).not.toThrow()
    })

    it('does not throw for malicious assessments', () => {
        const malicious = { score: 95, level: 'malicious' as const, factors: ['test'], action: 'block' as const }
        expect(() => RiskSentinel.logAssessment('user-1', malicious, { ip: '1.2.3.4' })).not.toThrow()
    })

    it('accepts undefined userId for guest assessments', () => {
        const guest = { score: 30, level: 'suspicious' as const, factors: ['x'], action: 'challenge' as const }
        expect(() => RiskSentinel.logAssessment(undefined, guest, {})).not.toThrow()
    })
})
