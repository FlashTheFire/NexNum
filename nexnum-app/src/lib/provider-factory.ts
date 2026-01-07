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
 * Get the appropriate provider adapter based on configuration
 * 
 * "for getting otp use dyanamic" - User
 */
export function getProviderAdapter(provider: Provider): SmsProvider {
    // Check if we should use legacy adapter for non-metadata operations
    if (!hasDynamicConfig(provider)) {
        const normalizedName = provider.name.toLowerCase().trim()
        const LegacyClass = LEGACY_PROVIDERS[normalizedName]
        if (LegacyClass) {
            return new LegacyClass()
        }
    }

    return new DynamicProvider(provider)
}

/**
 * Get provider for metadata operations (getCountries, getServices)
 * 
 * "don't remove grizzly and fivesim file for fetching country, service" - User
 */
export function getMetadataProvider(provider: Provider): SmsProvider {
    const mappings = provider.mappings as any
    const useDynamic = mappings?.useDynamicMetadata === true

    if (!useDynamic) {
        const normalizedName = provider.name.toLowerCase().trim()
        const LegacyClass = LEGACY_PROVIDERS[normalizedName]
        if (LegacyClass) {
            console.log(`[ProviderFactory] Using legacy metadata scripts for ${provider.name}`)
            return new LegacyClass()
        }
    }

    return new DynamicProvider(provider)
}

export function hasLegacyProvider(name: string): boolean {
    return name.toLowerCase().trim() in LEGACY_PROVIDERS
}

/**
 * Check if the provider should use the dynamic configuration engine
 */
export function hasDynamicConfig(provider: Provider): boolean {
    // If it's not a legacy provider, it's dynamic
    if (!hasLegacyProvider(provider.name)) return true

    // If it IS a legacy provider, check if dynamic mode is forced via mappings
    const mappings = provider.mappings as any
    return mappings?.useDynamic === true
}

export function getLegacyProvider(name: string): SmsProvider | null {
    const LegacyClass = LEGACY_PROVIDERS[name.toLowerCase().trim()]
    if (LegacyClass) {
        return new LegacyClass()
    }
    return null
}

/**
 * Check if the provider should use the dynamic configuration engine for metadata
 */
export function usesDynamicMetadata(provider: Provider): boolean {
    const mappings = provider.mappings as any
    return mappings?.useDynamicMetadata === true
}


