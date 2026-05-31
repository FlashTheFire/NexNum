import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'
import { backfill } from './backfill-ledger-checksum'

// Mock the console methods so we don't pollute the test output
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

const DEC = (n: number) => new Prisma.Decimal(n)

describe('Ledger Checksum Backfill Script', () => {
    let mockPrisma: any

    beforeEach(() => {
        vi.clearAllMocks()

        mockPrisma = {
            wallet: {
                count: vi.fn(),
                findMany: vi.fn(),
                update: vi.fn(),
            },
            walletTransaction: {
                aggregate: vi.fn(),
            },
            $disconnect: vi.fn().mockResolvedValue(undefined),
        }
    })

    it('returns early when there are no wallets', async () => {
        mockPrisma.wallet.count.mockResolvedValue(0)

        await backfill(mockPrisma)

        expect(mockPrisma.wallet.count).toHaveBeenCalled()
        expect(mockPrisma.wallet.findMany).not.toHaveBeenCalled()
        expect(mockPrisma.wallet.update).not.toHaveBeenCalled()
    })

    it('processes wallets in batches and updates their checksums correctly', async () => {
        mockPrisma.wallet.count.mockResolvedValue(3)
        mockPrisma.wallet.findMany
            .mockResolvedValueOnce([{ id: 'wallet-1' }, { id: 'wallet-2' }]) // First batch
            .mockResolvedValueOnce([]) // Termination condition (empty batch)

        mockPrisma.walletTransaction.aggregate
            .mockResolvedValueOnce({ _sum: { amount: DEC(150.50) } }) // wallet-1 sum
            .mockResolvedValueOnce({ _sum: { amount: null } }) // wallet-2 sum (no transactions)

        mockPrisma.wallet.update.mockResolvedValue({})

        await backfill(mockPrisma)

        expect(mockPrisma.wallet.count).toHaveBeenCalled()
        expect(mockPrisma.wallet.findMany).toHaveBeenCalledTimes(2)
        expect(mockPrisma.walletTransaction.aggregate).toHaveBeenCalledTimes(2)

        // Check first wallet update
        expect(mockPrisma.wallet.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'wallet-1' },
                data: expect.objectContaining({
                    ledgerChecksum: DEC(150.50),
                    ledgerChecksumAt: expect.any(Date),
                }),
            })
        )

        // Check second wallet update (null sum defaults to 0)
        expect(mockPrisma.wallet.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'wallet-2' },
                data: expect.objectContaining({
                    ledgerChecksum: DEC(0),
                    ledgerChecksumAt: expect.any(Date),
                }),
            })
        )
    })

    it('handles per-wallet errors gracefully and continues processing', async () => {
        // Set count to 100 so 1 error is 1% error rate, which is below the 5% threshold
        mockPrisma.wallet.count.mockResolvedValue(100)
        mockPrisma.wallet.findMany
            .mockResolvedValueOnce([{ id: 'wallet-1' }, { id: 'wallet-2' }])
            .mockResolvedValueOnce([])

        // wallet-1 fails, wallet-2 succeeds
        mockPrisma.walletTransaction.aggregate
            .mockRejectedValueOnce(new Error('DB failure'))
            .mockResolvedValueOnce({ _sum: { amount: DEC(50) } })

        mockPrisma.wallet.update.mockResolvedValue({})

        await backfill(mockPrisma)

        expect(mockPrisma.walletTransaction.aggregate).toHaveBeenCalledTimes(2)
        // wallet-1 should fail and not be updated, wallet-2 should be updated
        expect(mockPrisma.wallet.update).toHaveBeenCalledTimes(1)
        expect(mockPrisma.wallet.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'wallet-2' },
                data: expect.objectContaining({
                    ledgerChecksum: DEC(50),
                }),
            })
        )
    })

    it('exits with code 1 if error rate exceeds the 5% threshold', async () => {
        // Mock process.exit
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit called')
        })

        mockPrisma.wallet.count.mockResolvedValue(10)
        // 10 wallets, 1 batch
        const wallets = Array.from({ length: 10 }, (_, i) => ({ id: `wallet-${i}` }))
        mockPrisma.wallet.findMany
            .mockResolvedValueOnce(wallets)
            .mockResolvedValueOnce([])

        // 1 failure out of 10 = 10% error rate (exceeds 5%)
        mockPrisma.walletTransaction.aggregate
            .mockRejectedValueOnce(new Error('Failed')) // wallet-0 fails
        for (let i = 1; i < 10; i++) {
            mockPrisma.walletTransaction.aggregate.mockResolvedValueOnce({ _sum: { amount: DEC(10) } })
        }

        mockPrisma.wallet.update.mockResolvedValue({})

        await expect(backfill(mockPrisma)).rejects.toThrow('process.exit called')

        expect(exitSpy).toHaveBeenCalledWith(1)
        exitSpy.mockRestore()
    })
})
