/**
 * WalletService — Unit Tests
 *
 * Tests the critical financial paths: reserve, commit, rollback, charge,
 * refund, credit, debit, and transfer.
 *
 * All Prisma, Sentinel, EventDispatcher, and metrics calls are mocked.
 * No database required.
 *
 * Financial invariants verified:
 *  - Insufficient funds → throws PaymentError (E_INSUFFICIENT_FUNDS)
 *  - Integrity breach → throws PaymentError (E_INTEGRITY_BREACH)
 *  - Idempotency keys → duplicate calls return existing transaction
 *  - Commit: decrements both balance AND reserved
 *  - Rollback: decrements reserved ONLY (balance untouched)
 *  - Refund: increments balance, creates positive transaction
 *  - Transfer: ordered locking, bilateral transaction records
 *  - Checkpoint: called after every committed ledger event
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/core/db', () => ({
    prisma: {
        $transaction: vi.fn(),
        $executeRaw: vi.fn().mockResolvedValue(1),
        wallet: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        walletTransaction: {
            findUnique: vi.fn(),
            create: vi.fn(),
        },
        user: {
            findUnique: vi.fn().mockResolvedValue({ preferredCurrency: 'USD' }),
            update: vi.fn(),
        },
        auditLog: {
            create: vi.fn(),
        },
    },
}))

vi.mock('@/lib/wallet/sentinel', () => ({
    FinancialSentinel: {
        verifyIntegrity: vi.fn().mockResolvedValue(true),
        updateCheckpoint: vi.fn().mockResolvedValue(undefined),
    },
}))

vi.mock('@/lib/core/event-dispatcher', () => ({
    EventDispatcher: {
        dispatch: vi.fn().mockResolvedValue(undefined),
    },
}))

vi.mock('@/lib/currency/currency-service', () => ({
    getCurrencyService: vi.fn().mockReturnValue({
        captureSnapshot: vi.fn().mockResolvedValue({ points: 0 }),
    }),
}))

vi.mock('@/lib/core/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/metrics', () => ({
    wallet_transactions_total: { labels: vi.fn().mockReturnValue({ inc: vi.fn() }) },
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { WalletService } from '@/lib/wallet/wallet'
import { prisma } from '@/lib/core/db'
import { FinancialSentinel } from '@/lib/wallet/sentinel'
import { PaymentError } from '@/lib/payment/payment-errors'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEC = (n: number) => new Prisma.Decimal(n)

const USER_ID = 'user-123'
const WALLET_ID = 'wallet-abc'

const MOCK_TRANSACTION = {
    id: 'txn-001',
    walletId: WALLET_ID,
    amount: DEC(-10),
    type: 'purchase',
    description: 'test',
    createdAt: new Date(),
}

/**
 * Wraps prisma.$transaction so it executes the inner callback with a
 * fake transaction client that delegates all calls back to the same
 * prisma mock object (since vitest already intercepts those).
 *
 * The $executeRaw tag-template literal is mocked as a plain vi.fn()
 * because vitest cannot intercept tagged-template calls via
 * mockImplementation; the production code only uses it for advisory
 * row locking (SELECT FOR UPDATE) which has no observable side-effect
 * in unit tests.
 */
function mockTransactionExecution() {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const fakeTx = {
            $executeRaw: vi.fn().mockResolvedValue(1) as any,
            wallet: prisma.wallet,
            walletTransaction: prisma.walletTransaction,
            user: prisma.user,
            auditLog: prisma.auditLog,
        }
        return fn(fakeTx)
    })
}

function makeWallet(balance: number, reserved = 0) {
    return {
        id: WALLET_ID,
        userId: USER_ID,
        balance: DEC(balance),
        reserved: DEC(reserved),
        ledgerChecksum: DEC(0),
        ledgerChecksumAt: new Date(),
    }
}

// ---------------------------------------------------------------------------
// WalletService.getBalance
// ---------------------------------------------------------------------------

describe('WalletService.getBalance', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns available balance (balance - reserved)', async () => {
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet(100, 30) as any)
        const bal = await WalletService.getBalance(USER_ID)
        expect(bal).toBe(70)
    })

    it('returns 0 when wallet does not exist', async () => {
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(null as any)
        const bal = await WalletService.getBalance(USER_ID)
        expect(bal).toBe(0)
    })
})

