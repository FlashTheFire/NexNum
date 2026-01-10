import { prisma } from '@/lib/core/db'
import { DynamicProvider } from '@/lib/providers/dynamic-provider'
import { SmsProvider, Country, Service, NumberResult, StatusResult } from './sms-providers/types'
import { healthMonitor } from '@/lib/providers/health-monitor'
import { logger } from '@/lib/core/logger'

// Cache for active providers to avoid DB hits on every request
let activeProvidersCache: DynamicProvider[] | null = null
let lastCacheTime = 0
const CACHE_TTL = 60 * 1000 // 60 seconds

export class SmartSmsRouter implements SmsProvider {
    name = 'SmartRouter'

    private async getActiveProviders(): Promise<DynamicProvider[]> {
        const now = Date.now()
        if (activeProvidersCache && (now - lastCacheTime < CACHE_TTL)) {
            return activeProvidersCache
        }

        try {
            const providers = await prisma.provider.findMany({
                where: { isActive: true },
                orderBy: { priority: 'asc' } // Lower number = Higher priority
            })

            const dynamicProviders = providers.map(p => new DynamicProvider(p))

            // Update cache
            activeProvidersCache = dynamicProviders
            lastCacheTime = now

            return dynamicProviders
        } catch (error) {
            logger.error("SmartRouter: Failed to fetch active providers", { error })
            // Return stale cache if available, otherwise empty
            return activeProvidersCache || []
        }
    }

    /**
     * Get healthy providers (filter by circuit breaker state)
     */
    private async getHealthyProviders(): Promise<DynamicProvider[]> {
        const allProviders = await this.getActiveProviders()
        const healthyProviders: DynamicProvider[] = []

        for (const provider of allProviders) {
            const isAvailable = await healthMonitor.isAvailable(provider.config.id)
            if (isAvailable) {
                healthyProviders.push(provider)
            } else {
                logger.debug('Provider unavailable (circuit open)', {
                    provider: provider.name,
                })
            }
        }

        return healthyProviders
    }

    // --- Core Methods ---

    async getCountries(): Promise<Country[]> {
        const providers = await this.getActiveProviders()
        if (providers.length === 0) throw new Error("No active providers available")

        // Strategy: Return countries from the highest priority provider
        // TODO: In future, we could aggregate countries from all providers
        try {
            return await providers[0].getCountries()
        } catch (e) {
            // Failover to next provider?
            if (providers.length > 1) {
                console.warn(`SmartRouter: Primary provider ${providers[0].name} failed to get countries, failing over to ${providers[1].name}`)
                return await providers[1].getCountries()
            }
            throw e
        }
    }

    async getServices(countryCode: string): Promise<Service[]> {
        const providers = await this.getActiveProviders()
        if (providers.length === 0) throw new Error("No active providers available")

        // Parallel Strategy: Fetch services from ALL active providers concurrently
        const results = await Promise.allSettled(
            providers.map(async (provider) => {
                try {
                    const services = await provider.getServices(countryCode)

                    // Apply Pricing Rules
                    const mult = Number(provider.config.priceMultiplier) || 1.0
                    const fixed = Number(provider.config.fixedMarkup) || 0.0

                    return services.map(s => ({
                        ...s,
                        price: (s.price * mult) + fixed
                    }))
                } catch (e) {
                    console.warn(`SmartRouter: Provider ${provider.name} failed to get services for ${countryCode}`, e)
                    return []
                }
            })
        )

        // Flatten results from all successful promises
        const allServices: Service[] = []
        results.forEach(result => {
            if (result.status === 'fulfilled') {
                allServices.push(...result.value)
            }
        })

        if (allServices.length === 0) {
            throw new Error("All active providers failed to fetch services")
        }

        return allServices
    }

