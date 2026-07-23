import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks must be hoisted
vi.mock('@/lib/api/api-middleware', () => ({
    authenticateApiKey: vi.fn(),
    apiSuccess: (data: any, status = 200) =>
        new Response(JSON.stringify({ success: true, data }), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
    apiError: (msg: string, status: number) =>
        new Response(JSON.stringify({ success: false, error: msg }), {
            status,
            headers: { 'Content-Type': 'application/json' },
        }),
}))

vi.mock('@/lib/cache/user-cache', () => ({
    getCachedBalance: vi.fn(),
}))

vi.mock('@/lib/monitoring/metrics', () => ({
    metrics: {
        recordTiming: vi.fn(),
        increment: vi.fn(),
    },
    METRIC: {
        DB_QUERY_TIME: 'db_query_time',
        ERROR_COUNT: 'error_count',
    },
    trackCacheHit: vi.fn(),
}))

import { GET } from './route'
import { authenticateApiKey } from '@/lib/api/api-middleware'
import { getCachedBalance } from '@/lib/cache/user-cache'
import { metrics, METRIC, trackCacheHit } from '@/lib/monitoring/metrics'

function makeReq(apiKey = 'sk_test_abc'): Request {
    return new Request('http://localhost/api/v1/balance', {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
    })
}

describe('GET /api/v1/balance', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns 401 when API key authentication fails', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: false,
            error: new Response(JSON.stringify({ success: false, error: 'Invalid API key' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            }) as any,
        })

        const res = await GET(makeReq() as any)
        expect(res.status).toBe(401)
    })

    it('returns balance with cache MISS marker on first call', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-1', permissions: [], apiKey: { id: 'k1' } as any },
        })
        vi.mocked(getCachedBalance).mockResolvedValue({
            balance: 5000,
            currency: 'USD',
            displayAmount: 1.0,
            displayCurrency: 'USD',
            fromCache: false,
        })

        const res = await GET(makeReq() as any)
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.balance).toBe(5000)
        expect(body.data._meta.cached).toBe(false)
        expect(trackCacheHit).toHaveBeenCalledWith(false)
    })

    it('returns balance with cache HIT marker when served from cache', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-2', permissions: [], apiKey: { id: 'k2' } as any },
        })
        vi.mocked(getCachedBalance).mockResolvedValue({
            balance: 1234,
            currency: 'INR',
            displayAmount: 83.0,
            displayCurrency: 'INR',
            fromCache: true,
        })

        const res = await GET(makeReq() as any)
        const body = await res.json()
        expect(body.data._meta.cached).toBe(true)
        expect(body.data.currency).toBe('INR')
        expect(trackCacheHit).toHaveBeenCalledWith(true)
    })

    it('records DB query timing metric on success', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-3', permissions: [], apiKey: { id: 'k3' } as any },
        })
        vi.mocked(getCachedBalance).mockResolvedValue({
            balance: 0,
            currency: 'USD',
            displayAmount: 0,
            displayCurrency: 'USD',
            fromCache: false,
        })

        await GET(makeReq() as any)
        expect(metrics.recordTiming).toHaveBeenCalledWith(METRIC.DB_QUERY_TIME, expect.any(Number))
    })

    it('returns 500 with error counter on internal failure', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-4', permissions: [], apiKey: { id: 'k4' } as any },
        })
        vi.mocked(getCachedBalance).mockRejectedValue(new Error('redis dead'))

        const res = await GET(makeReq() as any)
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body.error).toBe('Failed to retrieve balance')
        expect(metrics.increment).toHaveBeenCalledWith(METRIC.ERROR_COUNT)
    })

    it('does not leak auth context (only forwards userId to cache lookup)', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-5', permissions: [], apiKey: { id: 'k5' } as any },
        })
        vi.mocked(getCachedBalance).mockResolvedValue({
            balance: 1,
            currency: 'USD',
            displayAmount: 0,
            displayCurrency: 'USD',
            fromCache: false,
        })

        await GET(makeReq() as any)
        // Only userId passed to cache, not the apiKey or permissions
        expect(getCachedBalance).toHaveBeenCalledWith('user-5')
    })
})
