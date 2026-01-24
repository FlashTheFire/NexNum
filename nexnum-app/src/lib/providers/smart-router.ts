import { prisma } from '@/lib/core/db'
import { DynamicProvider } from '@/lib/providers/dynamic-provider'
import { SmsProvider, Country, Service, NumberResult, StatusResult } from '@/lib/sms-providers/types'
import { healthMonitor } from '@/lib/providers/health-monitor'
import { logger } from '@/lib/core/logger'

import { redis } from '@/lib/core/redis'

// Redis Key
const ACTIVE_PROVIDERS_CACHE_KEY = 'cache:providers:active:config'
const CACHE_TTL = 30 // 30 seconds (Fresh enough, but prevents DB spam)

export class SmartSmsRouter implements SmsProvider {
    name = 'SmartRouter'

    private async getActiveProviders(): Promise<DynamicProvider[]> {
        try {
            // 1. Try Redis Cache
            const cached = await redis.get(ACTIVE_PROVIDERS_CACHE_KEY)
            if (cached) {
                const configs = JSON.parse(cached)
                return configs.map((c: any) => new DynamicProvider(c))
            }

            // 2. Fallback to DB
            const providers = await prisma.provider.findMany({
                where: { isActive: true },
                orderBy: { priority: 'asc' } // Lower number = Higher priority
            })

            // 3. Update Cache (Store raw configs)
            if (providers.length > 0) {
                await redis.set(ACTIVE_PROVIDERS_CACHE_KEY, JSON.stringify(providers), 'EX', CACHE_TTL)
            }

            return providers.map(p => new DynamicProvider(p))

        } catch (error) {
            logger.error("SmartRouter: Failed to fetch active providers", { error })
            // Emergency DB fetch if Redis fails
            try {
                const providers = await prisma.provider.findMany({
                    where: { isActive: true },
                    orderBy: { priority: 'asc' }
                })
                return providers.map(p => new DynamicProvider(p))
            } catch (dbError) {
                return [] // Total failure
            }
        }
    }

