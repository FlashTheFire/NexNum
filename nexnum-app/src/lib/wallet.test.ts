import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WalletService } from '@/lib/wallet'
import { Prisma } from '@prisma/client'

// Mock Prisma
const mockPrisma = {
    $queryRaw: vi.fn(),
    wallet: {
        update: vi.fn(),
        findUnique: vi.fn()
    },
    walletTransaction: {
        create: vi.fn()
    }
}

vi.mock('@/lib/db', () => ({
    prisma: mockPrisma
}))

describe('WalletService', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('reserve', () => {
        it('should reserve funds if balance is sufficient', async () => {
            // Mock raw query response (locking)
            mockPrisma.$queryRaw.mockResolvedValue([
                { id: 'w1', balance: new Prisma.Decimal(100), reserved: new Prisma.Decimal(0) }
            ])

            // Mock update
            mockPrisma.wallet.update.mockResolvedValue({} as any)

            const txMock = mockPrisma // In real app, tx is a transaction client, here we reuse mock

            await WalletService.reserve('u1', 10, 'order1', 'desc', undefined, txMock as any)

            expect(mockPrisma.wallet.update).toHaveBeenCalledWith({
                where: { id: 'w1' },
                data: { reserved: { increment: 10 } }
            })
        })

        it('should throw if insufficient funds', async () => {
            // Mock raw query response: Balance 5, Need 10
            mockPrisma.$queryRaw.mockResolvedValue([
                { id: 'w1', balance: new Prisma.Decimal(5), reserved: new Prisma.Decimal(0) }
            ])

            const txMock = mockPrisma

            await expect(WalletService.reserve('u1', 10, 'order1', 'desc', undefined, txMock as any))
                .rejects.toThrow('Insufficient funds')
        })
    })

    describe('commit', () => {
        it('should deduct balance and release reservation', async () => {
            const txMock = mockPrisma

            await WalletService.commit('u1', 10, 'ref1', 'desc', 'txn1', txMock as any)

            expect(mockPrisma.wallet.update).toHaveBeenCalled()
            // Verify Logic: balance decremented, reserved decremented
            // Logic: balance: { decrement: amount }, reserved: { decrement: amount }
            // Wait, WalletService.commit arguments:
            // wallet.update({ where: { userId }, data: { balance: { decrement }, reserved: { decrement } } })

            const updateCall = mockPrisma.wallet.update.mock.calls[0]
            expect(updateCall[1].data.balance.decrement).toEqual(10)
            expect(updateCall[1].data.reserved.decrement).toEqual(10)
        })
    })
})
