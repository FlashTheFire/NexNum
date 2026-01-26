// Provider Factory
// Returns DynamicProvider based on configuration

import { Provider } from '@prisma/client'
import { DynamicProvider } from './dynamic-provider'
import { SmsProvider } from '@/lib/providers/types'

/**
 * Get the appropriate provider adapter based on configuration
 */
export function getProviderAdapter(provider: Provider): SmsProvider {
    return new DynamicProvider(provider)
}

/**
 * Get provider for metadata operations (getCountries, getServices)
 */
export function getMetadataProvider(provider: Provider): SmsProvider {
    return new DynamicProvider(provider)
}



// Deprecated helpers maintained as false/null for safety during transition