    /**
     * Resolve generic provider name/display name to internal slug
     * e.g. "NexPremium" -> "grizzlysms"
     */
    async resolveProviderSlug(input: string): Promise<string | null> {
        if (!input) return null
        const providers = await this.getActiveProviders()
        const match = providers.find(p =>
            p.name.toLowerCase() === input.toLowerCase() ||
            p.config.displayName.toLowerCase() === input.toLowerCase()
        )
        return match ? match.name : null
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

    /**
     * Select provider using weighted scoring algorithm
     * 
     * Score = (successRate * adminWeight) / (normalizedLatency * costMultiplier)
     * 
     * Higher score = Better provider
     */
    private async selectProviderWeighted(providers: DynamicProvider[]): Promise<DynamicProvider[]> {
        if (providers.length <= 1) return providers

        const scored: { provider: DynamicProvider; score: number }[] = []

        for (const provider of providers) {
            const health = await healthMonitor.getHealth(provider.config.id)

            // Factors
            const successRate = health.successRate || 0.5
            const latency = Math.max(health.avgLatency || 100, 50) // Min 50ms to avoid division issues
            const costMultiplier = Number(provider.config.priceMultiplier) || 1.0
            const adminWeight = Number((provider.config as any).weight) || 1.0
            const priorityBoost = 1 / (Number(provider.config.priority) || 1) // Lower priority number = higher boost

            // Normalize latency (100ms = 1.0, 500ms = 5.0)
            const normalizedLatency = latency / 100

            // Calculate score
            // High success rate, low latency, low cost = high score
            const score = (successRate * adminWeight * priorityBoost) / (normalizedLatency * costMultiplier)

            scored.push({ provider, score })

            logger.debug('Provider score calculated', {
                provider: provider.name,
                successRate,
                latency,
                costMultiplier,
                adminWeight,
                score: score.toFixed(3)
            })
        }

        // Sort by score descending
        scored.sort((a, b) => b.score - a.score)

        // Return sorted providers (best first)
        return scored.map(s => s.provider)
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

    async getNumber(countryCode: string, serviceCode: string, options?: {
        operator?: string;
        maxPrice?: string | number;
        provider?: string;
        expectedPrice?: number;  // The price user selected from offers
        testMode?: boolean
    }): Promise<NumberResult> {
        let providers = await this.getHealthyProviders() // Use healthy providers only
        if (providers.length === 0) throw new Error("No healthy providers available")

        const providerPreference = options?.provider
        const expectedPrice = options?.expectedPrice
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

            // Log price expectation for audit
            if (expectedPrice !== undefined) {
                logger.info('SmartRouter: Provider selected with expected price', {
                    provider: providerPreference,
                    expectedPrice,
                    priceMultiplier: Number(provider.config.priceMultiplier) || 1.0,
                    fixedMarkup: Number(provider.config.fixedMarkup) || 0
                })
            }
        } else {
            // Apply weighted selection for best provider order
            providers = await this.selectProviderWeighted(providers)
        }

        const checkedProviders: string[] = []

        for (const provider of providers) {
            const startTime = Date.now()
            try {
                logger.info(`SmartRouter: Attempting purchase from ${provider.name}...`)

                // Pass maxPrice to limit what the provider can charge
                const result = await provider.getNumber(countryCode, serviceCode, {
                    operator: options?.operator,
                    maxPrice: expectedPrice || options?.maxPrice // Use expected price as max
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
                    price: ((result.price || 0) * mult) + fixed
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

                // If it's a permanent error (BAD_KEY, etc.), don't try other providers.
                // UNLESS it's NO_BALANCE - that's "permanent" for the provider but "retryable" for the system.
                const shouldFailover =
                    isNoStock ||
                    errorType === 'NO_BALANCE' ||
                    errorType === 'RATE_LIMITED' ||
                    errorType === 'SERVER_ERROR' ||
                    errorType === 'TIMEOUT'

                if (!shouldFailover && isPermanent && providerPreference) {
                    throw new Error(`Provider '${provider.name}' returned permanent error: ${e.message}`)
                }

                if (!shouldFailover && isPermanent) {
                    // If we are in smart routing mode (no preference), we SHOULD actually failover on permanent errors
                    // because maybe the *next* provider is configured correctly.
                    // But to be safe, we log warning and continue.
                    logger.warn(`SmartRouter: Permanent error on ${provider.name}, trying next...`)
                } else {
                    logger.info(`SmartRouter: Failover triggered (Reason: ${errorType}) from ${provider.name} -> Next`)
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
                } catch (e: any) {
                    const latency = Date.now() - startTime

                    // Treat terminal business states (LifecycleTerminal) as a success for health monitoring
                    // This prevents healthy providers from being flagged as "degraded" just because an order timed out.
                    const isSuccess = e.isLifecycleTerminal || false
                    await healthMonitor.recordRequest(provider.config.id, isSuccess, latency)

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

    async setStatus(activationId: string, status: number | string): Promise<any> {
        const [providerName, realId] = this.parseActivationId(activationId)

        if (providerName && realId) {
            const providers = await this.getActiveProviders()
            const provider = providers.find(p => p.name === providerName)
            if (provider) {
                return provider.setStatus(realId, status)
            }
        }

        throw new Error("Could not set status: activation ID invalid or provider not found")
    }

    async nextSms(activationId: string): Promise<void> {
        const [providerName, realId] = this.parseActivationId(activationId)

        if (providerName && realId) {
            const providers = await this.getActiveProviders()
            const provider = providers.find(p => p.name === providerName)
            if (provider && provider.nextSms) {
                return provider.nextSms(realId)
            }
        }

        // No fallback loop for actions that require specific provider knowledge
        throw new Error("Could not request next SMS: activation ID invalid or provider not found")
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
