import { describe, it, expect, beforeAll } from 'vitest'
import { SENSITIVE_ACTIONS, requiresElevation } from '@/lib/security/sensitive-actions'

// NOTE: These tests focus on the pure function `requiresElevation`. The
// async elevation functions (requireReauth, verifyElevation, consumeElevation)
// require DB + Redis and are out of scope for unit tests at this layer.

beforeAll(() => {
    // Set encryption key for any import side-effects
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
})

describe('SENSITIVE_ACTIONS', () => {
    it('contains the expected sensitive actions', () => {
        expect(SENSITIVE_ACTIONS).toContain('password.change')
        expect(SENSITIVE_ACTIONS).toContain('email.change')
        expect(SENSITIVE_ACTIONS).toContain('api_key.create')
        expect(SENSITIVE_ACTIONS).toContain('api_key.delete')
        expect(SENSITIVE_ACTIONS).toContain('withdrawal.request')
        expect(SENSITIVE_ACTIONS).toContain('account.delete')
        expect(SENSITIVE_ACTIONS).toContain('mfa.disable')
    })

    it('has 7 sensitive actions (frozen taxonomy)', () => {
        expect(SENSITIVE_ACTIONS).toHaveLength(7)
    })
})

describe('requiresElevation', () => {
    it('returns true for every action in the SENSITIVE_ACTIONS list', () => {
        for (const action of SENSITIVE_ACTIONS) {
            expect(requiresElevation(action)).toBe(true)
        }
    })

    it('returns false for non-sensitive actions', () => {
        expect(requiresElevation('user.login')).toBe(false)
        expect(requiresElevation('order.view')).toBe(false)
        expect(requiresElevation('profile.read')).toBe(false)
    })

    it('returns false for empty string', () => {
        expect(requiresElevation('')).toBe(false)
    })

    it('returns false for an action that looks similar but is not on the list', () => {
        // Plausibly dangerous but not in the list (caller must add explicitly)
        expect(requiresElevation('password.reset')).toBe(false)
        expect(requiresElevation('password.Reset')).toBe(false) // case-sensitive
    })
})
