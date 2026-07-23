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
        smsMessage: { findMany: vi.fn() },
    },
}))

import { GET } from './route'
import { authenticateApiKey } from '@/lib/api/api-middleware'
import { prisma } from '@/lib/core/db'

function makeReq(query = ''): Request {
    return new Request(`http://localhost/api/v1/sms${query}`, {
        method: 'GET',
        headers: { Authorization: 'Bearer sk_test_abc' },
    })
}

const MOCK_MESSAGES = [
    {
        id: 'sms-1',
        receivedAt: new Date('2025-06-01T10:00:00Z'),
        sender: 'Bank',
        content: 'Your code is 1234',
        code: '1234',
        numberId: 'num-1',
        number: {
            phoneNumber: '+1234567890',
            phoneCountryCode: '1',
            phoneNationalNumber: '234567890',
            serviceName: 'Twilio',
            countryName: 'United States',
        },
    },
    {
        id: 'sms-2',
        receivedAt: new Date('2025-06-01T11:00:00Z'),
        sender: 'Auth',
        content: 'Login code 5678',
        code: '5678',
        numberId: 'num-1',
        number: {
            phoneNumber: '+1234567890',
            phoneCountryCode: '1',
            phoneNationalNumber: '234567890',
            serviceName: 'Twilio',
            countryName: 'United States',
        },
    },
]

describe('GET /api/v1/sms', () => {
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

    it('returns recent SMS messages for authenticated user', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-1', permissions: [], apiKey: { id: 'k1' } as any },
        })
        vi.mocked(prisma.smsMessage.findMany).mockResolvedValue(MOCK_MESSAGES as any)

        const res = await GET(makeReq() as any)
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.success).toBe(true)
        expect(body.data.messages).toHaveLength(2)
        expect(body.data.messages[0].sender).toBe('Bank')
        expect(body.data.messages[0].code).toBe('1234')
        expect(body.data.messages[0].number.service).toBe('Twilio')
        expect(body.data.messages[0].number.country).toBe('United States')
    })

    it('filters by numberId when provided', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-2', permissions: [], apiKey: { id: 'k2' } as any },
        })
        vi.mocked(prisma.smsMessage.findMany).mockResolvedValue([MOCK_MESSAGES[0]] as any)

        const res = await GET(makeReq('?numberId=num-1') as any)
        const body = await res.json()
        expect(body.data.messages).toHaveLength(1)

        expect(prisma.smsMessage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    numberId: 'num-1',
                    number: { ownerId: 'user-2' },
                }),
            })
        )
    })

    it('respects limit param, clamped to max 100', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-3', permissions: [], apiKey: { id: 'k3' } as any },
        })
        vi.mocked(prisma.smsMessage.findMany).mockResolvedValue([])

        await GET(makeReq('?limit=200') as any)
        expect(prisma.smsMessage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 100 })
        )
    })

    it('defaults limit to 50 when not specified', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-4', permissions: [], apiKey: { id: 'k4' } as any },
        })
        vi.mocked(prisma.smsMessage.findMany).mockResolvedValue([])

        await GET(makeReq() as any)
        expect(prisma.smsMessage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 50 })
        )
    })

    it('only returns messages for numbers owned by the authenticated user', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-5', permissions: [], apiKey: { id: 'k5' } as any },
        })
        vi.mocked(prisma.smsMessage.findMany).mockResolvedValue([])

        await GET(makeReq() as any)
        expect(prisma.smsMessage.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    number: { ownerId: 'user-5' },
                }),
            })
        )
    })

    it('returns empty list when user has no messages', async () => {
        vi.mocked(authenticateApiKey).mockResolvedValue({
            success: true,
            context: { userId: 'user-6', permissions: [], apiKey: { id: 'k6' } as any },
        })
        vi.mocked(prisma.smsMessage.findMany).mockResolvedValue([])

        const res = await GET(makeReq() as any)
        const body = await res.json()
        expect(body.data.messages).toEqual([])
    })
})