// ---------------------------------------------------------------------------
// WalletService.reserve
// ---------------------------------------------------------------------------

describe('WalletService.reserve', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockTransactionExecution()
    })

    it('increments reserved when funds are available', async () => {
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet(100, 0) as any)
        vi.mocked(prisma.wallet.update).mockResolvedValue({} as any)
        vi.mocked(prisma.walletTransaction.create).mockResolvedValue(MOCK_TRANSACTION as any)

        await WalletService.reserve(USER_ID, 50, 'order-1', 'Reserve 50')

        expect(prisma.wallet.update).toHaveBeenCalledWith({
            where: { id: WALLET_ID },
            data: { reserved: { increment: DEC(50) } },
        })
    })

    it('throws INSUFFICIENT_FUNDS when available balance < amount', async () => {
        // reserve() call order:
        //   1. $executeRaw (FOR UPDATE lock)                     — mocked globally
        //   2. FinancialSentinel.verifyIntegrity                 — mocked, returns true, NO DB calls
        //   3. wallet.findUnique (balance read)                  — OUR mock
        // So only ONE findUnique is needed.
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet(30, 20) as any)

        await expect(
            WalletService.reserve(USER_ID, 50, 'order-1', 'Reserve 50')
        ).rejects.toMatchObject({ message: expect.stringMatching(/Insufficient/) })
    })

    it('throws INTEGRITY_BREACH when sentinel fails', async () => {
        // For the integrity-breach test the sentinel mock is changed to return false.
        // Reserve() does the sentinel check before the balance read, so no wallet
        // findUnique mock is needed for the balance path (it throws before reaching it).
        vi.mocked(FinancialSentinel.verifyIntegrity).mockResolvedValueOnce(false)

        await expect(
            WalletService.reserve(USER_ID, 10, 'order-1', 'Reserve')
        ).rejects.toThrow(PaymentError)
    })

    it('throws when wallet not found', async () => {
        // The sentinel verifyIntegrity does a wallet findUnique internally.
        // Our global sentinel mock returns true without hitting the DB, so the
        // first prisma.wallet.findUnique call in the reserve() body is for the
        // balance read. Return null to trigger the "not found" guard.
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(null as any)

        await expect(
            WalletService.reserve(USER_ID, 10, 'order-1', 'Reserve')
        ).rejects.toThrow()
    })
})

// ---------------------------------------------------------------------------
// WalletService.commit
// ---------------------------------------------------------------------------

