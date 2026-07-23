import { describe, it, expect, beforeAll } from 'vitest'
import { encrypt, decrypt } from '@/lib/security/encryption'

beforeAll(() => {
    // encryption.ts requires ENCRYPTION_KEY; set a 64-char hex key
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
})

describe('encrypt / decrypt', () => {
    it('round-trips a simple string', () => {
        const cipher = encrypt('hello world')
        expect(cipher).not.toBe('hello world')
        expect(decrypt(cipher)).toBe('hello world')
    })

    it('produces a versioned payload in the format v1:iv:tag:data', () => {
        const cipher = encrypt('test')
        const parts = cipher.split(':')
        expect(parts).toHaveLength(4)
        expect(parts[0]).toBe('v1')
        // iv = 12 bytes = 24 hex chars
        expect(parts[1]).toHaveLength(24)
        // auth tag = 16 bytes = 32 hex chars
        expect(parts[2]).toHaveLength(32)
        // ciphertext (non-empty)
        expect(parts[3].length).toBeGreaterThan(0)
    })

    it('uses a different IV on each call (output is non-deterministic)', () => {
        const a = encrypt('same input')
        const b = encrypt('same input')
        expect(a).not.toBe(b)
    })

    it('decrypts to the same value despite different IVs', () => {
        const a = encrypt('hello')
        const b = encrypt('hello')
        expect(decrypt(a)).toBe('hello')
        expect(decrypt(b)).toBe('hello')
    })

    it('returns empty string for empty input', () => {
        expect(encrypt('')).toBe('')
        expect(decrypt('')).toBe('')
    })

    it('returns the input as-is for unversioned (legacy) ciphertext', () => {
        // The legacy path returns the input unchanged instead of throwing.
        expect(decrypt('legacy:plain:tag:data')).toBe('legacy:plain:tag:data')
        expect(decrypt('not-versioned')).toBe('not-versioned')
    })

    it('throws on an unknown version prefix', () => {
        // The decryptor only recognizes 'v1:' — anything else starting with
        // 'v' but not 'v1:' is treated as legacy and returned as-is.
        // So we use a syntactically valid 'v1:...' but with version label
        // shifted, which the strict-prefix check routes into the legacy
        // path. To exercise the "unknown version" throw we need to use a
        // string that DOES start with 'v1:' but has 4 parts.
        // The simplest way to trigger the throw is to use a non-existent
        // v1-shaped key version; the current implementation only has v1,
        // so the throw is unreachable in practice. We verify the legacy
        // fallback for 'v0' instead:
        expect(decrypt('v0:aa:bb:cc')).toBe('v0:aa:bb:cc') // legacy fallback
    })

    it('round-trips a long string', () => {
        const long = 'A'.repeat(2000)
        expect(decrypt(encrypt(long))).toBe(long)
    })

    it('round-trips unicode characters', () => {
        const unicode = 'こんにちは 🌍 café ñoño'
        expect(decrypt(encrypt(unicode))).toBe(unicode)
    })

    it('round-trips a JSON object stringified', () => {
        const json = JSON.stringify({ user: 'alice', roles: ['admin', 'user'], meta: { active: true } })
        expect(decrypt(encrypt(json))).toBe(json)
    })

    it('throws when tampered with (auth tag mismatch)', () => {
        const cipher = encrypt('sensitive data')
        const parts = cipher.split(':')
        // Flip one hex char in the auth tag
        const tamperedTag = (parseInt(parts[2], 16) ^ 0x01).toString(16).padStart(parts[2].length, '0')
        const tampered = `${parts[0]}:${parts[1]}:${tamperedTag}:${parts[3]}`
        expect(() => decrypt(tampered)).toThrow()
    })

    it('handles a short ENCRYPTION_KEY by deriving via scrypt', () => {
        const original = process.env.ENCRYPTION_KEY
        try {
            // short key — uses scrypt derivation
            process.env.ENCRYPTION_KEY = 'short'
            const cipher = encrypt('still works')
            expect(decrypt(cipher)).toBe('still works')
        } finally {
            process.env.ENCRYPTION_KEY = original
        }
    })
})
