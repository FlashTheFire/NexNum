import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — all sub-workers must be hoisted before module import
// ---------------------------------------------------------------------------

const mockProcessActivationOutbox = vi.fn()
const mockProcessOutboxEvents = vi.fn()
const mockProcessPushBatch = vi.fn()
const mockProcessInboxBatch = vi.fn()

vi.mock('@/lib/activation/activation-outbox-worker', () => ({
    processActivationOutbox: (...args: any[]) => mockProcessActivationOutbox(...args),
}))

vi.mock('@/lib/activation/outbox', () => ({
    processOutboxEvents: (...args: any[]) => mockProcessOutboxEvents(...args),
}))

vi.mock('@/workers/push-worker', () => ({
    processPushBatch: (...args: any[]) => mockProcessPushBatch(...args),
}))

vi.mock('@/workers/inbox-worker', () => ({
    processInboxBatch: (...args: any[]) => mockProcessInboxBatch(...args),
}))

vi.mock('@/lib/core/logger', () => ({
    logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    },
}))

// Import SUT after mocks
import { runMasterWorker } from '@/workers/master-worker'

// ---------------------------------------------------------------------------
// runMasterWorker — orchestration
// ---------------------------------------------------------------------------

describe('runMasterWorker — orchestration', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Default: every sub-worker returns a recognizable shape
        mockProcessActivationOutbox.mockResolvedValue({ processed: 5, failed: 0 })
        mockProcessOutboxEvents.mockResolvedValue({ indexed: 3 })
        mockProcessInboxBatch.mockResolvedValue({ received: 2 })
        mockProcessPushBatch.mockResolvedValue({ sent: 1, failed: 0 })
    })

    it('calls all 4 active sub-workers in priority order', async () => {
        const callOrder: string[] = []
        mockProcessActivationOutbox.mockImplementation(async () => {
            callOrder.push('outbox')
            return { processed: 0 }
        })
        mockProcessOutboxEvents.mockImplementation(async () => {
            callOrder.push('searchSync')
            return { indexed: 0 }
        })
        mockProcessInboxBatch.mockImplementation(async () => {
            callOrder.push('inbox')
            return { received: 0 }
        })
        mockProcessPushBatch.mockImplementation(async () => {
            callOrder.push('push')
            return { sent: 0 }
        })

        await runMasterWorker()

        expect(callOrder).toEqual(['outbox', 'searchSync', 'inbox', 'push'])
    })

    it('passes correct batch size to each sub-worker', async () => {
        await runMasterWorker()
        expect(mockProcessActivationOutbox).toHaveBeenCalledWith(20)
        expect(mockProcessOutboxEvents).toHaveBeenCalledWith(20)
        expect(mockProcessInboxBatch).toHaveBeenCalledWith(50)
        expect(mockProcessPushBatch).toHaveBeenCalledWith(50)
    })

    it('returns a MasterWorkerResult with timestamp, duration, and all sub-worker results', async () => {
        const before = Date.now()
        const result = await runMasterWorker()
        const after = Date.now()

        expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        expect(new Date(result.timestamp).getTime()).toBeGreaterThanOrEqual(before)
        expect(new Date(result.timestamp).getTime()).toBeLessThanOrEqual(after)
        expect(result.duration).toBeGreaterThanOrEqual(0)
        expect(result.duration).toBeLessThanOrEqual(after - before + 50)
        expect(result.outbox).toEqual({ processed: 5, failed: 0 })
        expect(result.searchSync).toEqual({ indexed: 3 })
        expect(result.inbox).toEqual({ received: 2 })
        expect(result.notifications).toEqual({ sent: 1, failed: 0 })
        expect(result.reconcile).toBeNull()  // Moved to cron
        expect(result.reservations).toBeNull()  // Moved to cron
        expect(result.errors).toEqual([])
    })

    it('returns empty errors array when all sub-workers succeed', async () => {
        const result = await runMasterWorker()
        expect(result.errors).toEqual([])
    })

    it('does not throw when all sub-workers succeed', async () => {
        await expect(runMasterWorker()).resolves.toBeDefined()
    })
})

// ---------------------------------------------------------------------------
// Error isolation — each sub-worker is wrapped in its own try/catch
// ---------------------------------------------------------------------------

