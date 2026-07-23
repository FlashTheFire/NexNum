/**
 * Financial Sentinel — Unit Tests
 *
 * Tests the checkpoint-based O(k) integrity verification system.
 * All Prisma calls are mocked — no database required.
 *
 * Coverage:
 *  - Happy path: balance matches checkpoint + delta → returns true
 *  - Breach detection: drift exceeds ALLOWED_DRIFT → quarantines user, returns false
 *  - New wallet (no record) → always returns true
 *  - Delta aggregation: only rows AFTER ledgerChecksumAt are summed
 *  - Checkpoint update: ledgerChecksum increments correctly
 *  - Checkpoint failure: THROWS on DB error (fail-closed per ADR-002)
 *  - System error (DB throws): re-throws as AppError (fail-closed)
 *  - Quarantine side-effects: ban, audit log, socket revocation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Prisma } from '@prisma/client'

// ---------------------------------------------------------------------------
// Module mocks  (must come before imports that use them)
// ---------------------------------------------------------------------------

vi.mock('@/lib/core/db', () => ({
    prisma: {
        wallet: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        walletTransaction: {
            aggregate: vi.fn(),
        },
        user: {
            update: vi.fn(),
        },
        auditLog: {
            create: vi.fn(),
        },
    },
}))

vi.mock('@/lib/core/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}))

vi.mock('@/lib/events/emitters/state-emitter', () => ({
    emitControlEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/wallet/forensic-dispatcher', () => ({
    ForensicDispatcher: {
        dispatch: vi.fn().mockResolvedValue(undefined),
    },
}))

vi.mock('@/lib/metrics', () => ({
    wallet_sentinel_drift_total: { set: vi.fn() },
    wallet_sentinel_status: { set: vi.fn() },
    wallet_sentinel_checkpoint_total: { labels: vi.fn().mockReturnThis(), inc: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { FinancialSentinel } from '@/lib/wallet/sentinel'
import { prisma } from '@/lib/core/db'
import { emitControlEvent } from '@/lib/events/emitters/state-emitter'
import { ForensicDispatcher } from '@/lib/wallet/forensic-dispatcher'
import { AppError } from '@/lib/core/errors'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-1'
const WALLET_ID = 'wallet-1'

function DEC(n: number | Prisma.Decimal): Prisma.Decimal {
    return typeof n === 'number' ? new Prisma.Decimal(n) : n
}

function makeWallet(
    balance: number | Prisma.Decimal,
    checksum: number | Prisma.Decimal,
    checksumAt?: Date
) {
    return {
        id: WALLET_ID,
        userId: USER_ID,
        balance: typeof balance === 'number' ? DEC(balance) : balance,
        ledgerChecksum: typeof checksum === 'number' ? DEC(checksum) : checksum,
        ledgerChecksumAt: checksumAt || new Date('2026-01-01T00:00:00Z'),
        currency: 'USD',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date(),
        transactions: [],
    }
}

// ---------------------------------------------------------------------------
// verifyIntegrity
// ---------------------------------------------------------------------------

describe('FinancialSentinel.verifyIntegrity', () => {
    beforeEach(() => vi.clearAllMocks())
    afterEach(() => vi.clearAllMocks())

    const mockVerify = (balance: number, checksum: number, delta: number) => {
        vi.mocked(prisma.wallet.findUnique).mockResolvedValueOnce(
            makeWallet(balance, checksum) as any
        )
        vi.mocked(prisma.walletTransaction.aggregate).mockResolvedValueOnce({
            _sum: { amount: DEC(delta) },
        } as any)
    }

    it('returns true when balance exactly matches checksum + delta', async () => {
        mockVerify(110, 100, 10)

        const result = await FinancialSentinel.verifyIntegrity(USER_ID)

        expect(result).toBe(true)
    })

    it('returns true when drift is within ALLOWED_DRIFT (0.01)', async () => {
        mockVerify(100.005, 100, 0.005)

        const result = await FinancialSentinel.verifyIntegrity(USER_ID)

        expect(result).toBe(true)
    })

    it('returns true for a brand-new wallet with no record in DB', async () => {
        vi.mocked(prisma.wallet.findUnique).mockResolvedValueOnce(null)

        const result = await FinancialSentinel.verifyIntegrity(USER_ID)

        expect(result).toBe(true)
    })

    it('returns true when delta aggregate is null (zero rows after checkpoint)', async () => {
        vi.mocked(prisma.wallet.findUnique).mockResolvedValueOnce(
            makeWallet(100, 100) as any
        )
        vi.mocked(prisma.walletTransaction.aggregate).mockResolvedValueOnce({
            _sum: { amount: null },
        } as any)

        const result = await FinancialSentinel.verifyIntegrity(USER_ID)

        expect(result).toBe(true)
    })

    it('detects breach and returns false when drift exceeds 0.01', async () => {
        mockVerify(999, 100, 50)
        vi.mocked(prisma.user.update).mockResolvedValueOnce({} as any)
        vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as any)

        const result = await FinancialSentinel.verifyIntegrity(USER_ID)

        expect(result).toBe(false)
    })

    it('calls emitControlEvent (socket revocation) on breach', async () => {
        mockVerify(999, 100, 50)
        vi.mocked(prisma.user.update).mockResolvedValueOnce({} as any)
        vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as any)

        await FinancialSentinel.verifyIntegrity(USER_ID)

        expect(emitControlEvent).toHaveBeenCalledWith('user.revoked', { userId: USER_ID })
    })

    it('dispatches ForensicDispatcher on breach', async () => {
        mockVerify(999, 100, 50)
        vi.mocked(prisma.user.update).mockResolvedValueOnce({} as any)
        vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as any)

        await FinancialSentinel.verifyIntegrity(USER_ID)

        expect(ForensicDispatcher.dispatch).toHaveBeenCalledWith(
            expect.objectContaining({ userId: USER_ID, actionTaken: 'BANNED' })
        )
    })

    it('creates an audit log entry on breach', async () => {
        mockVerify(999, 100, 50)
        vi.mocked(prisma.user.update).mockResolvedValueOnce({} as any)
        vi.mocked(prisma.auditLog.create).mockResolvedValueOnce({} as any)

        await FinancialSentinel.verifyIntegrity(USER_ID)

        expect(prisma.auditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    action: 'security.integrity_breach',
                    resourceId: USER_ID,
                }),
            })
        )
    })

    it('only aggregates transactions AFTER ledgerChecksumAt (hot window)', async () => {
        const customAt = new Date('2026-06-01T12:00:00Z')
        vi.mocked(prisma.wallet.findUnique).mockResolvedValueOnce(
            makeWallet(100, 100, customAt) as any
        )
        vi.mocked(prisma.walletTransaction.aggregate).mockResolvedValueOnce({
            _sum: { amount: DEC(0) },
        } as any)

        await FinancialSentinel.verifyIntegrity(USER_ID)

        // The aggregate query should filter by createdAt > customAt
        expect(prisma.walletTransaction.aggregate).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    createdAt: { gt: customAt },
                }),
            })
        )
    })

    it('throws AppError (fail-closed) when the DB itself throws', async () => {
        vi.mocked(prisma.wallet.findUnique).mockRejectedValueOnce(new Error('DB connection lost'))

        await expect(FinancialSentinel.verifyIntegrity(USER_ID)).rejects.toThrow(AppError)
    })

    it('accepts an injected transaction client instead of global prisma', async () => {
        const fakeTx = {
            wallet: {
                findUnique: vi.fn().mockResolvedValueOnce(makeWallet(100, 100) as any),
            },
            walletTransaction: {
                aggregate: vi.fn().mockResolvedValueOnce({ _sum: { amount: DEC(0) } } as any),
            },
        } as unknown as Prisma.TransactionClient

        const result = await FinancialSentinel.verifyIntegrity(USER_ID, fakeTx)
        expect(result).toBe(true)

        // Should use the injected client, NOT global prisma
        expect(prisma.wallet.findUnique).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// updateCheckpoint
// ---------------------------------------------------------------------------

describe('FinancialSentinel.updateCheckpoint', () => {
    beforeEach(() => vi.clearAllMocks())
    afterEach(() => vi.clearAllMocks())

    it('increments ledgerChecksum and sets ledgerChecksumAt', async () => {
        vi.mocked(prisma.wallet.update).mockResolvedValueOnce({
            ledgerChecksum: DEC(10),
            ledgerChecksumAt: new Date(),
        } as any)

        await FinancialSentinel.updateCheckpoint(WALLET_ID, 25.50)

        expect(prisma.wallet.update).toHaveBeenCalledWith({
            where: { id: WALLET_ID },
            data: expect.objectContaining({
                ledgerChecksum: { increment: expect.any(Prisma.Decimal) },
            }),
            select: { ledgerChecksum: true, ledgerChecksumAt: true },
        })
    })

    it('updates ledgerChecksumAt to a recent timestamp', async () => {
        vi.mocked(prisma.wallet.update).mockResolvedValueOnce({
            ledgerChecksum: DEC(10),
            ledgerChecksumAt: new Date(),
        } as any)
        const before = Date.now()
        await FinancialSentinel.updateCheckpoint(WALLET_ID, 10)
        const after = Date.now()

        const call = vi.mocked(prisma.wallet.update).mock.calls[0][0]
        const ts: Date = (call.data as any).ledgerChecksumAt
        expect(ts.getTime()).toBeGreaterThanOrEqual(before)
        expect(ts.getTime()).toBeLessThanOrEqual(after)
    })

    it('sets ledgerChecksumAt to the provided checkpointTime when supplied', async () => {
        vi.mocked(prisma.wallet.update).mockResolvedValueOnce({
            ledgerChecksum: DEC(10),
            ledgerChecksumAt: new Date('2026-06-01T12:00:00Z'),
        } as any)
        const customDate = new Date('2026-06-01T12:00:00Z')
        await FinancialSentinel.updateCheckpoint(WALLET_ID, 10, customDate)

        const call = vi.mocked(prisma.wallet.update).mock.calls[0][0]
        const ts: Date = (call.data as any).ledgerChecksumAt
        expect(ts.getTime()).toBe(customDate.getTime())
    })

    it('accepts Prisma.Decimal as the amount parameter', async () => {
        vi.mocked(prisma.wallet.update).mockResolvedValueOnce({
            ledgerChecksum: DEC(-15),
            ledgerChecksumAt: new Date(),
        } as any)
        await expect(FinancialSentinel.updateCheckpoint(WALLET_ID, DEC(-15))).resolves.not.toThrow()
    })

    it('THROWS when the DB update fails (fail-closed per ADR-002)', async () => {
        vi.mocked(prisma.wallet.update).mockRejectedValueOnce(new Error('DB down'))
        await expect(FinancialSentinel.updateCheckpoint(WALLET_ID, 10)).rejects.toThrow('DB down')
    })

    it('accepts an injected transaction client', async () => {
        const fakeTx = {
            wallet: { update: vi.fn().mockResolvedValueOnce({
                ledgerChecksum: DEC(50),
                ledgerChecksumAt: new Date(),
            } as any) },
        } as unknown as Prisma.TransactionClient

        await FinancialSentinel.updateCheckpoint(WALLET_ID, 50, undefined, fakeTx)

        expect((fakeTx.wallet as any).update).toHaveBeenCalled()
        expect(prisma.wallet.update).not.toHaveBeenCalled()
    })

    it('handles negative amounts correctly (debit scenario)', async () => {
        vi.mocked(prisma.wallet.update).mockResolvedValueOnce({
            ledgerChecksum: DEC(-30),
            ledgerChecksumAt: new Date(),
        } as any)
        await FinancialSentinel.updateCheckpoint(WALLET_ID, -30)

        const call = vi.mocked(prisma.wallet.update).mock.calls[0][0]
        const amount: Prisma.Decimal = (call.data as any).ledgerChecksum.increment
        expect(amount.toNumber()).toBe(-30)
    })
})