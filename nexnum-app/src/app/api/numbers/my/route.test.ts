import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/core/db', () => ({
    prisma: {
        number: { findMany: vi.fn(), count: vi.fn() },
    },
}))

vi.mock('@/lib/auth/jwt', () => ({
    getCurrentUser: vi.fn(),
}))

vi.mock('@/lib/sms/sync', () => ({
    syncUserNumbers: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/search/search', () => ({
    getServiceIconUrlByName: vi.fn().mockResolvedValue('https://cdn.example.com/icon.png'),
}))

vi.mock('@/lib/normalizers/country-flags', () => ({
    getCountryFlagUrl: vi.fn().mockResolvedValue('https://cdn.example.com/flag.png'),
}))

import { GET } from './route'
import { getCurrentUser } from '@/lib/auth/jwt'
import { prisma } from '@/lib/core/db'
import { syncUserNumbers } from '@/lib/sms/sync'

function makeReq(query = ''): Request {
    return new Request(`http://localhost/api/numbers/my${query}`, {
        method: 'GET',
    })
}

const MOCK_NUMBER = {
    id: 'num-1',
    phoneNumber: '+1234567890',
    countryCode: 'US',
    countryName: 'United States',
    serviceName: 'Twilio',
    serviceCode: 'twilio',
    price: 5,
    provider: 'twilio',
    status: 'active',
    expiresAt: new Date('2025-12-31'),
    purchasedAt: new Date('2025-01-01'),
    serviceIconUrl: null,
    countryIconUrl: null,
    smsMessages: [
        { content: 'Your code is 1234', code: '1234', receivedAt: new Date('2025-06-01') },
    ],
    _count: { smsMessages: 1 },
}

describe('GET /api/numbers/my', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns 401 when user is not authenticated', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(null)

        const res = await GET(makeReq() as any)
        expect(res.status).toBe(401)
        const body = await res.json()
        expect(body.error).toBe('Unauthorized')
    })

    it('returns paginated list of user numbers (default: all statuses)', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-1' } as any)
        vi.mocked(prisma.number.findMany).mockResolvedValue([MOCK_NUMBER] as any)
        vi.mocked(prisma.number.count).mockResolvedValue(1)

        const res = await GET(makeReq() as any)
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.numbers).toHaveLength(1)
        expect(body.numbers[0].id).toBe('num-1')
        expect(body.numbers[0].smsCount).toBe(1)
        expect(body.numbers[0].latestSms.code).toBe('1234')
        expect(body.pagination.total).toBe(1)
        expect(body.pagination.totalPages).toBe(1)
    })

    it('applies status filter when provided', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-2' } as any)
        vi.mocked(prisma.number.findMany).mockResolvedValue([])
        vi.mocked(prisma.number.count).mockResolvedValue(0)

        await GET(makeReq('?status=active') as any)
        expect(prisma.number.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ ownerId: 'user-2', status: 'active' }),
            })
        )
    })

    it('does NOT apply status filter by default (fetches all statuses)', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-3' } as any)
        vi.mocked(prisma.number.findMany).mockResolvedValue([])
        vi.mocked(prisma.number.count).mockResolvedValue(0)

        await GET(makeReq() as any)
        expect(prisma.number.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ ownerId: 'user-3' }),
            })
        )
        // status should NOT be in the where clause
        const callArg = vi.mocked(prisma.number.findMany).mock.calls[0][0] as any
        expect(callArg.where).not.toHaveProperty('status')
    })

    it('respects page and limit query params', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-4' } as any)
        vi.mocked(prisma.number.findMany).mockResolvedValue([])
        vi.mocked(prisma.number.count).mockResolvedValue(42)

        const res = await GET(makeReq('?page=2&limit=10') as any)
        const body = await res.json()
        expect(body.pagination.page).toBe(2)
        expect(body.pagination.limit).toBe(10)
        expect(body.pagination.totalPages).toBe(5)
        expect(prisma.number.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ skip: 10, take: 10 })
        )
    })

    it('clamps limit to max 100', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-5' } as any)
        vi.mocked(prisma.number.findMany).mockResolvedValue([])
        vi.mocked(prisma.number.count).mockResolvedValue(0)

        await GET(makeReq('?limit=999') as any)
        expect(prisma.number.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 100 })
        )
    })

    it('triggers background sync for active numbers', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-6' } as any)
        vi.mocked(prisma.number.findMany).mockResolvedValue([MOCK_NUMBER] as any)
        vi.mocked(prisma.number.count).mockResolvedValue(1)

        await GET(makeReq() as any)
        // syncUserNumbers is called in background (not awaited)
        expect(syncUserNumbers).toHaveBeenCalledWith('user-6', { numberIds: ['num-1'] })
    })

    it('does NOT trigger sync when no numbers returned', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-7' } as any)
        vi.mocked(prisma.number.findMany).mockResolvedValue([])
        vi.mocked(prisma.number.count).mockResolvedValue(0)

        await GET(makeReq() as any)
        expect(syncUserNumbers).not.toHaveBeenCalled()
    })

    it('resolves service and country icon URLs from DB when present', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-8' } as any)
        vi.mocked(prisma.number.findMany).mockResolvedValue([
            { ...MOCK_NUMBER, serviceIconUrl: 'https://cdn.example.com/db-icon.png', countryIconUrl: 'https://cdn.example.com/db-flag.png' } as any,
        ])
        vi.mocked(prisma.number.count).mockResolvedValue(1)

        const res = await GET(makeReq() as any)
        const body = await res.json()
        // Should use DB values, not call the search/flag services
        expect(body.numbers[0].serviceIconUrl).toBe('https://cdn.example.com/db-icon.png')
        expect(body.numbers[0].countryIconUrl).toBe('https://cdn.example.com/db-flag.png')
    })

    it('falls back to search service for icons when DB values are null', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-9' } as any)
        vi.mocked(prisma.number.findMany).mockResolvedValue([MOCK_NUMBER] as any)
        vi.mocked(prisma.number.count).mockResolvedValue(1)

        const res = await GET(makeReq() as any)
        const body = await res.json()
        expect(body.numbers[0].serviceIconUrl).toBe('https://cdn.example.com/icon.png')
        expect(body.numbers[0].countryIconUrl).toBe('https://cdn.example.com/flag.png')
    })

    it('returns 500 on internal error', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-10' } as any)
        vi.mocked(prisma.number.findMany).mockRejectedValue(new Error('db down'))

        const res = await GET(makeReq() as any)
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body.error).toBe('Internal server error')
    })
})
