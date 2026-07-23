/**
 * Provider Health Monitor — Unit Tests
 *
 * Tests the circuit breaker, sliding window, latency tracking, and recovery logic.
 * All Redis, Prisma, and metrics are mocked.
 *
 * Critical invariants verified:
 *  - Circuit breaker opens at failureThreshold
 *  - Circuit breaker uses exponential backoff
 *  - Half-open → closed after halfOpenRequests successes
 *  - Closed → open → half-open → closed transitions
 *  - Success rate calculated with time decay weighting
 *  - Country-specific keys isolated from GLOBAL key
 *  - Latency list capped at 100 entries
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks — declared at top, configured in beforeEach via vi.clearAllMocks
// ---------------------------------------------------------------------------

const mockZadd = vi.fn().mockResolvedValue(1)
const mockZremrangebyscore = vi.fn().mockResolvedValue(0)
const mockZrange = vi.fn()
const mockLpush = vi.fn().mockResolvedValue(1)
const mockLrange = vi.fn()
const mockLtrim = vi.fn().mockResolvedValue('OK')
const mockExpire = vi.fn().mockResolvedValue(1)
const mockGet = vi.fn()
const mockSet = vi.fn()
const mockDel = vi.fn()
const mockIncr = vi.fn()
const mockDecr = vi.fn()
const mockTtl = vi.fn()

vi.mock('@/lib/core/redis', () => ({
    redis: {
        zadd: (...args: any[]) => mockZadd(...args),
        zremrangebyscore: (...args: any[]) => mockZremrangebyscore(...args),
        zrange: (...args: any[]) => mockZrange(...args),
        lpush: (...args: any[]) => mockLpush(...args),
        lrange: (...args: any[]) => mockLrange(...args),
        ltrim: (...args: any[]) => mockLtrim(...args),
        expire: (...args: any[]) => mockExpire(...args),
        get: (...args: any[]) => mockGet(...args),
        set: (...args: any[]) => mockSet(...args),
        del: (...args: any[]) => mockDel(...args),
        incr: (...args: any[]) => mockIncr(...args),
        decr: (...args: any[]) => mockDecr(...args),
        ttl: (...args: any[]) => mockTtl(...args),
    },
}))

const mockProviderHealthLogCreate = vi.fn()

vi.mock('@/lib/core/db', () => ({
    prisma: {
        providerHealthLog: {
            create: (...args: any[]) => mockProviderHealthLogCreate(...args),
        },
        provider: {
            findMany: vi.fn().mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]),
        },
    },
}))

vi.mock('@/lib/core/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockLatencySet = vi.fn()
const mockStatusSet = vi.fn()
const mockSuccessRateSet = vi.fn()

vi.mock('@/lib/metrics', () => ({
    provider_health_latency_avg: { set: mockLatencySet },
    provider_health_status: { set: mockStatusSet },
    provider_health_success_rate: { set: mockSuccessRateSet },
}))

/**
 * IMPORTANT: health-monitor.ts uses a module-level `healthCache` Map that
 * persists across tests. We re-import the module in each beforeEach via
 * `vi.resetModules()` to wipe the cache and re-execute the module body.
 */
async function importFreshHealthMonitor() {
    vi.resetModules()
    return await import('./health-monitor')
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROVIDER_ID = 'prov_test'

let HealthMonitor: any

beforeAll(async () => {
    const mod = await import('./health-monitor')
    HealthMonitor = mod.HealthMonitor
})

beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue(null)
    mockTtl.mockResolvedValue(30)
    mockIncr.mockResolvedValue(1)
    mockDecr.mockResolvedValue(0)
    mockZrange.mockResolvedValue([])
    mockLrange.mockResolvedValue([])
})

// ---------------------------------------------------------------------------
// recordRequest
// ---------------------------------------------------------------------------