    async getNumber(countryCode: string, serviceCode: string, options?: { operator?: string; maxPrice?: string | number; provider?: string; testMode?: boolean }): Promise<NumberResult> {
        let providers = await this.getHealthyProviders() // Use healthy providers only
        if (providers.length === 0) throw new Error("No healthy providers available")

        const providerPreference = options?.provider
        const testMode = options?.testMode

        // 0. If testMode is requested, bypass real providers and return mock data


        // If preference is specified, strictly use that provider only (Phase 11 Update)
        if (providerPreference) {
            const provider = providers.find(p => p.name.toLowerCase() === providerPreference.toLowerCase())
            if (!provider) {
                throw new Error(`Provider '${providerPreference}' is not active or healthy`)
            }
            // Overwrite providers list to ONLY include this one
            providers = [provider]
        }

        const checkedProviders: string[] = []

        for (const provider of providers) {
            const startTime = Date.now()
            try {
                logger.info(`SmartRouter: Attempting purchase from ${provider.name}...`)
                const result = await provider.getNumber(countryCode, serviceCode, {
                    operator: options?.operator,
                    maxPrice: options?.maxPrice
                })

                // Record success
                const latency = Date.now() - startTime
                await healthMonitor.recordRequest(provider.config.id, true, latency)

                // Apply Pricing Rules to the result
                const mult = Number(provider.config.priceMultiplier) || 1.0
                const fixed = Number(provider.config.fixedMarkup) || 0.0

                return {
                    ...result,
                    activationId: `${provider.name}:${result.activationId}`,
                    price: (result.price * mult) + fixed
                }
            } catch (e: any) {
                // Record failure
                const latency = Date.now() - startTime
                await healthMonitor.recordRequest(provider.config.id, false, latency)

                // Check for structured ProviderError
                const errorType = e.errorType || 'UNKNOWN'
                const isNoStock = e.isNoStock ?? false
                const isPermanent = e.isPermanent ?? false

                logger.warn(`SmartRouter: Purchase failed on ${provider.name}: ${e.message}`, {
                    errorType,
                    isNoStock,
                    isPermanent
                })

                checkedProviders.push(`${provider.name}(${errorType})`)

                // If it's a permanent error (BAD_KEY, etc.), don't try other providers
                if (isPermanent && providerPreference) {
                    throw new Error(`Provider '${provider.name}' returned permanent error: ${e.message}`)
                }

                // Continue to next provider for retryable errors
            }
        }

        throw new Error(`All healthy providers failed to purchase number. Checked: ${checkedProviders.join(', ')}`)
    }

    async getStatus(activationId: string): Promise<StatusResult> {


        const [providerName, realId] = this.parseActivationId(activationId)

        if (providerName && realId) {
            const providers = await this.getActiveProviders() // Don't filter by health for status checks
            const provider = providers.find(p => p.name.toLowerCase() === providerName.toLowerCase())
            if (provider) {
                const startTime = Date.now()
                try {
                    const result = await provider.getStatus(realId)
                    const latency = Date.now() - startTime
                    await healthMonitor.recordRequest(provider.config.id, true, latency)
                    return result
                } catch (e) {
                    const latency = Date.now() - startTime
                    await healthMonitor.recordRequest(provider.config.id, false, latency)
                    throw e
                }
            }
        }

        // Fallback: Try all active providers (Inefficient but robust)
        const providers = await this.getActiveProviders()
        for (const provider of providers) {
            try {
                const status = await provider.getStatus(activationId)
                return status
            } catch (e) {
                continue
            }
        }

        throw new Error("Could not check status: activation ID not found on any active provider")
    }

    async cancelNumber(activationId: string): Promise<void> {


        const [providerName, realId] = this.parseActivationId(activationId)

        if (providerName && realId) {
            const providers = await this.getActiveProviders()
            const provider = providers.find(p => p.name === providerName)
            if (provider) {
                return provider.cancelNumber(realId)
            }
        }

        // Fallback loop
        const providers = await this.getActiveProviders()
        for (const provider of providers) {
            try {
                await provider.cancelNumber(activationId)
                return
            } catch (e) {
                continue
            }
        }
        throw new Error("Could not cancel number")
    }

    async getBalance(): Promise<number> {
        // Sum of all balances? Or just the primary?
        // For admin dashboard, maybe sum is good.
        // For individual balance checks, use the admin UI "Test" feature.
        const providers = await this.getActiveProviders()
        let total = 0
        for (const p of providers) {
            try {
                total += await p.getBalance()
            } catch (e) { }
        }
        return total
    }

    // Helper
    private parseActivationId(id: string): [string | null, string | null] {
        if (id.includes(':')) {
            const parts = id.split(':')
            if (parts.length === 2) {
                return [parts[0], parts[1]]
            }
        }
        return [null, id] // Return original as ID if no prefix
    }
}
