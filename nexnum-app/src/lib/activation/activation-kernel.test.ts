/**
 * ActivationKernel — Unit Tests
 *
 * Tests the Golden Transition pattern: atomic state transitions with
 * forensic history logging, outbox dispatching, and user event emission.
 *
 * All Prisma, metrics, logger, and event dispatch calls are mocked.
 * No database required.
 *
 * Critical invariants:
 *  - Invalid transitions → throws via ActivationStateMachine.validateTransition
 *  - Self-transitions → idempotent skip (no-op)
 *  - Valid transitions → state update + forensic history + metrics + side effects
 *  - External tx → runs within caller's transaction (no prisma.$transaction wrapper)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockFindUniqueOrThrow = vi.fn()
const mockActivationUpdate = vi.fn()
const mockHistoryCreate = vi.fn()
const mockOutboxCreate = vi.fn()
const mockTransaction = vi.fn()
const mockInc = vi.fn()
const mockLabels = vi.fn().mockReturnValue({ inc: mockInc })

vi.mock('@/lib/core/db', () => ({
    prisma: {
        $transaction: mockTransaction,
        activation: {
            findUniqueOrThrow: mockFindUniqueOrThrow,
            update: mockActivationUpdate,
        },
        activationStateHistory: {
            create: mockHistoryCreate,
        },
        outboxEvent: {
            create: mockOutboxCreate,
        },
    },
}))

vi.mock('@/lib/core/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/events/emitters/state-emitter', () => ({
    emitStateUpdate: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/core/event-dispatcher', () => ({
    EventDispatcher: {
        dispatch: vi.fn().mockResolvedValue(undefined),
    },
}))

vi.mock('@/lib/metrics', () => ({
    order_state_transitions_total: { inc: mockInc, labels: mockLabels },
}))

// Import the mocked EventDispatcher for direct assertions
const { EventDispatcher } = await import('@/lib/core/event-dispatcher')

// Module under test — must import AFTER mocks
const { ActivationKernel } = await import('./activation-kernel')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACTIVATION_ID = 'act_12345'
const USER_ID = 'user_test_001'
const PROVIDER_ID = 'provider_smshub'

function makeActivation(overrides: Record<string, any> = {}) {
    return {
        id: ACTIVATION_ID,
        state: 'INIT' as const,
        userId: USER_ID,
        providerId: PROVIDER_ID,
        ...overrides,
    }
}

/** Simulate the inner tx proxy: returns the same mock activation client */
function mockTxClient(): any {
    return {
        activation: {
            findUniqueOrThrow: mockFindUniqueOrThrow,
            update: mockActivationUpdate,
        },
        activationStateHistory: {
            create: mockHistoryCreate,
        },
        outboxEvent: {
            create: mockOutboxCreate,
        },
    }
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Transition — Happy path
// ---------------------------------------------------------------------------

describe('ActivationKernel.transition', () => {
    it('performs a valid INIT → RESERVED transition with forensic history', async () => {
        const activation = makeActivation({ state: 'INIT' })
        mockFindUniqueOrThrow.mockResolvedValue(activation)
        mockActivationUpdate.mockResolvedValue({
            ...activation,
            state: 'RESERVED',
            traceId: 'trace-1',
        })
        mockTransaction.mockImplementation(async (cb: Function) => {
            return cb(mockTxClient())
        })

        const result = await ActivationKernel.transition(ACTIVATION_ID, 'RESERVED', {
            reason: 'User initiated purchase',
        })

        // State updated
        expect(mockActivationUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: ACTIVATION_ID },
                data: expect.objectContaining({ state: 'RESERVED' }),
            })
        )

        // Forensic history created
        expect(mockHistoryCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    activationId: ACTIVATION_ID,
                    state: 'RESERVED',
                    previousState: 'INIT',
                    reason: 'User initiated purchase',
                }),
            })
        )

        // Metrics incremented
        expect(mockInc).toHaveBeenCalled()

        // Returns updated activation
        expect(result.state).toBe('RESERVED')
    })

    it('skips duplicate self-transitions (idempotent)', async () => {
        const activation = makeActivation({ state: 'ACTIVE' })
        mockFindUniqueOrThrow.mockResolvedValue(activation)
            mockTransaction.mockImplementation(async (cb: Function) => {
                return cb(mockTxClient())
            })

            const result = await ActivationKernel.transition(ACTIVATION_ID, 'ACTIVE')

            // No update, no history, no metrics (the transaction wrapper still runs)
            expect(mockActivationUpdate).not.toHaveBeenCalled()
            expect(mockHistoryCreate).not.toHaveBeenCalled()
            expect(mockInc).not.toHaveBeenCalled()
            expect(result.state).toBe('ACTIVE')
        })

    it('rejects an invalid transition (INIT → RECEIVED)', async () => {
        const activation = makeActivation({ state: 'INIT' })
        mockFindUniqueOrThrow.mockResolvedValue(activation)
        mockTransaction.mockImplementation(async (cb: Function) => {
            return cb(mockTxClient())
        })

        await expect(
            ActivationKernel.transition(ACTIVATION_ID, 'RECEIVED')
        ).rejects.toThrow(/Invalid Transition|INIT.*RECEIVED/)
    })

    it('rejects an invalid transition (REFUNDED → ACTIVE)', async () => {
        const activation = makeActivation({ state: 'REFUNDED' })
        mockFindUniqueOrThrow.mockResolvedValue(activation)
        mockTransaction.mockImplementation(async (cb: Function) => {
            return cb(mockTxClient())
        })

        await expect(
            ActivationKernel.transition(ACTIVATION_ID, 'ACTIVE')
        ).rejects.toThrow(/Invalid Transition|REFUNDED.*ACTIVE/)
    })

    it('uses existing tx when provided (no prisma.$transaction call)', async () => {
        const activation = makeActivation({ state: 'INIT' })
        mockFindUniqueOrThrow.mockResolvedValue(activation)
        mockActivationUpdate.mockResolvedValue({
            ...activation,
            state: 'RESERVED',
        })

        // Simulate caller providing their own tx
        const tx = mockTxClient()
        tx.activation.findUniqueOrThrow = mockFindUniqueOrThrow
        tx.activation.update = mockActivationUpdate

        await ActivationKernel.transition(ACTIVATION_ID, 'RESERVED', { tx })

        // Should NOT call prisma.$transaction
        expect(mockTransaction).not.toHaveBeenCalled()
    })

    it('preserves traceId through the transition', async () => {
        const activation = makeActivation({ state: 'INIT' })
        const traceId = 'manual-trace-001'
        mockFindUniqueOrThrow.mockResolvedValue(activation)
        mockActivationUpdate.mockResolvedValue({
            ...activation,
            state: 'RESERVED',
            traceId,
        })
        mockTransaction.mockImplementation(async (cb: Function) => {
            return cb(mockTxClient())
        })

        await ActivationKernel.transition(ACTIVATION_ID, 'RESERVED', { traceId })

        expect(mockActivationUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ traceId }),
            })
        )

        expect(mockHistoryCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ traceId }),
            })
        )
    })
})