describe('HealthMonitor.recordRequest', () => {
    it('writes request payload to global and facet sorted sets with current timestamp', async () => {
        const monitor = new HealthMonitor()
        const before = Date.now()

        await monitor.recordRequest(PROVIDER_ID, true, 100, '1')

        const after = Date.now()
        expect(mockZadd).toHaveBeenCalledTimes(2)

        const globalCall = mockZadd.mock.calls.find((c: any[]) => c[0] === `health:${PROVIDER_ID}:requests`)
        expect(globalCall).toBeDefined()
        const [key, score, payload] = globalCall!
        expect(key).toBe(`health:${PROVIDER_ID}:requests`)
        expect(score).toBeGreaterThanOrEqual(before)
        expect(score).toBeLessThanOrEqual(after)
        const parsed = JSON.parse(payload)
        expect(parsed.success).toBe(true)
        expect(parsed.latency).toBe(100)

        const facetCall = mockZadd.mock.calls.find((c: any[]) => c[0] === `health:${PROVIDER_ID}:1:requests`)
        expect(facetCall).toBeDefined()
    })

    it('uses "GLOBAL" facet when no country provided', async () => {
        const monitor = new HealthMonitor()
        await monitor.recordRequest(PROVIDER_ID, true, 100)

        const facetCall = mockZadd.mock.calls.find((c: any[]) => c[0] === `health:${PROVIDER_ID}:GLOBAL:requests`)
        expect(facetCall).toBeDefined()
    })

    it('prunes entries older than the configured window', async () => {
        const monitor = new HealthMonitor({ window: 60 })
        await monitor.recordRequest(PROVIDER_ID, true)

        expect(mockZremrangebyscore).toHaveBeenCalledTimes(2)
        const call = mockZremrangebyscore.mock.calls[0]
        expect(call[0]).toMatch(/^health:prov_test:/)
        expect(call[1]).toBe(0)
        expect(typeof call[2]).toBe('number')
    })

    it('updates latency metric and stores in list when latency > 0', async () => {
        const monitor = new HealthMonitor()
        await monitor.recordRequest(PROVIDER_ID, true, 250)

        expect(mockLpush).toHaveBeenCalledWith(`health:${PROVIDER_ID}:latency`, '250')
        expect(mockLtrim).toHaveBeenCalledWith(`health:${PROVIDER_ID}:latency`, 0, 99)
        expect(mockLatencySet).toHaveBeenCalledWith({ provider: PROVIDER_ID }, 250)
    })

    it('does NOT store latency when latency is 0 or undefined', async () => {
        const monitor = new HealthMonitor()
        await monitor.recordRequest(PROVIDER_ID, true, 0)
        await monitor.recordRequest(PROVIDER_ID, true)

        expect(mockLpush).not.toHaveBeenCalled()
        expect(mockLatencySet).not.toHaveBeenCalled()
    })

    it('triggers handleFailure on failure', async () => {
        const monitor = new HealthMonitor({ failureThreshold: 1 })
        mockIncr.mockResolvedValueOnce(1)

        await monitor.recordRequest(PROVIDER_ID, false, undefined, undefined, 'SYSTEMIC')

        expect(mockIncr).toHaveBeenCalledWith(`health:${PROVIDER_ID}:failures`)
        expect(mockSet).toHaveBeenCalledWith(
            `health:${PROVIDER_ID}:circuit`,
            'open',
            'EX',
            expect.any(Number)
        )
    })

    it('triggers handleSuccess on success and resets failure counter', async () => {
        const monitor = new HealthMonitor()
        mockGet.mockResolvedValue(null)

        await monitor.recordRequest(PROVIDER_ID, true)

        expect(mockDel).toHaveBeenCalledWith(`health:${PROVIDER_ID}:failures`)
    })
})

// ---------------------------------------------------------------------------
// Circuit Breaker State Transitions
// ---------------------------------------------------------------------------

