import { Provider } from '@prisma/client'
import { DynamicProvider } from './dynamic-provider'
import { SmsProvider } from '@/lib/providers/types'
import { logger } from '@/lib/core/logger'

/**
 * Enterprise Provider Registry
 * 
 * Manages the instantiation and lifecycle of provider adapters.
 * Moves from a static factory to a dynamic registry for plugin-readiness.
 */
export class ProviderRegistry {
    private static instances = new Map<string, SmsProvider>()

    /**
     * Get a provider instance by ID.
     * Implements memoization to prevent redundant instantiation during high-traffic bursts.
     */
    static getProvider(provider: Provider): SmsProvider {
        const cacheKey = `${provider.id}_${provider.updatedAt.getTime()}`

        if (this.instances.has(cacheKey)) {
            return this.instances.get(cacheKey)!
        }

        // Clean up old instances for this specific provider ID if they exist
        for (const key of this.instances.keys()) {
            if (key.startsWith(`${provider.id}_`)) {
                this.instances.delete(key)
            }
        }

        logger.info(`[REGISTRY] Instantiating new adapter for ${provider.name}`, { providerId: provider.id })

        const instance = new DynamicProvider(provider)
        this.instances.set(cacheKey, instance)

        return instance
    }

    /**
     * Clear registry (useful for testing or full platform reload)
     */
    static clear() {
        this.instances.clear()
    }
}


export function getProviderAdapter(provider: Provider): SmsProvider {
    return ProviderRegistry.getProvider(provider)
}

export const getMetadataProvider = getProviderAdapter



