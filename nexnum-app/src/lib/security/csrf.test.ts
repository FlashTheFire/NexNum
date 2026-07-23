import { describe, it, expect } from 'vitest'
import { validateCSRFToken, requiresCSRF, generateCSRFToken } from '@/lib/security/csrf'

// ---------------------------------------------------------------------------
// validateCSRFToken — token structure & signature
// ---------------------------------------------------------------------------

describe('validateCSRFToken', () => {
    it('returns false for empty token', () => {
        expect(validateCSRFToken('')).toBe(false)
    })

    it('returns false for token with wrong number of parts', () => {
        expect(validateCSRFToken('only-one-part')).toBe(false)
        expect(validateCSRFToken('two.parts')).toBe(false)
        expect(validateCSRFToken('a.b.c.d')).toBe(false)
    })

    it('returns false for token with tampered signature', () => {
        const token = generateCSRFToken()
        const parts = token.split('.')
        const tampered = `${parts[0]}.${parts[1]}.${'0'.repeat(parts[2].length)}`
        expect(validateCSRFToken(tampered)).toBe(false)
    })

    it('returns false for token with tampered random portion', () => {
        const token = generateCSRFToken()
        const parts = token.split('.')
        const tampered = `${parts[0]}.${'f'.repeat(parts[1].length)}.${parts[2]}`
        expect(validateCSRFToken(tampered)).toBe(false)
    })

    it('returns false for token with tampered timestamp portion', () => {
        const token = generateCSRFToken()
        const parts = token.split('.')
        const tampered = `${parseInt(parts[0], 10) - 1000000}.${parts[1]}.${parts[2]}`
        expect(validateCSRFToken(tampered)).toBe(false)
    })

    it('returns false for expired token (timestamp > 1 hour ago)', () => {
        // Generate a token, then back-date its timestamp to > 1 hour ago
        const token = generateCSRFToken()
        const parts = token.split('.')
        const oldTimestamp = Date.now() - 2 * 60 * 60 * 1000 // 2 hours ago
        // Re-sign the back-dated payload so signature verification alone doesn't fail first
        const crypto = require('crypto')
        const SECRET = process.env.CSRF_SECRET || process.env.JWT_SECRET || 'dev-csrf-secret'
        const payload = `${oldTimestamp}.${parts[1]}`
        const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
        const expiredToken = `${payload}.${signature}`

        expect(validateCSRFToken(expiredToken)).toBe(false)
    })

    it('returns true for freshly generated token', () => {
        const token = generateCSRFToken()
        expect(validateCSRFToken(token)).toBe(true)
    })

    it('returns false for token signed with different secret', () => {
        const timestamp = Date.now()
        const random = 'a'.repeat(64)
        const crypto = require('crypto')
        const signature = crypto.createHmac('sha256', 'wrong-secret').update(`${timestamp}.${random}`).digest('hex')
        const token = `${timestamp}.${random}.${signature}`
        expect(validateCSRFToken(token)).toBe(false)
    })

    it('handles non-numeric timestamp gracefully', () => {
        const token = `notanumber.${'a'.repeat(64)}.signature`
        expect(validateCSRFToken(token)).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// requiresCSRF — method gating
// ---------------------------------------------------------------------------

describe('requiresCSRF', () => {
    it('returns true for state-changing methods', () => {
        expect(requiresCSRF('POST')).toBe(true)
        expect(requiresCSRF('PUT')).toBe(true)
        expect(requiresCSRF('DELETE')).toBe(true)
        expect(requiresCSRF('PATCH')).toBe(true)
    })

    it('returns true for lowercase method names', () => {
        expect(requiresCSRF('post')).toBe(true)
        expect(requiresCSRF('put')).toBe(true)
        expect(requiresCSRF('delete')).toBe(true)
        expect(requiresCSRF('patch')).toBe(true)
    })

    it('returns false for safe methods', () => {
        expect(requiresCSRF('GET')).toBe(false)
        expect(requiresCSRF('HEAD')).toBe(false)
        expect(requiresCSRF('OPTIONS')).toBe(false)
    })

    it('returns false for unknown methods', () => {
        expect(requiresCSRF('TRACE')).toBe(false)
        expect(requiresCSRF('CONNECT')).toBe(false)
        expect(requiresCSRF('FOOBAR')).toBe(false)
    })
})
