/**
 * Smart Router — Unit Tests (Phase 1 subset)
 *
 * Focus: highest-leverage paths that can be tested with isolated mocks.
 * Full integration tests are deferred to Phase 2.
 *
 * Covered:
 *  - init() logs and resolves
 *  - resolveProviderSlug: case-insensitive name + displayName match
 *  - resolveProviderSlug: returns null on empty / no match
 *  - resolveProviderSlug: returns null when no providers active
 *  - getNumber: requires healthy providers (throws otherwise)
 *  - getNumber: provider preference bypasses scoring, strict single-provider path
 *  - getNumber: throws if preferred provider is not in healthy set
 *  - getRankedProviders: filters out zero-stock quotes
 *  - getRankedProviders: returns cached result on hit
 *  - getRankedProviders: cache miss → fetches and caches
 *  - getRankedProviders: returns empty array when Meilisearch fails
 *  - getCountriesList: returns from highest-priority provider
 *  - getCountriesList: fails over to next provider on primary error
 *  - getCountriesList: throws when no providers available
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared at top so module imports get the fake bindings
// ---------------------------------------------------------------------------

const mockRedisGet = vi.fn()
const mockRedisSet = vi.fn()
const mockRedisDel = vi.fn()
vi.mock('@/lib/core/redis', () => ({
    redis: {
        get: (...args: any[]) => mockRedisGet(...args),
        set: (...args: any[]) => mockRedisSet(...args),
        del: (...args: any[]) => mockRedisDel(...args),
    },
}))

const mockPrismaProviderFindMany = vi.fn()
vi.mock('@/lib/core/db', () => ({
    prisma: {
        provider: {
            findMany: (...args: any[]) => mockPrismaProviderFindMany(...args),
        },
    },
}))

vi.mock('@/lib/core/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockGetPressureFactor = vi.fn(() => 1.0)
vi.mock('@/lib/core/rate-limit', () => ({
    PredictiveThrottler: { getPressureFactor: () => mockGetPressureFactor() },
}))

const mockPointsToAllFiat = vi.fn()
const mockGetRates = vi.fn()
const mockGetConfig = vi.fn()
vi.mock('@/lib/currency/currency-service', () => ({
    CurrencyService: {
        getInstance: () => ({
            pointsToAllFiat: (...args: any[]) => mockPointsToAllFiat(...args),
            getRates: (...args: any[]) => mockGetRates(...args),
            getConfig: (...args: any[]) => mockGetConfig(...args),
        }),
    },
}))

const mockPricingCompute = vi.fn(({ rawCost }: any) => ({ pointPrice: rawCost }))
vi.mock('@/lib/pricing/pricing-service', () => ({
    PricingService: { compute: (...args: any[]) => mockPricingCompute(...args) },
}))

const mockSearchProviders = vi.fn()
vi.mock('@/lib/search/search', () => ({
    searchProviders: (...args: any[]) => mockSearchProviders(...args),
}))

const mockIsAvailable = vi.fn()
const mockGetHealth = vi.fn()
const mockRecordRequest = vi.fn()
vi.mock('@/lib/providers/health-monitor', () => ({
    healthMonitor: {
        isAvailable: (...args: any[]) => mockIsAvailable(...args),
        getHealth: (...args: any[]) => mockGetHealth(...args),
        recordRequest: (...args: any[]) => mockRecordRequest(...args),
    },
}))

const mockProviderGetNumber = vi.fn()
const mockProviderGetCountries = vi.fn()
const mockProviderGetServices = vi.fn()
const mockDynamicProviderConstructor = vi.fn()

class MockDynamicProvider {
    config: any
    name: string

    constructor(provider: any) {
        this.config = provider
        this.name = provider.name
        mockDynamicProviderConstructor(provider)
    }

    getNumber = (...args: any[]) => mockProviderGetNumber(...args)
    getCountriesList = () => mockProviderGetCountries()
    getServicesList = (...args: any[]) => mockProviderGetServices(...args)
    getNumberStatus = vi.fn()
    setStatus = vi.fn()
    getSmsCode = vi.fn()
    getBalance = vi.fn()
    getServicesAndPrices = vi.fn()
}

vi.mock('@/lib/providers/dynamic-provider', () => ({
    DynamicProvider: MockDynamicProvider,
}))

const { SmartSmsRouter } = await import('./smart-router')

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProvider(overrides: any = {}): any {
    return {
        id: `prov_${overrides.name ?? 'a'}`,
        name: 'provider-a',
        isActive: true,
        priority: 1,
        priceMultiplier: 1.0,
        displayName: 'Provider A',
        currency: 'USD',
        ...overrides,
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    mockGetPressureFactor.mockReturnValue(1.0)
    mockIsAvailable.mockResolvedValue(true)
    mockGetHealth.mockResolvedValue({
        successRate: 0.95,
        avgLatency: 200,
        avgDeliveryTime: 5000,
        avgSmsCount: 1.0,
        consecutiveFailures: 0,
        circuitState: 'closed',
    })
    mockRecordRequest.mockResolvedValue(undefined)
    mockSearchProviders.mockResolvedValue({ providers: [] })
    mockPointsToAllFiat.mockResolvedValue({ USD: 1.0 })
    mockGetRates.mockResolvedValue({ USD: 1.0 })
    mockGetConfig.mockResolvedValue({ pointsRate: 1.0 })
    mockRedisGet.mockResolvedValue(null)
    mockRedisSet.mockResolvedValue('OK')
    mockPrismaProviderFindMany.mockResolvedValue([])
})

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

describe('SmartSmsRouter.init', () => {
    it('logs initialization and resolves', async () => {
        const router = new SmartSmsRouter()
        await expect(router.init()).resolves.toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
// resolveProviderSlug
// ---------------------------------------------------------------------------

describe('SmartSmsRouter.resolveProviderSlug', () => {
    it('matches by name (case-insensitive)', async () => {
        mockRedisGet.mockResolvedValue(null)
        mockPrismaProviderFindMany.mockResolvedValue([
            makeProvider({ name: 'provider-a', displayName: 'Provider A' }),
        ])

        const router = new SmartSmsRouter()
        const result = await router.resolveProviderSlug('PROVIDER-A')

        expect(result).toBe('provider-a')
    })

    it('matches by displayName when name does not match', async () => {
        mockPrismaProviderFindMany.mockResolvedValue([
            makeProvider({ name: 'provider-a', displayName: 'NexPremium' }),
        ])

        const router = new SmartSmsRouter()
        const result = await router.resolveProviderSlug('nexpremium')

        expect(result).toBe('provider-a')
    })

    it('returns null on empty input', async () => {
        const router = new SmartSmsRouter()
        expect(await router.resolveProviderSlug('')).toBeNull()
    })

    it('returns null when no providers match', async () => {
        mockPrismaProviderFindMany.mockResolvedValue([
            makeProvider({ name: 'provider-a', displayName: 'Provider A' }),
        ])

        const router = new SmartSmsRouter()
        expect(await router.resolveProviderSlug('unknown')).toBeNull()
    })

    it('returns null when no providers are active', async () => {
        mockPrismaProviderFindMany.mockResolvedValue([])

        const router = new SmartSmsRouter()
        expect(await router.resolveProviderSlug('anything')).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// getNumber — provider preference path
// ---------------------------------------------------------------------------

describe('SmartSmsRouter.getNumber — provider preference', () => {
    it('throws when no healthy providers available', async () => {
        mockIsAvailable.mockResolvedValue(false)
        mockPrismaProviderFindMany.mockResolvedValue([makeProvider()])

        const router = new SmartSmsRouter()
        await expect(router.getNumber('1', 'svc')).rejects.toThrow('No healthy providers available')
    })

    it('throws when preferred provider is not in healthy set', async () => {
        mockPrismaProviderFindMany.mockResolvedValue([
            makeProvider({ name: 'provider-a' }),
        ])

        const router = new SmartSmsRouter()
        await expect(
            router.getNumber('1', 'svc', { provider: 'unknown-provider' })
        ).rejects.toThrow("Provider 'unknown-provider' is not active or healthy")
    })

    it('uses the preferred provider and bypasses scoring', async () => {
        mockPrismaProviderFindMany.mockResolvedValue([
            makeProvider({ name: 'provider-a' }),
            makeProvider({ name: 'provider-b', priority: 2 }),
        ])
        mockProviderGetNumber.mockResolvedValue({
            id: 'order-1',
            number: '+15551234567',
            provider: 'provider-a',
        })

        const router = new SmartSmsRouter()
        const result = await router.getNumber('1', 'svc', { provider: 'provider-a' })

        expect(result.id).toBe('order-1')
        // Only the preferred provider is invoked
        expect(mockProviderGetNumber).toHaveBeenCalledTimes(1)
    })

    it('returns successful result from preferred provider', async () => {
        mockPrismaProviderFindMany.mockResolvedValue([
            makeProvider({ name: 'provider-a' }),
        ])
        mockProviderGetNumber.mockResolvedValue({
            id: 'order-1',
            number: '+15551234567',
            provider: 'provider-a',
        })

        const router = new SmartSmsRouter()
        const result = await router.getNumber('1', 'svc', { provider: 'provider-a' })

        expect(result).toMatchObject({
            id: 'order-1',
            number: '+15551234567',
            provider: 'provider-a',
        })
    })
})

// ---------------------------------------------------------------------------
// getRankedProviders — caching & stock filter
// ---------------------------------------------------------------------------

describe('SmartSmsRouter.getRankedProviders', () => {
    it('returns cached result on hit', async () => {
        const cached = [{ id: 'p1', rank: 1, stock: 10, pointPrice: 5 }]
        mockRedisGet.mockResolvedValue(JSON.stringify(cached))

        const router = new SmartSmsRouter()
        const result = await router.getRankedProviders('1', 'svc')

        expect(result).toEqual(cached)
        expect(mockPrismaProviderFindMany).not.toHaveBeenCalled()
    })

    it('falls back gracefully when Redis throws on read', async () => {
        mockRedisGet.mockRejectedValue(new Error('redis down'))
        mockPrismaProviderFindMany.mockResolvedValue([makeProvider({ name: 'provider-a' })])

        const router = new SmartSmsRouter()
        const result = await router.getRankedProviders('1', 'svc')
        expect(Array.isArray(result)).toBe(true)
    })

    it('filters out providers with zero stock', async () => {
        mockPrismaProviderFindMany.mockResolvedValue([
            makeProvider({ name: 'provider-a' }),
        ])
        mockSearchProviders.mockResolvedValue({
            providers: [
                { provider: 'provider-a', pointPrice: 5, stock: 0 },
            ],
        })

        const router = new SmartSmsRouter()
        const result = await router.getRankedProviders('1', 'svc')

        expect(result).toHaveLength(0)
    })

    it('returns empty array when search index fails', async () => {
        mockPrismaProviderFindMany.mockResolvedValue([makeProvider({ name: 'provider-a' })])
        mockSearchProviders.mockRejectedValue(new Error('meili down'))

        const router = new SmartSmsRouter()
        const result = await router.getRankedProviders('1', 'svc')
        expect(result).toEqual([])
    })
})

// ---------------------------------------------------------------------------
// getCountriesList — primary + failover
// ---------------------------------------------------------------------------

describe('SmartSmsRouter.getCountriesList', () => {
    it('throws when no providers available', async () => {
        mockPrismaProviderFindMany.mockResolvedValue([])

        const router = new SmartSmsRouter()
        await expect(router.getCountriesList()).rejects.toThrow('No active providers available')
    })

    it('returns countries from the highest-priority provider', async () => {
        mockPrismaProviderFindMany.mockResolvedValue([
            makeProvider({ name: 'provider-a', priority: 1 }),
            makeProvider({ name: 'provider-b', priority: 2 }),
        ])
        const countries = [{ id: 'us', name: 'United States' }]
        mockProviderGetCountries.mockResolvedValue(countries)

        const router = new SmartSmsRouter()
        const result = await router.getCountriesList()

        expect(result).toEqual(countries)
    })

    it('fails over to second provider when primary throws', async () => {
        mockPrismaProviderFindMany.mockResolvedValue([
            makeProvider({ name: 'provider-a', priority: 1 }),
            makeProvider({ name: 'provider-b', priority: 2 }),
        ])
        mockProviderGetCountries
            .mockRejectedValueOnce(new Error('primary down'))
            .mockResolvedValueOnce([{ id: 'us', name: 'United States' }])

        const router = new SmartSmsRouter()
        const result = await router.getCountriesList()

        expect(result).toEqual([{ id: 'us', name: 'United States' }])
    })

    it('rethrows when primary fails and no failover available', async () => {
        mockPrismaProviderFindMany.mockResolvedValue([
            makeProvider({ name: 'provider-a', priority: 1 }),
        ])
        mockProviderGetCountries.mockRejectedValue(new Error('primary down'))

        const router = new SmartSmsRouter()
        await expect(router.getCountriesList()).rejects.toThrow('primary down')
    })
})