// ---------------------------------------------------------------------------
// dispatchEvent
// ---------------------------------------------------------------------------

describe('ActivationKernel.dispatchEvent', () => {
    it('creates an outbox event with PENDING status', async () => {
        const tx = mockTxClient()
        const payload = { providerActivationId: 'prov_999', providerId: PROVIDER_ID }

        await ActivationKernel.dispatchEvent(ACTIVATION_ID, 'saga.compensate.set_cancel', payload, tx)

        expect(mockOutboxCreate).toHaveBeenCalledWith({
            data: {
                aggregateType: 'activation',
                aggregateId: ACTIVATION_ID,
                eventType: 'saga.compensate.set_cancel',
                payload,
                status: 'PENDING',
            },
        })
    })
})

// ---------------------------------------------------------------------------
// Side effects (indirect via transition)
// ---------------------------------------------------------------------------

describe('ActivationKernel — side effects', () => {
    it('emits ACTIVE state via EventDispatcher and state-emitter', async () => {
        const activation = makeActivation({ state: 'RESERVED' })
        mockFindUniqueOrThrow.mockResolvedValue(activation)
        mockActivationUpdate.mockResolvedValue({
            ...activation,
            state: 'ACTIVE',
        })
        mockTransaction.mockImplementation(async (cb: Function) => {
            return cb(mockTxClient())
        })

        // Side effects are fire-and-forget; give them time to flush
        await ActivationKernel.transition(ACTIVATION_ID, 'ACTIVE', { reason: 'Number acquired' })

        // Wait a tick for .catch() handlers
                await vi.waitFor(() => {
                    expect(EventDispatcher.dispatch).toHaveBeenCalledWith(
                        USER_ID,
                        'activation.active',
                        expect.objectContaining({ activationId: ACTIVATION_ID })
                    )
                }, { timeout: 1000 })
    })
})