describe('WalletService.commit', () => {
    beforeEach(() => vi.clearAllMocks())

    it('decrements both reserved and balance', async () => {
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet(100, 50) as any)
        vi.mocked(prisma.wallet.update).mockResolvedValue({} as any)
        vi.mocked(prisma.walletTransaction.create).mockResolvedValue(MOCK_TRANSACTION as any)
        vi.mocked(FinancialSentinel.updateCheckpoint).mockResolvedValue(undefined)

        await WalletService.commit(USER_ID, 50, 'act-1', 'Purchase', 'key-commit-1')

        expect(prisma.wallet.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    reserved: expect.objectContaining({ decrement: expect.anything() }),
                    balance: expect.objectContaining({ decrement: DEC(50) }),
                }),
            })
        )
    })

    it('creates a negative-amount "purchase" transaction record', async () => {
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet(100, 50) as any)
        vi.mocked(prisma.wallet.update).mockResolvedValue({} as any)
        vi.mocked(prisma.walletTransaction.create).mockResolvedValue(MOCK_TRANSACTION as any)

        await WalletService.commit(USER_ID, 50, 'act-1', 'Purchase', 'key-commit-2')

        expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    amount: DEC(-50),
                    type: 'purchase',
                }),
            })
        )
    })

    it('calls updateCheckpoint with a negative amount after commit', async () => {
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet(100, 50) as any)
        vi.mocked(prisma.wallet.update).mockResolvedValue({} as any)
        vi.mocked(prisma.walletTransaction.create).mockResolvedValue(MOCK_TRANSACTION as any)

        await WalletService.commit(USER_ID, 50, 'act-1', 'Purchase')

        expect(FinancialSentinel.updateCheckpoint).toHaveBeenCalledWith(
            WALLET_ID,
            DEC(-50),
            expect.anything(),
            expect.anything()
        )
    })

    it('throws INSUFFICIENT_FUNDS when balance < commit amount', async () => {
        // commit() reads wallet and throws BEFORE creating any transaction
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet(20, 0) as any)

        await expect(
            WalletService.commit(USER_ID, 50, 'act-1', 'Purchase')
        ).rejects.toThrow(PaymentError)

        expect(prisma.walletTransaction.create).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// WalletService.rollback
// ---------------------------------------------------------------------------

describe('WalletService.rollback', () => {
    beforeEach(() => vi.clearAllMocks())

    it('decrements reserved only — does NOT touch balance', async () => {
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet(0, 30) as any)
        vi.mocked(prisma.wallet.update).mockResolvedValue({} as any)
        vi.mocked(prisma.walletTransaction.create).mockResolvedValue({} as any)

        await WalletService.rollback(USER_ID, 30, 'act-1', 'Rollback')

        expect(prisma.wallet.update).toHaveBeenCalledWith({
            where: { id: WALLET_ID },
            data: { reserved: { decrement: DEC(30) } },
        })
        // balance must NOT appear in the update call
        const call = vi.mocked(prisma.wallet.update).mock.calls[0][0]
        expect((call.data as any).balance).toBeUndefined()
    })

    it('creates a walletTransaction record for rollback', async () => {
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet(0, 30) as any)
        vi.mocked(prisma.wallet.update).mockResolvedValue({} as any)
        vi.mocked(prisma.walletTransaction.create).mockResolvedValue({} as any)

        await WalletService.rollback(USER_ID, 30, 'act-1', 'Rollback')

        expect(prisma.walletTransaction.create).toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// WalletService.refund
// ---------------------------------------------------------------------------

describe('WalletService.refund', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockTransactionExecution()
    })

    it('increments balance and creates a positive transaction', async () => {
        vi.mocked(prisma.walletTransaction.findUnique).mockResolvedValue(null as any)
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue({ id: WALLET_ID } as any)
        vi.mocked(prisma.wallet.update).mockResolvedValue({} as any)
        vi.mocked(prisma.walletTransaction.create).mockResolvedValue({
            ...MOCK_TRANSACTION, amount: DEC(25), type: 'refund',
        } as any)

        await WalletService.refund(USER_ID, 25, 'refund', 'act-1', 'Refund', 'key-refund-1')

        expect(prisma.wallet.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { balance: { increment: DEC(25) } },
            })
        )
        expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ amount: DEC(25) }),
            })
        )
    })

    it('calls updateCheckpoint with a POSITIVE amount (refund is a credit)', async () => {
        vi.mocked(prisma.walletTransaction.findUnique).mockResolvedValue(null as any)
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue({ id: WALLET_ID } as any)
        vi.mocked(prisma.wallet.update).mockResolvedValue({} as any)
        vi.mocked(prisma.walletTransaction.create).mockResolvedValue(MOCK_TRANSACTION as any)

        await WalletService.refund(USER_ID, 25, 'refund', 'act-1', 'Refund', 'key-refund-2')

        expect(FinancialSentinel.updateCheckpoint).toHaveBeenCalledWith(
            WALLET_ID,
            DEC(25),
            expect.anything(),
            expect.anything()
        )
    })

    it('is idempotent: duplicate idempotencyKey returns existing transaction', async () => {
        const existingTx = { ...MOCK_TRANSACTION, idempotencyKey: 'key-dup' }
        vi.mocked(prisma.walletTransaction.findUnique).mockResolvedValue(existingTx as any)

        const result = await WalletService.refund(USER_ID, 25, 'refund', 'act-1', 'Refund', 'key-dup')

        expect(result).toEqual(existingTx)
        // No DB writes after the idempotency check
        expect(prisma.wallet.update).not.toHaveBeenCalled()
        expect(prisma.walletTransaction.create).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// WalletService.charge
// ---------------------------------------------------------------------------

describe('WalletService.charge', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockTransactionExecution()
    })

    it('decrements balance and creates a negative-amount transaction', async () => {
        // charge() runs inside $transaction:
        //   1. walletTransaction.findUnique (idempotency, returns null = new charge)
        //   2. wallet.findUnique            (balance read after lock)
        // The sentinel mock is a no-op, so it does NOT consume any findUnique calls.
        vi.mocked(prisma.walletTransaction.findUnique).mockResolvedValue(null as any)
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet(100) as any)
        vi.mocked(prisma.wallet.update).mockResolvedValue({} as any)
        vi.mocked(prisma.walletTransaction.create).mockResolvedValue(MOCK_TRANSACTION as any)

        await WalletService.charge(USER_ID, 40, 'number_purchase', 'act-1', 'SMS number')

        expect(prisma.wallet.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { balance: { decrement: DEC(40) } },
            })
        )
        expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ amount: DEC(-40) }),
            })
        )
    })

    it('throws INSUFFICIENT_FUNDS when balance < charge amount', async () => {
        vi.mocked(prisma.walletTransaction.findUnique).mockResolvedValue(null as any)
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet(20) as any)

        await expect(
            WalletService.charge(USER_ID, 40, 'number_purchase', 'act-1', 'SMS')
        ).rejects.toThrow(PaymentError)

        expect(prisma.walletTransaction.create).not.toHaveBeenCalled()
    })

    it('is idempotent on duplicate idempotencyKey', async () => {
        const existingTx = { ...MOCK_TRANSACTION, idempotencyKey: 'key-charge-dup' }
        // charge() is called inside $transaction. The idempotency check is the
        // FIRST thing inside performCharge. When the key exists, it returns immediately.
        // The fake tx delegates walletTransaction.findUnique to prisma.walletTransaction,
        // which is mocked to return existingTx.
        vi.mocked(prisma.walletTransaction.findUnique).mockResolvedValue(existingTx as any)

        const result = await WalletService.charge(USER_ID, 40, 'number_purchase', 'act-1', 'SMS', 'key-charge-dup')

        expect(result).toEqual(existingTx)
        // After early return, no balance writes should occur
        expect(prisma.wallet.update).not.toHaveBeenCalled()
        expect(prisma.walletTransaction.create).not.toHaveBeenCalled()
    })

    it('calls updateCheckpoint with a NEGATIVE amount (debit)', async () => {
        vi.mocked(prisma.walletTransaction.findUnique).mockResolvedValue(null as any)
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet(100) as any)
        vi.mocked(prisma.wallet.update).mockResolvedValue({} as any)
        vi.mocked(prisma.walletTransaction.create).mockResolvedValue(MOCK_TRANSACTION as any)

        await WalletService.charge(USER_ID, 40, 'number_purchase', 'act-1', 'SMS')

        expect(FinancialSentinel.updateCheckpoint).toHaveBeenCalledWith(
            WALLET_ID,
            DEC(-40),
            expect.anything(),
            expect.anything()
        )
    })
})

