import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Hoisted mock state — vi.mock factory is hoisted above all imports
const mocks = vi.hoisted(() => ({
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    executeRaw: vi.fn().mockResolvedValue(0),
}))

// Mock prisma BEFORE importing the route
vi.mock('@/lib/core/db', () => ({
    prisma: {
        auditLog: { deleteMany: mocks.deleteMany },
        number: { deleteMany: mocks.deleteMany },
        providerHealthLog: { deleteMany: mocks.deleteMany },
        providerTestResult: { deleteMany: mocks.deleteMany },
        $executeRaw: mocks.executeRaw,
    }
}))

vi.mock('@/lib/core/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}))

// Stub the Next.js request/response types
vi.mock('next/server', () => {
    return {
        NextRequest: class {},
        NextResponse: {
            json: (body: any, init?: { status?: number }) => ({
                _body: body,
                status: init?.status ?? 200,
            })
        }
    }
})

// Import AFTER mocks
import { POST, GET } from './route'

const makeReq = (authHeader?: string) => {
    return {
        headers: {
            get: (k: string) => (k === 'authorization' ? authHeader ?? null : null),
        }
    } as any
}

beforeEach(() => {
    mocks.deleteMany.mockReset()
    mocks.executeRaw.mockReset()
    mocks.deleteMany.mockResolvedValue({ count: 0 })
    mocks.executeRaw.mockResolvedValue(0)
    // Default: no CRON_SECRET configured (so no auth required)
    delete process.env.CRON_SECRET
})

afterEach(() => {
    delete process.env.CRON_SECRET
})

describe('POST /api/cron/cleanup', () => {
    it('returns 405 for GET requests', async () => {
        const res: any = await GET()
        expect(res.status).toBe(405)
    })

    it('runs all five cleanup phases and reports counts', async () => {
        mocks.deleteMany
            .mockResolvedValueOnce({ count: 5 })   // auditLog
            .mockResolvedValueOnce({ count: 3 })   // number (orders)
            .mockResolvedValueOnce({ count: 2 })   // providerHealthLog
            .mockResolvedValueOnce({ count: 1 })   // providerTestResult

        const res: any = await POST(makeReq())
        expect(res.status).toBe(200)
        expect(res._body.success).toBe(true)
        expect(res._body.cleaned).toEqual({
            auditLogs: 5,
            orders: 3,
            reservations: 0,
            providerHealthLogs: 2,
            providerTestResults: 1,
        })
        expect(res._body.errors).toBeUndefined()
    })

    it('uses 14-day retention for provider health logs', async () => {
        const before = Date.now()
        await POST(makeReq())
        // Inspect the third deleteMany call (after auditLog and number)
        const call = mocks.deleteMany.mock.calls[2]?.[0]
        expect(call).toBeDefined()
        expect(call.where.checkedAt.lt).toBeInstanceOf(Date)
        const cutoffMs = call.where.checkedAt.lt.getTime()
        const expectedMs = before - 14 * 24 * 60 * 60 * 1000
        expect(Math.abs(cutoffMs - expectedMs)).toBeLessThan(5000)
    })

    it('uses 7-day retention for provider test results', async () => {
        const before = Date.now()
        await POST(makeReq())
        const call = mocks.deleteMany.mock.calls[3]?.[0]
        expect(call).toBeDefined()
        expect(call.where.testedAt.lt).toBeInstanceOf(Date)
        const cutoffMs = call.where.testedAt.lt.getTime()
        const expectedMs = before - 7 * 24 * 60 * 60 * 1000
        expect(Math.abs(cutoffMs - expectedMs)).toBeLessThan(5000)
    })

    it('continues cleanup even when one phase throws', async () => {
        mocks.deleteMany
            .mockResolvedValueOnce({ count: 1 })   // auditLog ok
            .mockImplementationOnce(() => { throw new Error('boom') }) // number fails
            .mockResolvedValueOnce({ count: 4 })   // healthLog ok
            .mockResolvedValueOnce({ count: 2 })   // testResult ok

        const res: any = await POST(makeReq())
        expect(res._body.success).toBe(false)
        expect(res._body.errors).toBeDefined()
        expect(res._body.errors.length).toBeGreaterThan(0)
        expect(res._body.errors[0]).toMatch(/orders: boom/)
        expect(res._body.cleaned.providerHealthLogs).toBe(4)
        expect(res._body.cleaned.providerTestResults).toBe(2)
    })

    it('returns 401 when CRON_SECRET is set and request is missing it', async () => {
        process.env.CRON_SECRET = 's3cret'
        const res: any = await POST(makeReq())
        expect(res.status).toBe(401)
        expect(res._body.error).toBe('Unauthorized')
        expect(mocks.deleteMany).not.toHaveBeenCalled()
    })

    it('returns 401 when CRON_SECRET is set and wrong', async () => {
        process.env.CRON_SECRET = 's3cret'
        const res: any = await POST(makeReq('Bearer wrong'))
        expect(res.status).toBe(401)
    })

    it('accepts correct CRON_SECRET and proceeds', async () => {
        process.env.CRON_SECRET = 's3cret'
        const res: any = await POST(makeReq('Bearer s3cret'))
        expect(res.status).toBe(200)
        expect(res._body.success).toBe(true)
    })
})
