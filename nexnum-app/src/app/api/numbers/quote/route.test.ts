import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from './route'

// Mock AuthGuard.requireUser to bypass next/headers dependency
const mockRequireUser = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth/guard', () => ({
    AuthGuard: { requireUser: mockRequireUser }
}))

// Mock SmartSmsRouter
const mockGetRankedProviders = vi.hoisted(() => vi.fn())
const mockGetBestRouteQuote = vi.hoisted(() => vi.fn())
vi.mock('@/lib/providers/smart-router', () => {
    class MockSmartSmsRouter {
        getRankedProviders = mockGetRankedProviders
        getBestRouteQuote = mockGetBestRouteQuote
    }
    return { SmartSmsRouter: MockSmartSmsRouter }
})

const mockUser = { id: 'user-1', email: 'test@example.com', role: 'USER' }

function makeRequest(body: Record<string, unknown>) {
    return new Request('http://localhost/api/numbers/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
}

describe('POST /api/numbers/quote', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockRequireUser.mockResolvedValue({ user: mockUser, error: null })
        mockGetRankedProviders.mockResolvedValue([
            { displayName: 'Provider A', reliability: 0.95, estimatedTime: 5000 },
            { displayName: 'Provider B', reliability: 0.90, estimatedTime: 8000 }
        ])
        mockGetBestRouteQuote.mockResolvedValue({
            topProvider: 'Provider A',
            fallbackCount: 1,
            priceRange: { min: 0.5, max: 1.0 },
            estimatedReliability: 0.95,
            providers: [{ name: 'Provider A', price: 0.5 }, { name: 'Provider B', price: 1.0 }]
        })
    })

    it('returns 401 when not authenticated', async () => {
        mockRequireUser.mockResolvedValueOnce({
            user: null,
            error: new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 })
        })

        const res = await POST(makeRequest({ country: 'US', service: 'sms' }))
        expect(res.status).toBe(401)
    })

    it('returns quote with best route when providers available', async () => {
        const res = await POST(makeRequest({ country: 'US', service: 'sms' }))
        const data = await res.json()

        expect(res.status).toBe(200)
        expect(data.success).toBe(true)
        expect(data.bestRoute).toEqual({
            provider: 'Provider A',
            reliability: 0.95,
            estimatedTime: '5000ms',
            features: ['Instant SMS', 'High Success Rate']
        })
        expect(data.alternatives).toHaveLength(1)
        expect(data.alternatives[0].provider).toBe('Provider B')
        expect(data.smartRoute).toEqual({
            enabled: true,
            topProvider: 'Provider A',
            fallbackCount: 1,
            priceRange: { min: 0.5, max: 1.0 },
            estimatedReliability: 0.95,
            providers: [{ name: 'Provider A', price: 0.5 }, { name: 'Provider B', price: 1.0 }]
        })
    })

    it('returns null bestRoute and smartRoute when no providers', async () => {
        mockGetRankedProviders.mockResolvedValueOnce([])
        mockGetBestRouteQuote.mockResolvedValueOnce(null)

        const res = await POST(makeRequest({ country: 'US', service: 'sms' }))
        const data = await res.json()

        expect(res.status).toBe(200)
        expect(data.bestRoute).toBeNull()
        expect(data.alternatives).toEqual([])
        expect(data.smartRoute).toBeNull()
    })

    it('returns only 1 alternative even when multiple providers', async () => {
        mockGetRankedProviders.mockResolvedValueOnce([
            { displayName: 'A', reliability: 0.95, estimatedTime: 5000 },
            { displayName: 'B', reliability: 0.90, estimatedTime: 8000 },
            { displayName: 'C', reliability: 0.85, estimatedTime: 10000 },
            { displayName: 'D', reliability: 0.80, estimatedTime: 12000 }
        ])

        const res = await POST(makeRequest({ country: 'US', service: 'sms' }))
        const data = await res.json()

        expect(data.alternatives).toHaveLength(2)
    })

    it('returns 500 on internal error', async () => {
        mockGetRankedProviders.mockRejectedValueOnce(new Error('router down'))

        const res = await POST(makeRequest({ country: 'US', service: 'sms' }))
        const data = await res.json()

        expect(res.status).toBe(500)
        expect(data.error).toBe('Failed to generate quote')
    })

    it('sets Cache-Control header', async () => {
        const res = await POST(makeRequest({ country: 'US', service: 'sms' }))
        expect(res.headers.get('Cache-Control')).toBe('private, max-age=10')
    })

    it('passes country and service to smartRouter', async () => {
        await POST(makeRequest({ country: 'GB', service: 'mms' }))

        expect(mockGetRankedProviders).toHaveBeenCalledWith('GB', 'mms')
        expect(mockGetBestRouteQuote).toHaveBeenCalledWith('GB', 'mms')
    })
})
