/**
 * DynamicProvider — Static Catalog Fallback Unit Tests
 */

import { describe, it, expect, vi } from 'vitest'
import { DynamicProvider } from './dynamic-provider'
import { Provider } from '@prisma/client'

vi.mock('@/lib/core/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/db', () => ({
    prisma: {
        providerCountry: { findFirst: vi.fn().mockResolvedValue(null) },
        providerService: { findFirst: vi.fn().mockResolvedValue(null) }
    }
}))

function makeTestProvider(mappings: any = {}, endpoints: any = {}): Provider {
    return {
        id: 'prov_static_test',
        name: 'StaticCatalogTestProvider',
        displayName: 'Static Catalog Test',
        apiBaseUrl: 'https://api.statictest.com',
        authType: 'bearer',
        authKey: 'test-key',
        isActive: true,
        priority: 10,
        endpoints,
        mappings,
        createdAt: new Date(),
        updatedAt: new Date(),
    } as unknown as Provider
}

describe('DynamicProvider — Static Catalog Fallback', () => {
    it('returns static countries list when API endpoint is absent', async () => {
        const providerConfig = makeTestProvider({
            staticCatalog: {
                countries: [
                    { code: 'us', name: 'United States', flagUrl: '/flags/us.svg' },
                    { code: 'in', name: 'India', flagUrl: '/flags/in.svg' }
                ]
            }
        })

        const provider = new DynamicProvider(providerConfig)
        const countries = await provider.getCountriesList()

        expect(countries).toHaveLength(2)
        expect(countries[0]).toEqual({ code: 'us', name: 'United States', flagUrl: '/flags/us.svg' })
        expect(countries[1]).toEqual({ code: 'in', name: 'India', flagUrl: '/flags/in.svg' })
    })

    it('returns static services list with country scoping filtering', async () => {
        const providerConfig = makeTestProvider({
            staticCatalog: {
                services: [
                    { code: 'wa', name: 'WhatsApp', countries: ['us', 'in'] },
                    { code: 'tg', name: 'Telegram' }, // Universal
                    { code: 'vk', name: 'VKontakte', countries: ['ru'] }
                ]
            }
        })

        const provider = new DynamicProvider(providerConfig)
        
        // Query for US
        const usServices = await provider.getServicesList('us')
        expect(usServices).toHaveLength(2)
        expect(usServices.map(s => s.code)).toEqual(['wa', 'tg'])

        // Query for RU
        const ruServices = await provider.getServicesList('ru')
        expect(ruServices).toHaveLength(2)
        expect(ruServices.map(s => s.code)).toEqual(['tg', 'vk'])
    })

    it('returns [] gracefully when neither static catalog nor API endpoint is configured', async () => {
        const providerConfig = makeTestProvider({}, {})

        const provider = new DynamicProvider(providerConfig)
        const countries = await provider.getCountriesList()
        const services = await provider.getServicesList('us')

        expect(countries).toEqual([])
        expect(services).toEqual([])
    })

    it('propagates API error when configured endpoint fails so callers can distinguish failure from []', async () => {
        const providerConfig = makeTestProvider({}, {
            getCountriesList: { method: 'GET', path: '/countries' }
        })

        const provider = new DynamicProvider(providerConfig)
        // Mock request to throw API error
        vi.spyOn(provider as any, 'request').mockRejectedValue(new Error('HTTP 500 Internal Server Error'))

        await expect(provider.getCountriesList()).rejects.toThrow('HTTP 500 Internal Server Error')
    })
})