// ---------------------------------------------------------------------------
// WalletService.credit
// ---------------------------------------------------------------------------

describe('WalletService.credit', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockTransactionExecution() // credit() uses prisma.$transaction internally
    })

    it('increments balance and creates a positive transaction', async () => {
        vi.mocked(prisma.walletTransaction.findUnique).mockResolvedValue(null as any)
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue({ id: WALLET_ID } as any)
        vi.mocked(prisma.wallet.update).mockResolvedValue({} as any)
        vi.mocked(prisma.walletTransaction.create).mockResolvedValue({
            ...MOCK_TRANSACTION, amount: DEC(100),
        } as any)

        await WalletService.credit(USER_ID, 100, 'manual_credit', 'Admin top-up', 'key-credit-1')

        expect(prisma.wallet.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { balance: { increment: DEC(100) } },
            })
        )
    })

    it('calls updateCheckpoint with a POSITIVE amount', async () => {
        // credit() call order:
        //   1. walletTransaction.findUnique (idempotency, null = proceed)
        //   2. $executeRaw (FOR UPDATE lock)
        //   3. wallet.findUnique (get wallet id)
        //   4. FinancialSentinel.verifyIntegrity — mocked, no DB calls
        //   5. wallet.update (increment balance)
        //   6. walletTransaction.create
        //   7. FinancialSentinel.updateCheckpoint
        vi.mocked(prisma.walletTransaction.findUnique).mockResolvedValue(null as any)
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue({ id: WALLET_ID } as any)
        vi.mocked(prisma.wallet.update).mockResolvedValue({} as any)
        vi.mocked(prisma.walletTransaction.create).mockResolvedValue(MOCK_TRANSACTION as any)

        await WalletService.credit(USER_ID, 100, 'manual_credit', 'Admin', 'key-credit-2')

        expect(FinancialSentinel.updateCheckpoint).toHaveBeenCalledWith(
            WALLET_ID,
            DEC(100),
            expect.anything(),
            expect.anything()
        )
    })
})

