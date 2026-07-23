/**
 * Reconcile Worker — Unit Tests
 *
 * Verifies the multi-layer refund protection, orphan detection, and stuck
 * activation handling without touching real DB / Redis / wallet.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRedisSet = vi.fn()
const mockRedisDel = vi.fn()
vi.mock('@/lib/core/redis', () => ({
    redis: {
        set: (...args: any[]) => mockRedisSet(...args),
        del: (...args: any[]) => mockRedisDel(...args),
    },
}))

const mockPurchaseOrderFindMany = vi.fn()
const mockActivationFindMany = vi.fn()
const mockActivationFindUnique = vi.fn()
const mockActivationUpdate = vi.fn()
const mockPurchaseOrderUpdate = vi.fn()
const mockNumberFindMany = vi.fn()
const mockNumberUpdate = vi.fn()
const mockSmsMessageCount = vi.fn()
const mockTransaction = vi.fn()

vi.mock('@/lib/core/db', () => ({
    prisma: {
        purchaseOrder: {
            findMany: (...args: any[]) => mockPurchaseOrderFindMany(...args),
            update: (...args: any[]) => mockPurchaseOrderUpdate(...args),
        },
        activation: {
            findMany: (...args: any[]) => mockActivationFindMany(...args),
            findUnique: (...args: any[]) => mockActivationFindUnique(...args),
            update: (...args: any[]) => mockActivationUpdate(...args),
        },
        number: {
            findMany: (...args: any[]) => mockNumberFindMany(...args),
            update: (...args: any[]) => mockNumberUpdate(...args),
        },
        smsMessage: {
            count: (...args: any[]) => mockSmsMessageCount(...args),
        },
        $transaction: (...args: any[]) => mockTransaction(...args),
    },
}))

const mockRollback = vi.fn()
const mockRefund = vi.fn()
vi.mock('@/lib/wallet/wallet', () => ({
    WalletService: {
        rollback: (...args: any[]) => mockRollback(...args),
        refund: (...args: any[]) => mockRefund(...args),
    },
}))

const mockGetStatus = vi.fn()
vi.mock('@/lib/providers', () => ({
    smsProvider: { getStatus: (...args: any[]) => mockGetStatus(...args) },
}))

const mockLogRefundBlocked = vi.fn()
vi.mock('@/lib/sms/audit', () => ({
    smsAudit: { logRefundBlocked: (...args: any[]) => mockLogRefundBlocked(...args) },
}))

vi.mock('@/lib/core/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), success: vi.fn() },
}))

const { processReconciliationBatch } = await import('./reconcile-worker')

// ---------------------------------------------------------------------------
// Helpers / fixtures
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.clearAllMocks()
    // Default: no records to process, no orphans
    mockPurchaseOrderFindMany.mockResolvedValue([])
    mockActivationFindMany.mockResolvedValue([])
    mockActivationFindUnique.mockResolvedValue(null)
    mockNumberFindMany.mockResolvedValue([])
    mockSmsMessageCount.mockResolvedValue(0)
    mockTransaction.mockImplementation(async (fn: any) => fn({
        activation: { findUnique: mockActivationFindUnique, update: mockActivationUpdate },
        purchaseOrder: { update: mockPurchaseOrderUpdate },
    }))
    mockRollback.mockResolvedValue({ id: 'rollback-tx-1' })
    mockRefund.mockResolvedValue({ id: 'refund-tx-1' })
    mockLogRefundBlocked.mockResolvedValue(undefined)
    mockGetStatus.mockResolvedValue({ status: 'pending', messages: [] })
    // Default: lock acquired
    mockRedisSet.mockResolvedValue('OK')
    mockRedisDel.mockResolvedValue(1)
})

const baseResult = () => ({
    purchaseOrders: { processed: 0, succeeded: 0, failed: 0 },
    activations: { processed: 0, succeeded: 0, failed: 0 },
    refunds: { processed: 0, succeeded: 0, failed: 0, blocked: 0 },
    orphans: { detected: 0, fixed: 0 },
})

// ---------------------------------------------------------------------------
// Distributed lock
// ---------------------------------------------------------------------------

describe('processReconciliationBatch — locking', () => {
    it('skips and returns zeroed result when lock is already held', async () => {
        mockRedisSet.mockResolvedValue(null) // NX failed
        const result = await processReconciliationBatch()
        expect(result).toEqual(baseResult())
        // Should NOT release since it never acquired
        expect(mockRedisDel).not.toHaveBeenCalled()
    })

    it('releases the lock in finally even on success', async () => {
        await processReconciliationBatch()
        expect(mockRedisDel).toHaveBeenCalledWith('NexNum:Lock:Reconcile')
    })

    it('releases the lock even when the work throws', async () => {
        mockPurchaseOrderFindMany.mockRejectedValue(new Error('db down'))
        await expect(processReconciliationBatch()).rejects.toThrow('db down')
        expect(mockRedisDel).toHaveBeenCalledWith('NexNum:Lock:Reconcile')
    })
})

// ---------------------------------------------------------------------------
// Expired PurchaseOrders
// ---------------------------------------------------------------------------

describe('processReconciliationBatch — expired purchase orders', () => {
    it('rolls back wallet and marks order FAILED on success', async () => {
        mockPurchaseOrderFindMany.mockResolvedValueOnce([{
            id: 'po-1', userId: 'u-1', amount: { toNumber: () => 10 },
        }])
        const result = await processReconciliationBatch()
        expect(mockRollback).toHaveBeenCalledWith('u-1', 10, 'po-1', 'Reconciliation Expired', expect.anything())
        expect(mockPurchaseOrderUpdate).toHaveBeenCalledWith({
            where: { id: 'po-1' },
            data: { status: 'FAILED' },
        })
        expect(result.purchaseOrders).toEqual({ processed: 1, succeeded: 1, failed: 0 })
    })

    it('records failure when rollback throws', async () => {
        mockPurchaseOrderFindMany.mockResolvedValueOnce([{
            id: 'po-2', userId: 'u-1', amount: { toNumber: () => 5 },
        }])
        mockTransaction.mockImplementationOnce(async () => {
            throw new Error('wallet down')
        })
        const result = await processReconciliationBatch()
        expect(result.purchaseOrders).toEqual({ processed: 1, succeeded: 0, failed: 1 })
    })
})

// ---------------------------------------------------------------------------
// Stuck RESERVED activations
// ---------------------------------------------------------------------------

describe('processReconciliationBatch — stuck RESERVED activations', () => {
    it('rolls back wallet and marks activation FAILED', async () => {
        mockActivationFindMany.mockResolvedValueOnce([{
            id: 'act-1', userId: 'u-1', price: { toNumber: () => 3.5 },
        }])
        const result = await processReconciliationBatch()
        expect(mockRollback).toHaveBeenCalledWith('u-1', 3.5, 'act-1', 'Reconciliation: Stuck RESERVED', expect.anything())
        expect(mockActivationUpdate).toHaveBeenCalledWith({
            where: { id: 'act-1' },
            data: { state: 'FAILED' },
        })
        expect(result.activations).toEqual({ processed: 1, succeeded: 1, failed: 0 })
    })

    it('counts failed activation rollback', async () => {
        mockActivationFindMany.mockResolvedValueOnce([{
            id: 'act-2', userId: 'u-1', price: { toNumber: () => 3.5 },
        }])
        mockTransaction.mockImplementationOnce(async () => {
            throw new Error('rollback failed')
        })
        const result = await processReconciliationBatch()
        expect(result.activations).toEqual({ processed: 1, succeeded: 0, failed: 1 })
    })
})

// ---------------------------------------------------------------------------
// Refund guards
// ---------------------------------------------------------------------------

describe('processReconciliationBatch — refund guards', () => {
    // Factory: row that passes the findMany WHERE (state in EXPIRED/FAILED/CANCELLED)
    // with providerActivationId=null and numberId=null to skip those guards by default.
    const pendingRefund = (overrides: any = {}) => ({
        id: 'act-r',
        userId: 'u-1',
        state: 'EXPIRED',
        price: { toNumber: () => 1.0, toFixed: (n: number) => '1.00' } as any,
        numberId: null,
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24h old
        capturedTxId: 'cap-1',
        providerActivationId: null,
        refundTxId: null,
        ...overrides,
    })

    // Helper: queue up the activation.findMany sequence:
    //   1st call = stuck RESERVED activations → []
    //   2nd call = pending refunds → [row]
    const queuePendingRefund = (row: any) => {
        mockActivationFindMany
            .mockResolvedValueOnce([])              // stuck activations
            .mockResolvedValueOnce([row])          // pending refunds
    }

    it('blocks refund when no captured transaction (guard 2)', async () => {
        queuePendingRefund(pendingRefund({ capturedTxId: null }))
        const result = await processReconciliationBatch()
        expect(result.refunds.blocked).toBe(1)
        expect(result.refunds.succeeded).toBe(0)
        expect(mockLogRefundBlocked).toHaveBeenCalled()
        expect(mockRefund).not.toHaveBeenCalled()
    })

    it('blocks refund when within time lock (guard 3)', async () => {
        queuePendingRefund([
            pendingRefund({ createdAt: new Date(Date.now() - 1000) }), // 1 second old
        ])
        const result = await processReconciliationBatch()
        expect(result.refunds.blocked).toBe(1)
        expect(mockRefund).not.toHaveBeenCalled()
    })

    it('blocks refund when SMS messages exist for the number (guard 4) and updates state to RECEIVED', async () => {
        queuePendingRefund(pendingRefund({ numberId: 'num-1' }))
        mockSmsMessageCount.mockResolvedValueOnce(3)
        const result = await processReconciliationBatch()
        expect(result.refunds.blocked).toBe(1)
        // SMS-based block also updates state to RECEIVED
        expect(mockActivationUpdate).toHaveBeenCalledWith({
            where: { id: 'act-r' },
            data: { state: 'RECEIVED' },
        })
        expect(mockRefund).not.toHaveBeenCalled()
    })

    it('blocks refund when provider reports received status (guard 5)', async () => {
        queuePendingRefund(pendingRefund({ providerActivationId: 'prov-1' }))
        mockGetStatus.mockResolvedValueOnce({ status: 'received', messages: [] })
        const result = await processReconciliationBatch()
        expect(result.refunds.blocked).toBe(1)
        expect(mockRefund).not.toHaveBeenCalled()
    })

    it('blocks refund when provider reports messages (guard 5)', async () => {
        queuePendingRefund(pendingRefund({ providerActivationId: 'prov-1' }))
        mockGetStatus.mockResolvedValueOnce({
            status: 'pending',
            messages: [{ id: 'm1', content: 'hello' }],
        })
        const result = await processReconciliationBatch()
        expect(result.refunds.blocked).toBe(1)
    })

    it('flags high-value refund for manual review but still allows (guard 6)', async () => {
        const row = pendingRefund({ price: { toNumber: () => 10, toFixed: (n: number) => '10.00' } as any })
        queuePendingRefund(row)
        // Inside transaction: fresh activation is the same row with no refund yet
        mockActivationFindUnique.mockResolvedValueOnce({ ...row, refundTxId: null })
        const result = await processReconciliationBatch()
        expect(result.refunds.succeeded).toBe(1)
        expect(mockRefund).toHaveBeenCalled()
    })

    it('treats provider error as non-blocking when isLifecycleTerminal=true', async () => {
        queuePendingRefund(pendingRefund({ providerActivationId: 'prov-1' }))
        const terminalErr: any = new Error('terminal')
        terminalErr.isLifecycleTerminal = true
        mockGetStatus.mockRejectedValueOnce(terminalErr)
        const result = await processReconciliationBatch()
        // Refund should still succeed since terminal error is OK
        expect(result.refunds.succeeded).toBe(1)
    })

    it('refunds when all guards pass', async () => {
        const row = pendingRefund()
        queuePendingRefund(row)
        // Inside transaction: fresh activation is the same row with no refund yet
        mockActivationFindUnique.mockResolvedValueOnce({ ...row, refundTxId: null })
        const result = await processReconciliationBatch()
        expect(result.refunds.succeeded).toBe(1)
        expect(mockRefund).toHaveBeenCalled()
        // Final activation update should set REFUNDED + refundTxId
        expect(mockActivationUpdate).toHaveBeenCalledWith({
            where: { id: 'act-r' },
            data: { state: 'REFUNDED', refundTxId: 'refund-tx-1' },
        })
    })

    it('skips refund when already refunded by concurrent process (idempotency)', async () => {
        queuePendingRefund(pendingRefund())
        // Inside the transaction, findUnique returns the activation but with refundTxId set
        // (concurrent process already refunded)
        mockActivationFindUnique.mockResolvedValueOnce({
            id: 'act-r',
            refundTxId: 'already-refunded',
        })
        const result = await processReconciliationBatch()
        // Refund was counted (processed) but no actual refundTx was issued
        expect(result.refunds.processed).toBe(1)
        expect(mockRefund).not.toHaveBeenCalled()
        // Final update with state=REFUNDED was NOT called
        const refundUpdate = mockActivationUpdate.mock.calls.find((call: any[]) =>
            call[0]?.data?.state === 'REFUNDED'
        )
        expect(refundUpdate).toBeUndefined()
    })

    it('records failure when refund throws', async () => {
        queuePendingRefund(pendingRefund())
        mockTransaction.mockImplementationOnce(async () => {
            throw new Error('refund failed')
        })
        const result = await processReconciliationBatch()
        expect(result.refunds.failed).toBe(1)
    })
})

// ---------------------------------------------------------------------------
// Orphan detection + fix
// ---------------------------------------------------------------------------

describe('processReconciliationBatch — orphan detection', () => {
    it('counts orphans detected across all 3 categories', async () => {
        // number_no_activation
        // messages_but_expired
        // stuck_polling
        mockNumberFindMany
            .mockResolvedValueOnce([
                { id: 'n-orphan-1', phoneNumber: '+1', status: 'active' },
            ])
            .mockResolvedValueOnce([
                { id: 'n-orphan-2', phoneNumber: '+2', status: 'expired', _count: { smsMessages: 2 } },
            ])
            .mockResolvedValueOnce([
                { id: 'n-orphan-3', phoneNumber: '+3', status: 'active' },
            ])
        const result = await processReconciliationBatch()
        expect(result.orphans.detected).toBe(3)
    })

    it('auto-fixes messages_but_expired by setting status=completed', async () => {
        mockNumberFindMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                { id: 'n-fix-1', phoneNumber: '+1', status: 'expired', _count: { smsMessages: 2 } },
            ])
            .mockResolvedValueOnce([])
        const result = await processReconciliationBatch()
        expect(mockNumberUpdate).toHaveBeenCalledWith({
            where: { id: 'n-fix-1' },
            data: { status: 'completed' },
        })
        expect(result.orphans.fixed).toBe(1)
    })

    it('auto-fixes stuck_polling by resetting nextPollAt and errorCount', async () => {
        mockNumberFindMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                { id: 'n-fix-2', phoneNumber: '+2', status: 'active' },
            ])
        const result = await processReconciliationBatch()
        expect(mockNumberUpdate).toHaveBeenCalledWith({
            where: { id: 'n-fix-2' },
            data: {
                nextPollAt: expect.any(Date),
                errorCount: 0,
            },
        })
        expect(result.orphans.fixed).toBe(1)
    })

    it('does not auto-fix number_no_activation (requires manual review)', async () => {
        mockNumberFindMany
            .mockResolvedValueOnce([
                { id: 'n-manual', phoneNumber: '+1', status: 'active' },
            ])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([])
        const result = await processReconciliationBatch()
        expect(mockNumberUpdate).not.toHaveBeenCalled()
        expect(result.orphans.detected).toBe(1)
        expect(result.orphans.fixed).toBe(0)
    })

    it('counts fix errors gracefully without aborting the batch', async () => {
        mockNumberFindMany
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([
                { id: 'n-bad', phoneNumber: '+1', status: 'expired', _count: { smsMessages: 1 } },
            ])
            .mockResolvedValueOnce([])
        mockNumberUpdate.mockRejectedValueOnce(new Error('db error'))
        const result = await processReconciliationBatch()
        expect(result.orphans.fixed).toBe(0)
        expect(result.orphans.detected).toBe(1)
    })
})
