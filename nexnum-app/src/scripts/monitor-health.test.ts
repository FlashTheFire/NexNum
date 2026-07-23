/**
 * System Health Monitor — Unit Tests
 *
 * Verifies the alert generation + dispatch logic without touching real DB/notify
 * channels. Covers threshold detection, severity classification, and dispatch
 * routing (notification + Sentry).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGroupBy = vi.fn()
const mockProviderFindUnique = vi.fn()
const mockProviderFindMany = vi.fn()
vi.mock('@/lib/core/db', () => ({
    prisma: {
        providerHealthLog: { groupBy: (...args: any[]) => mockGroupBy(...args) },
        provider: {
            findUnique: (...args: any[]) => mockProviderFindUnique(...args),
            findMany: (...args: any[]) => mockProviderFindMany(...args),
        },
    },
}))

const mockAlert = vi.fn()
vi.mock('@/lib/notifications/manager', () => ({
    notificationManager: { alert: (...args: any[]) => mockAlert(...args) },
}))

const mockCaptureMessage = vi.fn()
vi.mock('@/lib/monitoring/sentry', () => ({
    captureMessage: (...args: any[]) => mockCaptureMessage(...args),
}))

vi.mock('@/lib/core/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { runHealthCheck } = await import('./monitor-health')

// ---------------------------------------------------------------------------
// Fixtures & setup
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.clearAllMocks()
    mockGroupBy.mockResolvedValue([])
    mockProviderFindMany.mockResolvedValue([])
    mockProviderFindUnique.mockResolvedValue(null)
    mockAlert.mockResolvedValue(undefined)
    mockCaptureMessage.mockImplementation(() => undefined)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runHealthCheck — nominal', () => {
    it('returns empty alert list when all providers are healthy', async () => {
        mockGroupBy.mockResolvedValue([
            { providerId: 'p1', _avg: { successRate: 99, avgLatency: 200 }, _sum: { errorCount: 0 } },
        ])
        mockProviderFindUnique.mockResolvedValue({ id: 'p1', name: 'provider-a' })
        mockProviderFindMany.mockResolvedValue([
            { id: 'p1', name: 'provider-a', balance: 100, lowBalanceAlert: 10, isActive: true },
        ])

        const alerts = await runHealthCheck()

        expect(alerts).toEqual([])
        expect(mockAlert).not.toHaveBeenCalled()
        expect(mockCaptureMessage).not.toHaveBeenCalled()
    })
})

describe('runHealthCheck — provider health', () => {
    it('emits CRITICAL when success rate below threshold', async () => {
        mockGroupBy.mockResolvedValue([
            { providerId: 'p1', _avg: { successRate: 30, avgLatency: 1000 }, _sum: { errorCount: 70 } },
        ])
        mockProviderFindUnique.mockResolvedValue({ id: 'p1', name: 'provider-a' })

        const alerts = await runHealthCheck()

        expect(alerts).toHaveLength(1)
        expect(alerts[0].level).toBe('CRITICAL')
        expect(alerts[0].type).toBe('PROVIDER_HEALTH')
        expect(alerts[0].message).toContain('30.0%')
    })

    it('emits WARNING when latency above threshold but success ok', async () => {
        mockGroupBy.mockResolvedValue([
            { providerId: 'p1', _avg: { successRate: 90, avgLatency: 6000 }, _sum: { errorCount: 5 } },
        ])
        mockProviderFindUnique.mockResolvedValue({ id: 'p1', name: 'slow-provider' })

        const alerts = await runHealthCheck()

        expect(alerts).toHaveLength(1)
        expect(alerts[0].level).toBe('WARNING')
        expect(alerts[0].type).toBe('PROVIDER_LATENCY')
    })

    it('skips log entries whose provider no longer exists', async () => {
        mockGroupBy.mockResolvedValue([
            { providerId: 'orphan', _avg: { successRate: 10, avgLatency: 9000 }, _sum: { errorCount: 99 } },
        ])
        mockProviderFindUnique.mockResolvedValue(null)

        const alerts = await runHealthCheck()
        expect(alerts).toEqual([])
    })

    it('treats missing successRate as 100% (no alert)', async () => {
        mockGroupBy.mockResolvedValue([
            { providerId: 'p1', _avg: { successRate: null, avgLatency: 100 }, _sum: { errorCount: 0 } },
        ])
        mockProviderFindUnique.mockResolvedValue({ id: 'p1', name: 'provider-a' })

        const alerts = await runHealthCheck()
        expect(alerts).toEqual([])
    })
})

describe('runHealthCheck — provider balance', () => {
    it('emits WARNING when balance below alert threshold', async () => {
        mockProviderFindMany.mockResolvedValue([
            { id: 'p1', name: 'provider-a', balance: 5, lowBalanceAlert: 10, isActive: true },
        ])

        const alerts = await runHealthCheck()

        expect(alerts).toHaveLength(1)
        expect(alerts[0].level).toBe('WARNING')
        expect(alerts[0].type).toBe('LOW_BALANCE')
        expect(alerts[0].message).toContain('balance low')
    })

    it('does not emit when balance equals threshold (only strictly below)', async () => {
        mockProviderFindMany.mockResolvedValue([
            { id: 'p1', name: 'provider-a', balance: 10, lowBalanceAlert: 10, isActive: true },
        ])

        const alerts = await runHealthCheck()
        expect(alerts).toEqual([])
    })

    it('does not emit when threshold is zero (disabled)', async () => {
        mockProviderFindMany.mockResolvedValue([
            { id: 'p1', name: 'provider-a', balance: 0, lowBalanceAlert: 0, isActive: true },
        ])

        const alerts = await runHealthCheck()
        expect(alerts).toEqual([])
    })
})

describe('runHealthCheck — dispatch', () => {
    it('routes CRITICAL alerts to notificationManager.alert with severity=critical', async () => {
        mockGroupBy.mockResolvedValue([
            { providerId: 'p1', _avg: { successRate: 5, avgLatency: 100 }, _sum: { errorCount: 95 } },
        ])
        mockProviderFindUnique.mockResolvedValue({ id: 'p1', name: 'provider-a' })

        await runHealthCheck()

        expect(mockAlert).toHaveBeenCalledTimes(1)
        const [title, message, severity] = mockAlert.mock.calls[0]
        expect(title).toMatch(/CRITICAL/)
        expect(title).toMatch(/PROVIDER HEALTH/)
        expect(severity).toBe('critical')
        expect(message).toContain('provider-a')
    })

    it('routes WARNING alerts with severity=warning', async () => {
        mockGroupBy.mockResolvedValue([
            { providerId: 'p1', _avg: { successRate: 80, avgLatency: 7000 }, _sum: { errorCount: 3 } },
        ])
        mockProviderFindUnique.mockResolvedValue({ id: 'p1', name: 'provider-a' })

        await runHealthCheck()

        expect(mockAlert).toHaveBeenCalledTimes(1)
        const [, , severity] = mockAlert.mock.calls[0]
        expect(severity).toBe('warning')
    })

    it('sends CRITICAL alerts to Sentry as well', async () => {
        mockGroupBy.mockResolvedValue([
            { providerId: 'p1', _avg: { successRate: 5, avgLatency: 100 }, _sum: { errorCount: 95 } },
        ])
        mockProviderFindUnique.mockResolvedValue({ id: 'p1', name: 'provider-a' })

        await runHealthCheck()

        expect(mockCaptureMessage).toHaveBeenCalledTimes(1)
        expect(mockCaptureMessage.mock.calls[0][1]).toBe('error')
    })

    it('does NOT send WARNING alerts to Sentry', async () => {
        mockProviderFindMany.mockResolvedValue([
            { id: 'p1', name: 'provider-a', balance: 1, lowBalanceAlert: 10, isActive: true },
        ])

        await runHealthCheck()

        expect(mockAlert).toHaveBeenCalledTimes(1)
        expect(mockCaptureMessage).not.toHaveBeenCalled()
    })

    it('continues dispatching when a single notification channel throws', async () => {
        mockGroupBy.mockResolvedValue([
            { providerId: 'p1', _avg: { successRate: 5, avgLatency: 100 }, _sum: { errorCount: 95 } },
            { providerId: 'p2', _avg: { successRate: 99, avgLatency: 7000 }, _sum: { errorCount: 0 } },
        ])
        mockProviderFindUnique
            .mockResolvedValueOnce({ id: 'p1', name: 'provider-a' })
            .mockResolvedValueOnce({ id: 'p2', name: 'provider-b' })

        // First notification throws, second succeeds
        mockAlert
            .mockRejectedValueOnce(new Error('telegram down'))
            .mockResolvedValueOnce(undefined)

        const alerts = await runHealthCheck()

        // Both alerts were still detected
        expect(alerts).toHaveLength(2)
        // Both alerts were attempted
        expect(mockAlert).toHaveBeenCalledTimes(2)
    })

    it('combines health alerts and balance alerts in one run', async () => {
        mockGroupBy.mockResolvedValue([
            { providerId: 'p1', _avg: { successRate: 10, avgLatency: 100 }, _sum: { errorCount: 90 } },
        ])
        mockProviderFindUnique.mockResolvedValue({ id: 'p1', name: 'provider-a' })
        mockProviderFindMany.mockResolvedValue([
            { id: 'p2', name: 'provider-b', balance: 0, lowBalanceAlert: 5, isActive: true },
        ])

        const alerts = await runHealthCheck()

        expect(alerts).toHaveLength(2)
        expect(alerts.map((a: any) => a.type).sort()).toEqual(['LOW_BALANCE', 'PROVIDER_HEALTH'])
    })
})
