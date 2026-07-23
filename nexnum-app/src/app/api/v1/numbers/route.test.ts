import { describe, it, expect, vi, beforeEach } from 'vitest'

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

vi.mock('@/lib/core/db', () => ({
    prisma: {
        number: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
    },
}))

import { GET } from './route'
import { authenticateApiKey } from '@/lib/api/api-middleware'
import { prisma } from '@/lib/core/db'

function makeReq(query = ''): Request {
    return new Request(`http://localhost/api/v1/numbers${query}`, {
        method: 'GET',
        headers: { Authorization: 'Bearer sk_test_abc' },
    })
}

const MOCK_NUMBERS = [
    {
        id: 'num-1',
        phoneNumber: '+1234567890',
        phoneCountryCode: '1',
        phoneNationalNumber: '234567890',
        countryCode: 'US',
        countryName: 'United States',
        serviceCode: 'twilio',
        serviceName: 'Twilio',
        price: 5,
        status: 'active',
        expiresAt: new Date('2025-12-31'),
        createdAt: new Date('2025-01-01'),
        smsMessages: [
            { sender: 'Bank', content: 'Your code is 1234', code: '1234', receivedAt: new Date('2025-06-01') },
        ],
    },
]

describe('GET /api/v1/numbers', () => {
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

    it('returns paginated list of active/reserved numbers for authenticated user', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-1', permissions: [], apiKey: { id: 'k1' } as any },
        })
        vi.mocked(prisma.number.findMany).mockResolvedValue(MOCK_NUMBERS as any)
        vi.mocked(prisma.number.count).mockResolvedValue(1)

        const res = await GET(makeReq('?page=1&limit=20') as any)
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.numbers).toHaveLength(1)
        expect(body.data.numbers[0].id).toBe('num-1')
        expect(body.data.numbers[0].parsed.countryCode).toBe('1')
        expect(body.data.numbers[0].country.name).toBe('United States')
        expect(body.data.numbers[0].service.name).toBe('Twilio')
        expect(body.data.pagination.page).toBe(1)
        expect(body.data.pagination.total).toBe(1)
        expect(body.data.pagination.totalPages).toBe(1)
    })

    it('respects page and limit query params', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-2', permissions: [], apiKey: { id: 'k2' } as any },
        })
        vi.mocked(prisma.number.findMany).mockResolvedValue([])
        vi.mocked(prisma.number.count).mockResolvedValue(50)

        const res = await GET(makeReq('?page=3&limit=10') as any)
        const body = await res.json()
        expect(body.data.pagination.page).toBe(3)
        expect(body.data.pagination.limit).toBe(10)
        expect(body.data.pagination.totalPages).toBe(5)

        // Verify offset was computed correctly (page 3, limit 10 → skip 20)
        expect(prisma.number.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ skip: 20, take: 10 })
        )
    })

    it('clamps limit to max 100', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-3', permissions: [], apiKey: { id: 'k3' } as any },
        })
        vi.mocked(prisma.number.findMany).mockResolvedValue([])
        vi.mocked(prisma.number.count).mockResolvedValue(0)

        await GET(makeReq('?limit=500') as any)
        expect(prisma.number.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 100 })
        )
    })

    it('only fetches active and reserved numbers (status filter)', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-4', permissions: [], apiKey: { id: 'k4' } as any },
        })
        vi.mocked(prisma.number.findMany).mockResolvedValue([])
        vi.mocked(prisma.number.count).mockResolvedValue(0)

        await GET(makeReq() as any)
        expect(prisma.number.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    ownerId: 'user-4',
                    status: { in: ['active', 'reserved'] },
                }),
            })
        )
    })

    it('includes latest 10 SMS messages per number', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-5', permissions: [], apiKey: { id: 'k5' } as any },
        })
        vi.mocked(prisma.number.findMany).mockResolvedValue(MOCK_NUMBERS as any)
        vi.mocked(prisma.number.count).mockResolvedValue(1)

        await GET(makeReq() as any)
        expect(prisma.number.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                select: expect.objectContaining({
                    smsMessages: expect.objectContaining({ take: 10 }),
                }),
            })
        )
    })

    it('returns empty list when user has no numbers', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-6', permissions: [], apiKey: { id: 'k6' } as any },
        })
        vi.mocked(prisma.number.findMany).mockResolvedValue([])
        vi.mocked(prisma.number.count).mockResolvedValue(0)

        const res = await GET(makeReq() as any)
        const body = await res.json()
        expect(body.data.numbers).toEqual([])
        expect(body.data.pagination.total).toBe(0)
        expect(body.data.pagination.totalPages).toBe(0)
    })
})
