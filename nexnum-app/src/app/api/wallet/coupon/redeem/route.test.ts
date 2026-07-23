import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mock before any static import
vi.mock('@/lib/auth/requireUser', () => ({
    requireUser: vi.fn(),
}))

vi.mock('@/lib/payment/coupon-service', () => ({
    CouponService: {
        redeemGiftCard: vi.fn(),
    },
}))

import { POST } from './route'
import { requireUser } from '@/lib/auth/requireUser'
import { CouponService } from '@/lib/payment/coupon-service'

function makeReq(body: any = {}): Request {
    return new Request('http://localhost/api/wallet/coupon/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
}

describe('POST /api/wallet/coupon/redeem', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns 401 when user is not authenticated', async () => {
        vi.mocked(requireUser).mockResolvedValue({ userId: null, error: new Response('Unauthorized') })

        const res = await POST(makeReq({ code: 'ABC123' }) as any)
        expect(res.status).toBe(401)
        const body = await res.json()
        expect(body.success).toBe(false)
        expect(body.error).toBe('Unauthorized')
    })

    it('rejects empty body (no code) with 200 + error', async () => {
        vi.mocked(requireUser).mockResolvedValue({ userId: 'user-1', error: null })

        const res = await POST(makeReq({}) as any)
        expect(res.status).toBe(200) // route returns 200 with error per its convention
        const body = await res.json()
        expect(body.success).toBe(false)
        expect(body.error).toBe('Gift card code is required')
    })

    it('rejects when code is undefined', async () => {
        vi.mocked(requireUser).mockResolvedValue({ userId: 'user-1', error: null })

        const res = await POST(makeReq() as any)
        const body = await res.json()
        expect(body.error).toBe('Gift card code is required')
    })

    it('returns success and credit amount on valid gift card', async () => {
        vi.mocked(requireUser).mockResolvedValue({ userId: 'user-2', error: null })
        vi.mocked(CouponService.redeemGiftCard).mockResolvedValue({
            success: true,
            amount: 500,
        })

        const res = await POST(makeReq({ code: 'GIFT-500' }) as any)
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.amount).toBe(500)
        expect(CouponService.redeemGiftCard).toHaveBeenCalledWith('GIFT-500', { userId: 'user-2' })
    })

    it('propagates validation failure from coupon service', async () => {
        vi.mocked(requireUser).mockResolvedValue({ userId: 'user-3', error: null })
        vi.mocked(CouponService.redeemGiftCard).mockResolvedValue({
            success: false,
            amount: 0,
            error: 'Invalid or expired code',
        })

        const res = await POST(makeReq({ code: 'BAD' }) as any)
        const body = await res.json()
        expect(body.success).toBe(false)
        expect(body.error).toBe('Invalid or expired code')
    })

    it('rejects non-gift coupon with proper error', async () => {
        vi.mocked(requireUser).mockResolvedValue({ userId: 'user-4', error: null })
        vi.mocked(CouponService.redeemGiftCard).mockResolvedValue({
            success: false,
            amount: 0,
            error: 'This is not a gift card',
        })

        const res = await POST(makeReq({ code: 'PROMO-20OFF' }) as any)
        const body = await res.json()
        expect(body.error).toBe('This is not a gift card')
    })

    it('handles thrown errors gracefully', async () => {
        vi.mocked(requireUser).mockResolvedValue({ userId: 'user-5', error: null })
        vi.mocked(CouponService.redeemGiftCard).mockRejectedValue(new Error('db write failed'))

        const res = await POST(makeReq({ code: 'X' }) as any)
        const body = await res.json()
        expect(body.success).toBe(false)
        expect(body.error).toBe('db write failed')
    })
})
