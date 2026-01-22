import { describe, it, expect } from 'vitest'
import { isCaptchaRequired } from '@/lib/security/captcha'
import { calculateHitRate } from '@/lib/monitoring/metrics'

describe('Utility Functions', () => {
    describe('calculateHitRate', () => {
        it('should return 0 when total is 0', () => {
            expect(calculateHitRate(0, 0)).toBe(0)
        })

        it('should calculate correct percentage', () => {
            expect(calculateHitRate(50, 50)).toBe(50)
            expect(calculateHitRate(1, 3)).toBe(25)
        })
    })

    describe('Environment Checks', () => {
        it('should handle captcha requirement check', () => {
            // Just verifying the function exists and runs without error
            // output depends on env vars which might vary
            const result = isCaptchaRequired()
            expect(typeof result).toBe('boolean')
        })
    })
})
