import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks MUST be hoisted before import
vi.mock('@/lib/core/db', () => ({
    prisma: {
        user: { findUnique: vi.fn() },
    },
    ensureWallet: vi.fn().mockResolvedValue('wallet-abc'),
}))

vi.mock('@/lib/auth/jwt', () => ({
    getCurrentUser: vi.fn(),
}))

vi.mock('@/lib/wallet/wallet', () => ({
    WalletService: {
        getBalance: vi.fn().mockResolvedValue(5000),
    },
}))

vi.mock('@/lib/currency/currency-service', () => ({
    getCurrencyService: () => ({
        pointsToAllFiat: vi.fn().mockResolvedValue({
            USD: '1.00',
            INR: '83.00',
            RUB: '90.00',
            EUR: '0.92',
            GBP: '0.79',
            CNY: '7.20',
        }),
    }),
    toSupportedCurrency: (code: any) => code || 'USD',
}))

import { GET } from './route'
import { getCurrentUser } from '@/lib/auth/jwt'
import { prisma, ensureWallet } from '@/lib/core/db'
import { WalletService } from '@/lib/wallet/wallet'

function makeReq(headers: Record<string, string> = {}): Request {
    return new Request('http://localhost/api/wallet/balance', {
        method: 'GET',
        headers,
    })
}

describe('GET /api/wallet/balance', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(ensureWallet).mockResolvedValue('wallet-abc' as any)
        vi.mocked(WalletService.getBalance).mockResolvedValue(5000)
    })

    it('returns 401 when user is not authenticated', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(null)

        const res = await GET(makeReq() as any)
        expect(res.status).toBe(401)
        const body = await res.json()
        expect(body.error).toBe('Unauthorized')
    })

    it('returns balance in fiat only (never exposes points) for authenticated user', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-1' } as any)
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            preferredCurrency: 'INR',
        } as any)

        const res = await GET(makeReq() as any)
        expect(res.status).toBe(200)
        const body = await res.json()

        expect(body.success).toBe(true)
        expect(body.multiBalance).toBeDefined()
        expect(body.multiBalance.USD).toBe('1.00')
        expect(body.multiBalance.INR).toBe('83.00')
        expect(body.displayCurrency).toBe('INR')
        // CRITICAL: Points are NEVER sent to client
        expect(body.balance).toBeUndefined()
        expect(body.points).toBeUndefined()
    })

    it('ensures wallet exists before reading balance', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-2' } as any)
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            preferredCurrency: 'USD',
        } as any)

        await GET(makeReq() as any)
        expect(ensureWallet).toHaveBeenCalledWith('user-2')
        expect(WalletService.getBalance).toHaveBeenCalledWith('user-2')
    })

    it('falls back to USD when preferredCurrency is null/unknown', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-3' } as any)
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            preferredCurrency: null,
        } as any)

        const res = await GET(makeReq() as any)
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.displayCurrency).toBe('USD')
    })

    it('returns 500 when an internal error occurs', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-4' } as any)
        vi.mocked(prisma.user.findUnique).mockRejectedValue(new Error('db down'))

        const res = await GET(makeReq() as any)
        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body.error).toBe('Internal server error')
    })

    it('sets cache headers on successful response', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user-5' } as any)
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            preferredCurrency: 'USD',
        } as any)

        const res = await GET(makeReq() as any)
        const cacheControl = res.headers.get('Cache-Control')
        expect(cacheControl).toContain('private')
        expect(cacheControl).toContain('max-age=10')
        expect(cacheControl).toContain('stale-while-revalidate=30')
    })
})
