/**
 * OrderOrchestrator — Unit Tests
 *
 * Tests the central SMS order management workflow.
 * Covers purchase flow, order status, cancellation, SMS resend,
 * batch polling, and health status.
 *
 * All external dependencies (Prisma, WalletService, ActivationService,
 * ActivationKernel, provider-factory, metrics, logger, MultiSmsHandler,
 * lifecycle manager, batch poll manager, state machine) are mocked.
 * No database or network required.
 *
 * Critical invariants verified:
 *  - Insufficient balance → early return, no reservation
 *  - Provider not found → rollback reservation + FAILED transition
 *  - Provider errors → rollback reservation + FAILED transition
 *  - Cancellation → provider cancel + state update + refund
 *  - Resend → MultiSmsHandler.requestNextSms called + timeout extended
 *  - Batch poll → delegates to BatchPollManager, returns counts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockActivationFindFirst = vi.fn()
const mockActivationUpdate = vi.fn()
const mockNumberFindUnique = vi.fn()
const mockNumberUpdate = vi.fn()
const mockNumberCount = vi.fn()
const mockProviderFindUnique = vi.fn()
const mockProviderFindFirst = vi.fn()
const mockTransaction = vi.fn()

const mockWalletGetBalance = vi.fn()
const mockWalletRollback = vi.fn()

const mockActivationServiceCreateWithReservation = vi.fn()
const mockActivationServiceProcessRefund = vi.fn()

const mockKernelTransition = vi.fn()

const mockGetProviderAdapter = vi.fn()
const mockSetCancel = vi.fn()
const mockCancelNumber = vi.fn()
const mockRequestNumber = vi.fn()

const mockGetActiveNumbersForPolling = vi.fn()
const mockBatchPollManagerPoolBatch = vi.fn()

const mockLifecycleManagerExtendTimeout = vi.fn()
const mockLifecycleManagerGetStats = vi.fn()
const mockLifecycleManagerLastError = vi.fn()
const mockLifecycleManagerSchedulePolling = vi.fn()

const mockMultiSmsHandlerRequestNextSms = vi.fn()

const mockStateMachineCanTransition = vi.fn()
const mockStateMachineIsRefundable = vi.fn()
const mockStateMachineTransition = vi.fn()
const mockDescribePollStrategy = vi.fn()

// Metrics
const mockOrderStateMInc = vi.fn()
const mockOrderStateMLabels = vi.fn().mockReturnValue({ inc: mockOrderStateMInc })
const mockOrderProcLabels = vi.fn().mockReturnValue({ observe: vi.fn(), startTimer: vi.fn().mockReturnValue(vi.fn()) })
const mockWalletRefundInc = vi.fn()
const mockWalletRefundLabels = vi.fn().mockReturnValue({ inc: mockWalletRefundInc })
const mockActiveOrderGaugeLabels = vi.fn().mockReturnValue({ inc: vi.fn(), dec: vi.fn() })

vi.mock('@/lib/core/db', () => ({
    prisma: {
        $transaction: mockTransaction,
        activation: {
            findFirst: mockActivationFindFirst,
            update: mockActivationUpdate,
        },
        number: {
            findUnique: mockNumberFindUnique,
            update: mockNumberUpdate,
            count: mockNumberCount,
        },
        provider: {
            findUnique: mockProviderFindUnique,
            findFirst: mockProviderFindFirst,
        },
    },
}))

vi.mock('@/lib/core/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/activation/activation-state-machine', () => ({
    canTransition: mockStateMachineCanTransition,
    isRefundable: mockStateMachineIsRefundable,
    transition: mockStateMachineTransition,
    STATE_METADATA: {
        INIT: { label: 'Initial', color: 'gray', description: 'Order created' },
        RESERVED: { label: 'Reserved', color: 'blue', description: 'Funds reserved' },
        ACTIVE: { label: 'Active', color: 'green', description: 'Number active' },
        RECEIVED: { label: 'Received', color: 'green', description: 'SMS received' },
        CANCELLED: { label: 'Cancelled', color: 'red', description: 'Order cancelled' },
        FAILED: { label: 'Failed', color: 'red', description: 'Order failed' },
        EXPIRED: { label: 'Expired', color: 'orange', description: 'Order expired' },
        REFUNDED: { label: 'Refunded', color: 'yellow', description: 'Refunded' },
    },
}))

vi.mock('@/lib/wallet/wallet', () => ({
    WalletService: {
        getBalance: mockWalletGetBalance,
        rollback: mockWalletRollback,
    },
}))

vi.mock('@/lib/activation/activation-service', () => ({
    ActivationService: {
        createWithReservation: mockActivationServiceCreateWithReservation,
        processRefund: mockActivationServiceProcessRefund,
    },
}))

vi.mock('@/lib/activation/activation-kernel', () => ({
    ActivationKernel: {
        transition: mockKernelTransition,
    },
}))

vi.mock('@/lib/metrics', () => ({
    order_state_transitions_total: { inc: mockOrderStateMInc, labels: mockOrderStateMLabels },
    order_processing_duration_seconds: { labels: mockOrderProcLabels },
    wallet_operation_duration_seconds: { labels: mockOrderProcLabels },
    wallet_refunds_total: { inc: mockWalletRefundInc, labels: mockWalletRefundLabels },
    active_orders_gauge: { labels: mockActiveOrderGaugeLabels },
}))

vi.mock('@/lib/sms/multi-sms-handler', () => ({
    MultiSmsHandler: {
        requestNextSms: mockMultiSmsHandlerRequestNextSms,
    },
}))

vi.mock('@/lib/providers/provider-factory', () => ({
    getProviderAdapter: mockGetProviderAdapter,
}))

// Must mock the module itself so imports work
vi.mock('@/lib/activation/batch-poll-manager', () => ({
    getActiveNumbersForPolling: mockGetActiveNumbersForPolling,
    BatchPollManager: {
        pollBatch: mockBatchPollManagerPoolBatch,
    },
}))

vi.mock('@/lib/activation/adaptive-poll-strategy', () => ({
    getNextPollDelay: vi.fn().mockResolvedValue(5000),
    describePollStrategy: mockDescribePollStrategy,
}))

vi.mock('@/lib/activation/number-lifecycle-manager', () => ({
    lifecycleManager: {
        extendTimeout: mockLifecycleManagerExtendTimeout,
        getStats: mockLifecycleManagerGetStats,
        schedulePolling: mockLifecycleManagerSchedulePolling,
        get lastError() { return mockLifecycleManagerLastError() },
    },
}))

// Module under test
const { OrderOrchestrator } = await import('./order-orchestrator')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORDER_ID = 'act_001'
const USER_ID = 'user_001'
const PROVIDER_ID = 'provider_smshub'
const PHONE_NUMBER = '+1234567890'

const defaultPurchaseRequest = {
    userId: USER_ID,
    providerId: PROVIDER_ID,
    countryCode: '1',
    serviceCode: 'telegram',
    price: 1500,
}

function makeActivation(overrides: Record<string, any> = {}) {
    return {
        id: ORDER_ID,
        state: 'ACTIVE',
        userId: USER_ID,
        providerId: PROVIDER_ID,
        phoneNumber: PHONE_NUMBER,
        numberId: 'num_001',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600_000),
        ...overrides,
    }
}

function makeNumber(overrides: Record<string, any> = {}) {
    return {
        id: 'num_001',
        activationId: 'prov_act_001',
        provider: PROVIDER_ID,
        phoneNumber: PHONE_NUMBER,
        status: 'active',
        smsMessages: [
            { code: '123456', content: 'Your code: 123456', receivedAt: new Date() },
        ],
        expiresAt: new Date(Date.now() + 3600_000),
        ...overrides,
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    // Default healthy mocks
    mockWalletGetBalance.mockResolvedValue(10000)
    mockActivationServiceCreateWithReservation.mockResolvedValue({
        activationId: ORDER_ID,
        state: 'RESERVED',
        reservedTxId: 'tx_001',
    })
    mockProviderFindUnique.mockResolvedValue({ id: PROVIDER_ID, name: PROVIDER_ID })
    mockProviderFindFirst.mockResolvedValue({ id: PROVIDER_ID, name: PROVIDER_ID })
    mockRequestNumber.mockResolvedValue({
        activationId: 'prov_act_001',
        phoneNumber: PHONE_NUMBER,
    })
    mockGetProviderAdapter.mockReturnValue({ getNumber: mockRequestNumber })
    mockStateMachineCanTransition.mockReturnValue(true)
    mockStateMachineIsRefundable.mockReturnValue(true)
    mockLifecycleManagerGetStats.mockResolvedValue({ active: 5, pending: 2 })
    mockLifecycleManagerLastError.mockReturnValue(null)
    mockLifecycleManagerSchedulePolling.mockResolvedValue(undefined)
    mockDescribePollStrategy.mockReturnValue('standard/5s-30m')
})

beforeAll(() => {
    // Mock the dynamic import in purchase() for provider-factory
    // This needs to happen before the module is imported
})

// ---------------------------------------------------------------------------
// purchase()
// ---------------------------------------------------------------------------

describe('OrderOrchestrator.purchase', () => {
    it('executes a complete purchase flow successfully', async () => {
        mockRequestNumber.mockResolvedValue({
            activationId: 'prov_act_001',
            phoneNumber: PHONE_NUMBER,
        })

        const result = await OrderOrchestrator.purchase(defaultPurchaseRequest)

        expect(mockWalletGetBalance).toHaveBeenCalledWith(USER_ID)
        expect(mockActivationServiceCreateWithReservation).toHaveBeenCalledWith(
            expect.objectContaining({ userId: USER_ID, price: 1500 })
        )
        expect(result.success).toBe(true)
        expect(result.orderId).toBe(ORDER_ID)
        expect(result.phoneNumber).toBe(PHONE_NUMBER)
    })

    it('returns INSUFFICIENT_BALANCE when balance < price', async () => {
        mockWalletGetBalance.mockResolvedValue(500)

        const result = await OrderOrchestrator.purchase(defaultPurchaseRequest)

        expect(result.success).toBe(false)
        expect(result.errorCode).toBe('INSUFFICIENT_BALANCE')
        expect(mockActivationServiceCreateWithReservation).not.toHaveBeenCalled()
    })

    it('rolls back reservation and transitions to FAILED when provider not found', async () => {
        mockProviderFindUnique.mockResolvedValue(null)

        const result = await OrderOrchestrator.purchase(defaultPurchaseRequest)

        expect(mockWalletRollback).toHaveBeenCalledWith(
            USER_ID, 1500, ORDER_ID, expect.stringContaining('not found')
        )
        expect(mockKernelTransition).toHaveBeenCalledWith(
            ORDER_ID, 'FAILED', { reason: expect.stringContaining('not found') }
        )
        expect(result.success).toBe(false)
        expect(result.errorCode).toBe('INVALID_REQUEST')
    })

    it('rolls back reservation when provider requestNumber fails', async () => {
        mockRequestNumber.mockRejectedValue(new Error('Provider API down'))

        const result = await OrderOrchestrator.purchase(defaultPurchaseRequest)

        expect(mockWalletRollback).toHaveBeenCalled()
        expect(mockKernelTransition).toHaveBeenCalledWith(ORDER_ID, 'FAILED', { reason: expect.any(String) })
        expect(result.success).toBe(false)
        expect(result.errorCode).toBe('PROVIDER_ERROR')
    })
})

// ---------------------------------------------------------------------------
// getOrderStatus()
// ---------------------------------------------------------------------------

describe('OrderOrchestrator.getOrderStatus', () => {
    it('returns full order status when found with SMS', async () => {
        mockActivationFindFirst.mockResolvedValue(makeActivation())
        mockNumberFindUnique.mockResolvedValue(makeNumber())

        const status = await OrderOrchestrator.getOrderStatus(ORDER_ID, USER_ID)

        expect(status).not.toBeNull()
        expect(status!.orderId).toBe(ORDER_ID)
        expect(status!.state).toBe('ACTIVE')
        expect(status!.phoneNumber).toBe(PHONE_NUMBER)
        expect(status!.smsCount).toBe(1)
        expect(status!.canCancel).toBe(true)
        expect(status!.canRequestResend).toBe(true)
    })

    it('returns basic status when no numberId', async () => {
            mockActivationFindFirst.mockResolvedValue(makeActivation({ numberId: null, phoneNumber: null, state: 'RESERVED' }))

        const status = await OrderOrchestrator.getOrderStatus(ORDER_ID, USER_ID)

        expect(status).not.toBeNull()
        expect(status!.phoneNumber).toBeUndefined()
        expect(status!.smsCount).toBe(0)
            // RESERVED + no numberId → no SMS → canRequestResend false, but canCancel = true (state is RESERVED)
            expect(status!.canCancel).toBe(true)
            expect(status!.canRequestResend).toBe(false)
    })

    it('returns null when order not found', async () => {
        mockActivationFindFirst.mockResolvedValue(null)

        const status = await OrderOrchestrator.getOrderStatus(ORDER_ID, USER_ID)

        expect(status).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// cancelOrder()
// ---------------------------------------------------------------------------

describe('OrderOrchestrator.cancelOrder', () => {
    it('successfully cancels an active order with refund', async () => {
        mockActivationFindFirst.mockResolvedValue(makeActivation())
        mockNumberFindUnique.mockResolvedValue(makeNumber())
        mockSetCancel.mockResolvedValue({ status: 'success' })
        mockGetProviderAdapter.mockReturnValue({ setCancel: mockSetCancel })

        const result = await OrderOrchestrator.cancelOrder(ORDER_ID, USER_ID)

        expect(result.success).toBe(true)
        expect(mockActivationUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: ORDER_ID },
                data: { state: 'CANCELLED' },
            })
        )
        expect(mockNumberUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'num_001' },
                data: { status: 'cancelled' },
            })
        )
        expect(mockActivationServiceProcessRefund).toHaveBeenCalledWith(ORDER_ID)
    })

    it('returns not found when order missing', async () => {
        mockActivationFindFirst.mockResolvedValue(null)

        const result = await OrderOrchestrator.cancelOrder(ORDER_ID, USER_ID)

        expect(result.success).toBe(false)
        expect(result.error).toBe('Order not found')
    })

    it('returns error when state not cancellable', async () => {
        mockActivationFindFirst.mockResolvedValue(makeActivation())
        mockStateMachineCanTransition.mockReturnValue(false)

        const result = await OrderOrchestrator.cancelOrder(ORDER_ID, USER_ID)

        expect(result.success).toBe(false)
        expect(result.error).toContain('Cannot cancel')
    })

    it('handles provider cancel failure gracefully', async () => {
        mockActivationFindFirst.mockResolvedValue(makeActivation())
        mockNumberFindUnique.mockResolvedValue(makeNumber())
        mockSetCancel.mockRejectedValue(new Error('Provider timeout'))

        const result = await OrderOrchestrator.cancelOrder(ORDER_ID, USER_ID)

        // Should still succeed — provider cancel is best-effort
        expect(result.success).toBe(true)
        expect(mockActivationUpdate).toHaveBeenCalled()
    })

    it('uses cancelNumber fallback when setCancel is unavailable', async () => {
        mockActivationFindFirst.mockResolvedValue(makeActivation())
        mockNumberFindUnique.mockResolvedValue(makeNumber())
        mockCancelNumber.mockResolvedValue({ status: 'success' })
        mockGetProviderAdapter.mockReturnValue({ cancelNumber: mockCancelNumber })

        const result = await OrderOrchestrator.cancelOrder(ORDER_ID, USER_ID)

        expect(result.success).toBe(true)
        expect(mockCancelNumber).toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// requestResendCode()
// ---------------------------------------------------------------------------

describe('OrderOrchestrator.requestResendCode', () => {
    it('requests SMS resend and extends timeout for ACTIVE order', async () => {
        mockActivationFindFirst.mockResolvedValue(makeActivation())
        mockNumberFindUnique.mockResolvedValue(makeNumber())
        mockProviderFindFirst.mockResolvedValue({ id: PROVIDER_ID, name: PROVIDER_ID })
        mockMultiSmsHandlerRequestNextSms.mockResolvedValue(true)
        mockLifecycleManagerExtendTimeout.mockResolvedValue(undefined)

        const result = await OrderOrchestrator.requestResendCode(ORDER_ID, USER_ID)

        expect(result.success).toBe(true)
        expect(mockMultiSmsHandlerRequestNextSms).toHaveBeenCalledWith(
            'num_001', 'prov_act_001', PROVIDER_ID
        )
        expect(mockLifecycleManagerExtendTimeout).toHaveBeenCalledWith(
            'num_001', 'prov_act_001', USER_ID
        )
    })

    it('returns error when order not found', async () => {
        mockActivationFindFirst.mockResolvedValue(null)

        const { success, error } = await OrderOrchestrator.requestResendCode(ORDER_ID, USER_ID)

        expect(success).toBe(false)
        expect(error).toBe('Order not found')
    })

    it('returns error when order is not ACTIVE', async () => {
        mockActivationFindFirst.mockResolvedValue(makeActivation({ state: 'RESERVED' }))

        const { success, error } = await OrderOrchestrator.requestResendCode(ORDER_ID, USER_ID)

        expect(success).toBe(false)
        expect(error).toBe('Order is not active')
    })

    it('returns error when no SMS received yet', async () => {
        mockActivationFindFirst.mockResolvedValue(makeActivation())
        mockNumberFindUnique.mockResolvedValue(makeNumber({ smsMessages: [] }))

        const { success, error } = await OrderOrchestrator.requestResendCode(ORDER_ID, USER_ID)

        expect(success).toBe(false)
        expect(error).toContain('No SMS received')
    })

    it('returns error when provider not found', async () => {
        mockActivationFindFirst.mockResolvedValue(makeActivation())
        mockNumberFindUnique.mockResolvedValue(makeNumber())
        mockProviderFindFirst.mockResolvedValue(null)

        const { success, error } = await OrderOrchestrator.requestResendCode(ORDER_ID, USER_ID)

        expect(success).toBe(false)
        expect(error).toBe('Provider not found')
    })

    it('returns error when MultiSmsHandler returns false', async () => {
        mockActivationFindFirst.mockResolvedValue(makeActivation())
        mockNumberFindUnique.mockResolvedValue(makeNumber())
        mockProviderFindFirst.mockResolvedValue({ id: PROVIDER_ID, name: PROVIDER_ID })
        mockMultiSmsHandlerRequestNextSms.mockResolvedValue(false)

        const { success, error } = await OrderOrchestrator.requestResendCode(ORDER_ID, USER_ID)

        expect(success).toBe(false)
        expect(error).toContain('does not support')
    })
})

// ---------------------------------------------------------------------------
// runBatchPoll()
// ---------------------------------------------------------------------------

describe('OrderOrchestrator.runBatchPoll', () => {
    it('polls active numbers and returns counts', async () => {
        mockGetActiveNumbersForPolling.mockResolvedValue([{ id: 'num_1' }, { id: 'num_2' }])
        mockBatchPollManagerPoolBatch.mockResolvedValue([
            { id: 'num_1', messages: [{ code: '111111' }] },
            { id: 'num_2', messages: [] },
        ])

        const result = await OrderOrchestrator.runBatchPoll()

        expect(result.polled).toBe(2)
        expect(result.smsReceived).toBe(1)
    })

    it('returns zero counts when no active numbers', async () => {
        mockGetActiveNumbersForPolling.mockResolvedValue([])

        const result = await OrderOrchestrator.runBatchPoll()

        expect(result.polled).toBe(0)
        expect(result.smsReceived).toBe(0)
        expect(mockBatchPollManagerPoolBatch).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// getHealthStatus()
// ---------------------------------------------------------------------------

describe('OrderOrchestrator.getHealthStatus', () => {
    it('returns system health with active order count and poll strategy', async () => {
        mockNumberCount.mockResolvedValue(7)
        mockLifecycleManagerGetStats.mockResolvedValue({ active: 5, pending: 2 })
        mockLifecycleManagerLastError.mockReturnValue(null)
        mockDescribePollStrategy.mockReturnValue('aggressive/3s-15m')

        const status = await OrderOrchestrator.getHealthStatus()

        expect(status.activeOrders).toBe(7)
        expect(status.lifecycleManager.initialized).toBe(true)
        expect(status.lifecycleManager.error).toBeUndefined()
        expect(status.pollStrategy).toBe('aggressive/3s-15m')
    })

    it('shows lifecycle error when lastError is set', async () => {
        mockNumberCount.mockResolvedValue(3)
        mockLifecycleManagerGetStats.mockResolvedValue({ active: 3, pending: 0 })
        mockLifecycleManagerLastError.mockReturnValue('Redis connection timeout')

        const status = await OrderOrchestrator.getHealthStatus()

        expect(status.lifecycleManager.initialized).toBe(false)
        expect(status.lifecycleManager.error).toBe('Redis connection timeout')
    })
})