describe('HealthMonitor — circuit breaker', () => {
    it('opens circuit when failures reach failureThreshold (5)', async () => {
        const monitor = new HealthMonitor()
        mockIncr.mockResolvedValue(5)

        await monitor.recordRequest(PROVIDER_ID, false, undefined, undefined, 'TRANSIENT')

        expect(mockSet).toHaveBeenCalledWith(
            `health:${PROVIDER_ID}:circuit`,
            'open',
            'EX',
            expect.any(Number)
        )
    })

    it('does NOT open circuit below threshold', async () => {
        const monitor = new HealthMonitor()
        mockIncr.mockResolvedValue(3)

        await monitor.recordRequest(PROVIDER_ID, false, undefined, undefined, 'TRANSIENT')

        const circuitCalls = mockSet.mock.calls.filter((c: any[]) => c[0] === `health:${PROVIDER_ID}:circuit`)
        expect(circuitCalls).toHaveLength(0)
    })

    it('SYSTEMIC error trips circuit immediately regardless of count', async () => {
        const monitor = new HealthMonitor({ failureThreshold: 100 })
        mockIncr.mockResolvedValue(1)

        await monitor.recordRequest(PROVIDER_ID, false, undefined, undefined, 'SYSTEMIC')

        expect(mockSet).toHaveBeenCalledWith(
            `health:${PROVIDER_ID}:circuit`,
            'open',
            'EX',
            expect.any(Number)
        )
    })

    it('applies exponential backoff for repeated trips', async () => {
        const monitor = new HealthMonitor()
        mockIncr
            .mockResolvedValueOnce(5)
            .mockResolvedValueOnce(2)

        await monitor.recordRequest(PROVIDER_ID, false, undefined, undefined, 'TRANSIENT')

        const circuitCall = mockSet.mock.calls.find(
            (c: any[]) => c[0] === `health:${PROVIDER_ID}:circuit` && c[1] === 'open'
        )
        expect(circuitCall).toBeDefined()
        expect(circuitCall![3]).toBe(60)
    })

    it('transitions from half-open to closed after halfOpenRequests (3) successes', async () => {
        const monitor = new HealthMonitor()
        mockGet.mockImplementation((key: string) => {
            if (key === `health:${PROVIDER_ID}:circuit`) return Promise.resolve('half-open')
            if (key === `health:${PROVIDER_ID}:retryCount`) return Promise.resolve('1')
            return Promise.resolve(null)
        })
        mockIncr.mockResolvedValue(3)

        await monitor.recordRequest(PROVIDER_ID, true)

        expect(mockDel).toHaveBeenCalledWith(`health:${PROVIDER_ID}:circuit`)
        expect(mockDel).toHaveBeenCalledWith(`health:${PROVIDER_ID}:halfOpenSuccess`)
        expect(mockDel).toHaveBeenCalledWith(`health:${PROVIDER_ID}:failures`)
        expect(mockDel).toHaveBeenCalledWith(`health:${PROVIDER_ID}:retryCount`)
    })

    it('does NOT close half-open circuit on success below threshold', async () => {
        const monitor = new HealthMonitor({ halfOpenRequests: 3 })
        mockGet.mockImplementation((key: string) => {
            if (key === `health:${PROVIDER_ID}:circuit`) return Promise.resolve('half-open')
            return Promise.resolve(null)
        })
        mockIncr.mockResolvedValue(1)

        await monitor.recordRequest(PROVIDER_ID, true)

        const circuitDelCalls = mockDel.mock.calls.filter(
            (c: any[]) => c[0] === `health:${PROVIDER_ID}:circuit`
        )
        expect(circuitDelCalls).toHaveLength(0)
    })

    it('manually openCircuit sets open state with configured duration', async () => {
        const monitor = new HealthMonitor({ openDuration: 60000 })
        await monitor.openCircuit(PROVIDER_ID)

        expect(mockSet).toHaveBeenCalledWith(
            `health:${PROVIDER_ID}:circuit`,
            'open',
            'EX',
            60
        )
    })

    it('manually closeCircuit deletes circuit and failure keys', async () => {
        const monitor = new HealthMonitor()
        await monitor.closeCircuit(PROVIDER_ID)

        expect(mockDel).toHaveBeenCalledWith(`health:${PROVIDER_ID}:circuit`)
        expect(mockDel).toHaveBeenCalledWith(`health:${PROVIDER_ID}:failures`)
    })
})

// ---------------------------------------------------------------------------
// getCircuitState
// ---------------------------------------------------------------------------

describe('HealthMonitor.getHealth', () => {
    it('returns "closed" when no circuit key exists', async () => {
        const mod = await importFreshHealthMonitor()
        const monitor = new mod.HealthMonitor()
        mockGet.mockResolvedValue(null)
        mockZrange.mockResolvedValue([])

        const health = await monitor.getHealth(PROVIDER_ID)
        expect(health.circuitState).toBe('closed')
    })

    it('returns "open" when circuit key exists with positive TTL', async () => {
        const mod = await importFreshHealthMonitor()
        const monitor = new mod.HealthMonitor()
        mockGet.mockImplementation((key: string) => {
            if (key === `health:${PROVIDER_ID}:circuit`) return Promise.resolve('open')
            return Promise.resolve(null)
        })
        mockTtl.mockResolvedValue(20)

        const health = await monitor.getHealth(PROVIDER_ID)
        expect(health.circuitState).toBe('open')
    })

    it('transitions open → half-open when TTL expires', async () => {
        const mod = await importFreshHealthMonitor()
        const monitor = new mod.HealthMonitor()
        mockGet.mockImplementation((key: string) => {
            if (key === `health:${PROVIDER_ID}:circuit`) return Promise.resolve('open')
            return Promise.resolve(null)
        })
        mockTtl.mockResolvedValue(0)

        const health = await monitor.getHealth(PROVIDER_ID)
        expect(health.circuitState).toBe('half-open')
        expect(mockSet).toHaveBeenCalledWith(`health:${PROVIDER_ID}:circuit`, 'half-open')
        expect(mockDel).toHaveBeenCalledWith(`health:${PROVIDER_ID}:halfOpenSuccess`)
    })
})

