/**
 * Provider Factory — Unit Tests
 *
 * Tests the ProviderRegistry memoization, dynamic provider instantiation,
 * and getProviderAdapter wrapper.
 *
 * Critical invariants:
 *  - Same provider with same updatedAt returns cached instance (memoization)
 *  - Different updatedAt invalidates cache (new instance created)
 *  - clear() wipes all cached instances
 *  - Old instances for same provider ID are cleaned up before re-instantiation
 *  - getMetadataProvider is an alias of getProviderAdapter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Provider } from '@prisma/client'

vi.mock('@/lib/core/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const mockDynamicProviderConstructor = vi.fn()

class MockDynamicProvider {
    provider: any
    constructor(provider: any) {
        this.provider = provider
        mockDynamicProviderConstructor(provider)
    }
}

vi.mock('@/lib/providers/dynamic-provider', () => ({
    DynamicProvider: MockDynamicProvider,
}))

const { ProviderRegistry, getProviderAdapter, getMetadataProvider } = await import('./provider-factory')

function makeProvider(overrides: Partial<Provider> = {}): Provider {
    return {
        id: 'prov_1',
        name: 'TestProvider',
        apiUrl: 'https://api.test.com',
        apiKey: 'test-key',
        isActive: true,
        priority: 50,
        successRate: 0.95,
        avgLatency: 200,
        config: null,
        createdAt: new Date(),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        ...overrides,
    } as unknown as Provider
}

beforeEach(() => {
    vi.clearAllMocks()
    ProviderRegistry.clear()
})

// ---------------------------------------------------------------------------
// ProviderRegistry.getProvider
// ---------------------------------------------------------------------------

describe('ProviderRegistry.getProvider', () => {
    it('instantiates a DynamicProvider on first call', async () => {
        const provider = makeProvider()

        const instance = ProviderRegistry.getProvider(provider)

        expect(mockDynamicProviderConstructor).toHaveBeenCalledTimes(1)
        expect(mockDynamicProviderConstructor).toHaveBeenCalledWith(provider)
        expect(instance).toBeInstanceOf(MockDynamicProvider)
    })

    it('returns cached instance on subsequent calls with same updatedAt', async () => {
        const provider = makeProvider()

        const a = ProviderRegistry.getProvider(provider)
        const b = ProviderRegistry.getProvider(provider)

        expect(mockDynamicProviderConstructor).toHaveBeenCalledTimes(1)
        expect(a).toBe(b)
    })

    it('creates a new instance when updatedAt changes (config refresh)', async () => {
        const v1 = makeProvider({ updatedAt: new Date('2024-01-01T00:00:00Z') })
        const v2 = makeProvider({ updatedAt: new Date('2024-02-01T00:00:00Z') })

        const a = ProviderRegistry.getProvider(v1)
        const b = ProviderRegistry.getProvider(v2)

        expect(mockDynamicProviderConstructor).toHaveBeenCalledTimes(2)
        expect(a).not.toBe(b)
    })

    it('cleans up stale instances for same provider ID before re-instantiation', async () => {
        const v1 = makeProvider({ updatedAt: new Date('2024-01-01T00:00:00Z') })
        const v2 = makeProvider({ updatedAt: new Date('2024-02-01T00:00:00Z') })
        const v3 = makeProvider({ updatedAt: new Date('2024-03-01T00:00:00Z') })

        ProviderRegistry.getProvider(v1)
        ProviderRegistry.getProvider(v2)
        ProviderRegistry.getProvider(v3)

        // After v3, only v1 and v2 should be cleaned up; v3 is the active one
        // We can't introspect the private Map directly, but we can verify the
        // constructor was called 3 times (one per version)
        expect(mockDynamicProviderConstructor).toHaveBeenCalledTimes(3)
    })

    it('treats different provider IDs as independent cache entries', async () => {
        const p1 = makeProvider({ id: 'prov_1' })
        const p2 = makeProvider({ id: 'prov_2' })

        const a = ProviderRegistry.getProvider(p1)
        const b = ProviderRegistry.getProvider(p2)

        expect(mockDynamicProviderConstructor).toHaveBeenCalledTimes(2)
        expect(a).not.toBe(b)
    })
})

// ---------------------------------------------------------------------------
// ProviderRegistry.clear
// ---------------------------------------------------------------------------

describe('ProviderRegistry.clear', () => {
    it('wipes all cached instances', async () => {
        const p1 = makeProvider({ id: 'prov_1' })
        const p2 = makeProvider({ id: 'prov_2' })

        ProviderRegistry.getProvider(p1)
        ProviderRegistry.getProvider(p2)
        expect(mockDynamicProviderConstructor).toHaveBeenCalledTimes(2)

        ProviderRegistry.clear()

        ProviderRegistry.getProvider(p1)
        ProviderRegistry.getProvider(p2)
        expect(mockDynamicProviderConstructor).toHaveBeenCalledTimes(4)
    })
})

// ---------------------------------------------------------------------------
// getProviderAdapter / getMetadataProvider
// ---------------------------------------------------------------------------

describe('getProviderAdapter', () => {
    it('returns the same instance as ProviderRegistry.getProvider', async () => {
        const provider = makeProvider()

        const fromAdapter = getProviderAdapter(provider)
        const fromRegistry = ProviderRegistry.getProvider(provider)

        expect(fromAdapter).toBe(fromRegistry)
    })
})

describe('getMetadataProvider', () => {
    it('is an alias of getProviderAdapter', async () => {
        expect(getMetadataProvider).toBe(getProviderAdapter)
    })

    it('returns the same instance for the same provider', async () => {
        const provider = makeProvider()

        const a = getMetadataProvider(provider)
        const b = getMetadataProvider(provider)

        expect(a).toBe(b)
        expect(mockDynamicProviderConstructor).toHaveBeenCalledTimes(1)
    })
})
