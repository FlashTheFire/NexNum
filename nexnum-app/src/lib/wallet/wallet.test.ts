import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WalletService } from '@/lib/wallet/wallet'
import { Prisma } from '@prisma/client'

// Mock Prisma
// Mock Prisma
const { mockPrisma } = vi.hoisted(() => {
    return {
        mockPrisma: {
            $queryRaw: vi.fn(),
            $executeRaw: vi.fn(),
            wallet: {
                update: vi.fn(),
                findUnique: vi.fn()
            },
            walletTransaction: {
                create: vi.fn()
            }
        }
    }
})

vi.mock('@/lib/core/db', () => ({
    prisma: mockPrisma
}))

describe('WalletService', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('reserve', () => {
        it('should reserve funds if balance is sufficient', async () => {
            // Mock $executeRaw (locking)
            mockPrisma.$executeRaw.mockResolvedValue(1)

            // Mock findUnique (Read Fresh State)
            mockPrisma.wallet.findUnique.mockResolvedValue({
                id: 'w1',
                balance: new Prisma.Decimal(100),
                reserved: new Prisma.Decimal(0)
            })

            // Mock update
            mockPrisma.wallet.update.mockResolvedValue({} as any)

            const txMock = mockPrisma

            await WalletService.reserve('u1', 10, 'order1', 'desc', undefined, txMock as any)

            expect(mockPrisma.wallet.update).toHaveBeenCalledWith({
                where: { id: 'w1' },
                data: {
                    reserved: { increment: new Prisma.Decimal(10) }
                }
            })
        })

        it('should throw if insufficient funds', async () => {
            // Mock $executeRaw
            mockPrisma.$executeRaw.mockResolvedValue(1)

            // Mock findUnique: Balance 5, Need 10
            mockPrisma.wallet.findUnique.mockResolvedValue({
                id: 'w1',
                balance: new Prisma.Decimal(5),
                reserved: new Prisma.Decimal(0)
            })

            const txMock = mockPrisma

            await expect(WalletService.reserve('u1', 10, 'order1', 'desc', undefined, txMock as any))
                .rejects.toThrow('Insufficient funds')
        })
    })

    describe('commit', () => {
        it('should deduct balance and release reservation', async () => {
            const txMock = mockPrisma

            // Mock findUnique
            mockPrisma.wallet.findUnique.mockResolvedValue({
                id: 'w1',
                balance: new Prisma.Decimal(100),
                reserved: new Prisma.Decimal(20) // Has reserved funds
            })

            // Mock update
            mockPrisma.wallet.update.mockResolvedValue({} as any)
            // Mock tx create
            mockPrisma.walletTransaction.create.mockResolvedValue({} as any)

            await WalletService.commit('u1', 10, 'ref1', 'desc', 'txn1', txMock as any)

            expect(mockPrisma.wallet.update).toHaveBeenCalled()
            // Verify Logic: balance decremented, reserved decremented
            // Logic: balance: { decrement: amount }, reserved: { decrement: amount }
            // Wait, WalletService.commit arguments:
            // wallet.update({ where: { userId }, data: { balance: { decrement }, reserved: { decrement } } })

            const updateCall = mockPrisma.wallet.update.mock.calls[0]
            expect(updateCall[0].data.balance.decrement).toEqual(new Prisma.Decimal(10))
            expect(updateCall[0].data.reserved.decrement).toEqual(new Prisma.Decimal(10))
        })
    })
})