describe('runMasterWorker — error isolation', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockProcessActivationOutbox.mockResolvedValue({ processed: 0 })
        mockProcessOutboxEvents.mockResolvedValue({ indexed: 0 })
        mockProcessInboxBatch.mockResolvedValue({ received: 0 })
        mockProcessPushBatch.mockResolvedValue({ sent: 0 })
    })

    it('isolates outbox failure — other workers still run', async () => {
        mockProcessActivationOutbox.mockRejectedValue(new Error('outbox down'))
        const result = await runMasterWorker()
        expect(result.errors).toContain('Outbox: outbox down')
        // searchSync, inbox, push should still be called and assigned
        expect(result.searchSync).toEqual({ indexed: 0 })
        expect(result.inbox).toEqual({ received: 0 })
        expect(result.notifications).toEqual({ sent: 0 })
    })

    it('isolates searchSync failure — outbox and inbox still run', async () => {
        mockProcessOutboxEvents.mockRejectedValue(new Error('sync broken'))
        const result = await runMasterWorker()
        expect(result.errors).toContain('SearchSync: sync broken')
        expect(result.outbox).toEqual({ processed: 0 })
        expect(result.inbox).toEqual({ received: 0 })
    })

    it('isolates inbox failure — push still runs', async () => {
        mockProcessInboxBatch.mockRejectedValue(new Error('inbox down'))
        const result = await runMasterWorker()
        expect(result.errors).toContain('Inbox: inbox down')
        expect(result.notifications).toEqual({ sent: 0 })
    })

    it('isolates push failure — outbox already ran', async () => {
        mockProcessPushBatch.mockRejectedValue(new Error('push down'))
        const result = await runMasterWorker()
        expect(result.errors).toContain('Push: push down')
        expect(result.outbox).toEqual({ processed: 0 })
    })

    it('aggregates all sub-worker failures into a single errors array', async () => {
        mockProcessActivationOutbox.mockRejectedValue(new Error('e1'))
        mockProcessOutboxEvents.mockRejectedValue(new Error('e2'))
        mockProcessInboxBatch.mockRejectedValue(new Error('e3'))
        mockProcessPushBatch.mockRejectedValue(new Error('e4'))
        const result = await runMasterWorker()
        expect(result.errors).toEqual([
            'Outbox: e1',
            'SearchSync: e2',
            'Inbox: e3',
            'Push: e4',
        ])
    })

    it('handles non-Error thrown values (strings, plain objects)', async () => {
        mockProcessActivationOutbox.mockRejectedValue('string-error')
        mockProcessOutboxEvents.mockRejectedValue({ code: 'X' })
        const result = await runMasterWorker()
        expect(result.errors).toContain('Outbox: string-error')
        expect(result.errors).toContain('SearchSync: [object Object]')
    })

    it('does not throw even when every sub-worker rejects', async () => {
        mockProcessActivationOutbox.mockRejectedValue(new Error('a'))
        mockProcessOutboxEvents.mockRejectedValue(new Error('b'))
        mockProcessInboxBatch.mockRejectedValue(new Error('c'))
        mockProcessPushBatch.mockRejectedValue(new Error('d'))
        await expect(runMasterWorker()).resolves.toBeDefined()
    })
})

// ---------------------------------------------------------------------------
// Rejection independence — one failure should not skip subsequent workers
// ---------------------------------------------------------------------------

describe('runMasterWorker — sequential independence', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockProcessActivationOutbox.mockResolvedValue({ processed: 0 })
        mockProcessOutboxEvents.mockResolvedValue({ indexed: 0 })
        mockProcessInboxBatch.mockResolvedValue({ received: 0 })
        mockProcessPushBatch.mockResolvedValue({ sent: 0 })
    })

    it('runs inbox even when outbox and searchSync fail', async () => {
        const calls: string[] = []
        mockProcessActivationOutbox.mockImplementation(async () => {
            calls.push('outbox')
            throw new Error('boom')
        })
        mockProcessOutboxEvents.mockImplementation(async () => {
            calls.push('searchSync')
            throw new Error('boom')
        })
        mockProcessInboxBatch.mockImplementation(async () => {
            calls.push('inbox')
            return { received: 7 }
        })
        mockProcessPushBatch.mockImplementation(async () => {
            calls.push('push')
            return { sent: 4 }
        })

        const result = await runMasterWorker()
        expect(calls).toEqual(['outbox', 'searchSync', 'inbox', 'push'])
        expect(result.inbox).toEqual({ received: 7 })
        expect(result.notifications).toEqual({ sent: 4 })
    })
})