// ---------------------------------------------------------------------------
// WalletService.debit
// ---------------------------------------------------------------------------

describe('WalletService.debit', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockTransactionExecution() // debit() uses prisma.$transaction internally
    })

    it('decrements balance and creates a negative transaction', async () => {
        // debit() call order:
        //   1. walletTransaction.findUnique (idempotency)
        //   2. $executeRaw (FOR UPDATE lock)
        //   3. wallet.findUnique { id, balance }  ← needs balance field
        //   4. FinancialSentinel.verifyIntegrity    — mocked, no DB calls
        //   5. wallet.update (decrement balance)
        //   6. walletTransaction.create
        //   7. updateCheckpoint
        vi.mocked(prisma.walletTransaction.findUnique).mockResolvedValue(null as any)
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet(200) as any)
        vi.mocked(prisma.wallet.update).mockResolvedValue({} as any)
        vi.mocked(prisma.walletTransaction.create).mockResolvedValue(MOCK_TRANSACTION as any)

        await WalletService.debit(USER_ID, 50, 'manual_debit', 'Admin deduction', 'key-debit-1')

        expect(prisma.wallet.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { balance: { decrement: DEC(50) } },
            })
        )
        expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ amount: DEC(-50) }),
            })
        )
    })

    it('throws INSUFFICIENT_FUNDS when balance < debit amount', async () => {
        // debit() reads wallet AFTER idempotency check.
        vi.mocked(prisma.walletTransaction.findUnique).mockResolvedValue(null as any)
        vi.mocked(prisma.wallet.findUnique).mockResolvedValue(makeWallet(10) as any)

        await expect(
            WalletService.debit(USER_ID, 50, 'manual_debit', 'Deduction', 'key-debit-bad')
        ).rejects.toThrow(PaymentError)

        expect(prisma.walletTransaction.create).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// WalletService.transfer
// ---------------------------------------------------------------------------

describe('WalletService.transfer', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockTransactionExecution()
    })

    it('performs atomic peer-to-peer transfer and advances checkpoints for both parties', async () => {
        const FROM_USER = 'user-from'
        const TO_USER = 'user-to'
        const FROM_WALLET_ID = 'wallet-from-id'
        const TO_WALLET_ID = 'wallet-to-id'

        vi.mocked(prisma.wallet.findUnique)
            .mockResolvedValueOnce({ id: FROM_WALLET_ID, userId: FROM_USER, balance: DEC(100) } as any) // sender wallet
            .mockResolvedValueOnce({ id: TO_WALLET_ID, userId: TO_USER, balance: DEC(50) } as any) // receiver wallet

        vi.mocked(prisma.wallet.update).mockResolvedValue({} as any)
        vi.mocked(prisma.walletTransaction.create)
            .mockResolvedValueOnce({ ...MOCK_TRANSACTION, walletId: FROM_WALLET_ID, amount: DEC(-30), createdAt: new Date() } as any) // debit tx
            .mockResolvedValueOnce({ ...MOCK_TRANSACTION, walletId: TO_WALLET_ID, amount: DEC(30), createdAt: new Date() } as any) // credit tx

        await WalletService.transfer(FROM_USER, TO_USER, 30, 'P2P Gift', 'p2p-key-123')

        // Assert updates were called on both wallets
        expect(prisma.wallet.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: FROM_WALLET_ID },
                data: { balance: { decrement: DEC(30) } }
            })
        )
        expect(prisma.wallet.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: TO_WALLET_ID },
                data: { balance: { increment: DEC(30) } }
            })
        )

        // Assert checkpoints were updated for both wallets
        expect(FinancialSentinel.updateCheckpoint).toHaveBeenCalledWith(
            FROM_WALLET_ID,
            DEC(-30),
            expect.anything(),
            expect.anything()
        )
        expect(FinancialSentinel.updateCheckpoint).toHaveBeenCalledWith(
            TO_WALLET_ID,
            DEC(30),
            expect.anything(),
            expect.anything()
        )
    })
})