// ---------------------------------------------------------------------------
// isAvailable
// ---------------------------------------------------------------------------

describe('HealthMonitor.isAvailable', () => {
    it('returns true when circuit is closed', async () => {
        const monitor = new HealthMonitor()
        mockGet.mockResolvedValue(null)

        expect(await monitor.isAvailable(PROVIDER_ID)).toBe(true)
    })

    it('returns true when circuit is half-open (allows probes)', async () => {
        const monitor = new HealthMonitor()
        mockGet.mockResolvedValue('half-open')

        expect(await monitor.isAvailable(PROVIDER_ID)).toBe(true)
    })

    it('returns false when circuit is open', async () => {
        const monitor = new HealthMonitor()
        mockGet.mockResolvedValue('open')
        mockTtl.mockResolvedValue(20)

        expect(await monitor.isAvailable(PROVIDER_ID)).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// Success Rate
// ---------------------------------------------------------------------------

describe('HealthMonitor — success rate calculation', () => {
    it('returns 1.0 when no requests in window (GLOBAL fallback)', async () => {
        const mod = await importFreshHealthMonitor()
        const monitor = new mod.HealthMonitor()
        mockZrange.mockResolvedValue([])

        const health = await monitor.getHealth(PROVIDER_ID)
        expect(health.successRate).toBe(1.0)
    })

    it('calculates weighted success rate from recent requests', async () => {
        const mod = await importFreshHealthMonitor()
        const monitor = new mod.HealthMonitor({ window: 60 })
        const now = Date.now()
        const requests = [
            JSON.stringify({ success: true, latency: 100, timestamp: now - 1000 }),
            JSON.stringify({ success: true, latency: 100, timestamp: now - 2000 }),
            JSON.stringify({ success: false, latency: 100, timestamp: now - 3000 }),
        ]
        mockZrange.mockResolvedValue(requests)

        const health = await monitor.getHealth(PROVIDER_ID)
        expect(health.successRate).toBeGreaterThan(0.5)
        expect(health.successRate).toBeLessThan(1.0)
    })

    it('skips malformed JSON entries without throwing', async () => {
        const mod = await importFreshHealthMonitor()
        const monitor = new mod.HealthMonitor()
        const now = Date.now()
        mockZrange.mockResolvedValue([
            'not-json',
            JSON.stringify({ success: true, latency: 100, timestamp: now }),
        ])

        const health = await monitor.getHealth(PROVIDER_ID)
        expect(health.successRate).toBeGreaterThan(0)
    })
})

// ---------------------------------------------------------------------------
// Latency
// ---------------------------------------------------------------------------

describe('HealthMonitor — latency tracking', () => {
    it('returns 0 when no latency samples', async () => {
        const mod = await importFreshHealthMonitor()
        const monitor = new mod.HealthMonitor()
        mockLrange.mockResolvedValue([])

        const health = await monitor.getHealth(PROVIDER_ID)
        expect(health.avgLatency).toBe(0)
    })

    it('computes average from list of latency samples', async () => {
        const mod = await importFreshHealthMonitor()
        const monitor = new mod.HealthMonitor()
        mockLrange.mockImplementation((key: string) => {
            if (key === `health:${PROVIDER_ID}:latency`) return Promise.resolve(['100', '200', '300'])
            return Promise.resolve([])
        })

        const health = await monitor.getHealth(PROVIDER_ID)
        expect(health.avgLatency).toBe(200)
    })
})

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

describe('HealthMonitor — getHealth cache', () => {
    it('returns cached value on second call within TTL', async () => {
        const mod = await importFreshHealthMonitor()
        const monitor = new mod.HealthMonitor()
        mockZrange.mockResolvedValue([])

        const first = await monitor.getHealth(PROVIDER_ID)
        const zrangeCallsFirst = mockZrange.mock.calls.length

        const second = await monitor.getHealth(PROVIDER_ID)
        expect(mockZrange.mock.calls.length).toBe(zrangeCallsFirst)
        expect(second).toEqual(first)
    })
})
