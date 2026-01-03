// Provider Factory
// Returns either DynamicProvider or legacy provider based on configuration

import { Provider } from '@prisma/client'
import { DynamicProvider } from './dynamic-provider'
import { SmsProvider } from './sms-providers/types'
import { FiveSimProvider } from './sms-providers/fivesim'
import { SmsBowerProvider } from './sms-providers/smsbower'
import { GrizzlySmsProvider } from './sms-providers/grizzlysms'
import { HeroSmsProvider } from './sms-providers/herosms'

// Map of legacy provider names to their adapter classes
const LEGACY_PROVIDERS: Record<string, new () => SmsProvider> = {
    '5sim': FiveSimProvider,
    'fivesim': FiveSimProvider,
    'smsbower': SmsBowerProvider,
    'grizzlysms': GrizzlySmsProvider,
    'herosms': HeroSmsProvider,
}

/**
 * Check if a provider has valid dynamic configuration
 */
export function hasDynamicConfig(provider: Provider): boolean {
    if (!provider.endpoints) return false

    const endpoints = provider.endpoints as Record<string, unknown>

    // Check if at least one valid endpoint is configured
    return Object.keys(endpoints).some(key => {
        const ep = endpoints[key]
        return ep && typeof ep === 'object' && 'path' in ep
    })
}

/**
 * Check if provider uses dynamic metadata (countries/services from API)
 * This is controlled by the `useDynamicMetadata` flag in mappings
 */
export function usesDynamicMetadata(provider: Provider): boolean {
    if (!provider.mappings) return false
    const mappings = provider.mappings as Record<string, unknown>
    return mappings.useDynamicMetadata === true
}

/**
 * Get the legacy provider class for a provider name
 */
export function getLegacyProvider(name: string): SmsProvider | null {
    const normalizedName = name.toLowerCase().trim()
    const ProviderClass = LEGACY_PROVIDERS[normalizedName]

    if (ProviderClass) {
        return new ProviderClass()
    }

    return null
}

/**
 * Get the appropriate provider adapter based on configuration
 * 
 * Priority:
 * 1. If provider has valid dynamic config (endpoints defined) → DynamicProvider
 * 2. If provider name matches a legacy provider → Legacy adapter
 * 3. Otherwise → throw error
 */
export function getProviderAdapter(provider: Provider): SmsProvider {
    // First, check if dynamic provider config exists
    if (hasDynamicConfig(provider)) {
        return new DynamicProvider(provider)
    }

    // Fallback to legacy provider
    const legacyProvider = getLegacyProvider(provider.name)
    if (legacyProvider) {
        console.log(`[ProviderFactory] Using legacy adapter for ${provider.name}`)
        return legacyProvider
    }

    throw new Error(
        `No provider adapter found for "${provider.name}". ` +
        `Either configure dynamic endpoints or ensure a legacy provider exists.`
    )
}

/**
 * Get provider for metadata operations (getCountries, getServices)
 * 
 * If useDynamicMetadata is OFF → use legacy provider's scripts
 * If useDynamicMetadata is ON → use DynamicProvider (API-based)
 */
export function getMetadataProvider(provider: Provider): SmsProvider {
    const useDynamic = usesDynamicMetadata(provider)

    if (!useDynamic) {
        // Use legacy scripts for countries/services
        const legacyProvider = getLegacyProvider(provider.name)
        if (legacyProvider) {
            console.log(`[ProviderFactory] Using legacy metadata scripts for ${provider.name}`)
            return legacyProvider
        }
    }

    // Fall back to DynamicProvider if legacy not available or useDynamic is true
    if (hasDynamicConfig(provider)) {
        return new DynamicProvider(provider)
    }

    throw new Error(
        `No metadata provider available for "${provider.name}". ` +
        `Either enable useDynamicMetadata or ensure a legacy provider exists.`
    )
}

/**
 * Check if a provider name has a legacy adapter available
 */
export function hasLegacyProvider(name: string): boolean {
    return name.toLowerCase().trim() in LEGACY_PROVIDERS
}

