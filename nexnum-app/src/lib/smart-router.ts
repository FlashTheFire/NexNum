import { prisma } from '@/lib/db'
import { DynamicProvider } from '@/lib/dynamic-provider'
import { SmsProvider, Country, Service, NumberResult, StatusResult } from './sms-providers/types'

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
            console.error("SmartRouter: Failed to fetch active providers", error)
            // Return stale cache if available, otherwise empty
            return activeProvidersCache || []
        }
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

        // Strategy: Return services from the highest priority provider
        // This ensures the prices we show match the provider we will likely use first
        for (const provider of providers) {
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
                continue // Try next provider
            }
        }
        throw new Error("All active providers failed to fetch services")
    }

    async getNumber(countryCode: string, serviceCode: string): Promise<NumberResult> {
        const providers = await this.getActiveProviders()
        if (providers.length === 0) throw new Error("No active providers available")

        const checkedProviders: string[] = []

        for (const provider of providers) {
            try {
                console.log(`SmartRouter: Attempting purchase from ${provider.name}...`)
                const result = await provider.getNumber(countryCode, serviceCode)

                // If successful, we must track which provider fulfilled it
                // The DynamicProvider returns 'provider' in the result usually, but let's ensure it needs to be tracked by the caller
                // The caller (route.ts) saves the provider name to the DB.

                // Apply Pricing Rules to the result
                const mult = Number(provider.config.priceMultiplier) || 1.0
                const fixed = Number(provider.config.fixedMarkup) || 0.0

                return {
                    ...result,
                    activationId: `${provider.name}:${result.activationId}`,
                    price: (result.price * mult) + fixed
                }
            } catch (e) {
                console.warn(`SmartRouter: Purchase failed on ${provider.name}: ${e instanceof Error ? e.message : 'Unknown error'}`)
                checkedProviders.push(provider.name)
                // Continue to next provider
            }
        }

        throw new Error(`All active providers failed to purchase number. Checked: ${checkedProviders.join(', ')}`)
    }

    async getStatus(activationId: string): Promise<StatusResult> {
        // Here lies the problem: We don't know which provider issued this ID if we stored "SmartRouter" as the provider.
        // However, if we migrated the purchase route to store the *actual* provider name, we wouldn't use SmartRouter.getStatus directly for a specific number.
        // BUT api/sms/[numberId]/route.ts likely calls `smsProvider.getStatus(number.activationId)`.

        // If the ID is prefixed like "5sim:12345", we can route it.
        // If not, we have to try all providers? That's dangerous (rate limits).

        // For now, let's implement the "Prefix" strategy in `getNumber` and decode here.

        const [providerName, realId] = this.parseActivationId(activationId)

        if (providerName && realId) {
            const providers = await this.getActiveProviders()
            // Case-insensitive match for robustness
            const provider = providers.find(p => p.name.toLowerCase() === providerName.toLowerCase())
            if (provider) {
                return provider.getStatus(realId)
            }
            // If provider not found (maybe inactive?), we might still want to try creating a temporary instance if we know the slug?
        }

        // Fallback: Try all active providers (Inefficient but robust)
        const providers = await this.getActiveProviders()
        for (const provider of providers) {
            try {
                // If the ID format clearly doesn't match the provider, we might skip? 
                // Hard to know without specific logic.
                // Just try getStatus.
                const status = await provider.getStatus(activationId)
                // If it returns 'error' or throws, we continue.
                // NOTE: Some providers might return "Pending" for unknown IDs, which is bad.
                // We really should rely on the Prefix specific logic.
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
