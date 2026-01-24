/**
 * SMS Provider Configuration
 * Centralized configuration for all SMS providers
 */

export interface ProviderConfig {
    apiUrl: string
    apiKey: string | undefined
    enabled: boolean
    priority: number
}

// ============================================
// PROVIDER CONFIGURATIONS
// ============================================
export const ProvidersConfig = {
    herosms: {
        apiUrl: process.env.HERO_SMS_API_URL || 'https://hero-sms.com/stubs/handler_api.php',
        apiKey: process.env.HERO_SMS_API_KEY,
        enabled: !!process.env.HERO_SMS_API_KEY,
        priority: parseInt(process.env.HERO_SMS_PRIORITY || '1', 10),
    },

    grizzlysms: {
        apiUrl: process.env.GRIZZLYSMS_API_URL || 'https://api.grizzlysms.com/stubs/handler_api.php',
        apiKey: process.env.GRIZZLYSMS_API_KEY,
        enabled: !!process.env.GRIZZLYSMS_API_KEY,
        priority: parseInt(process.env.GRIZZLYSMS_PRIORITY || '2', 10),
    },

    smsbower: {
        apiUrl: process.env.SMSBOWER_API_URL || 'https://smsbower.org/stubs/handler_api.php',
        apiKey: process.env.SMSBOWER_API_KEY,
        enabled: !!process.env.SMSBOWER_API_KEY,
        priority: parseInt(process.env.SMSBOWER_PRIORITY || '3', 10),
    },

    fivesim: {
        apiUrl: process.env.FIVESIM_API_URL || 'https://5sim.net/v1',
        apiKey: process.env.FIVESIM_API_KEY,
        enabled: !!process.env.FIVESIM_API_KEY,
        priority: parseInt(process.env.FIVESIM_PRIORITY || '4', 10),
    },

    onlinesim: {
        apiUrl: process.env.ONLINESIM_API_URL || 'https://onlinesim.io/api',
        apiKey: process.env.ONLINESIM_API_KEY,
        enabled: !!process.env.ONLINESIM_API_KEY,
        priority: parseInt(process.env.ONLINESIM_PRIORITY || '5', 10),
    },
} as const

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get the default/primary SMS provider
 */
export function getDefaultProvider(): string {
    return process.env.SMS_PROVIDER || 'herosms'
}

/**
 * Get all enabled providers sorted by priority
 */
export function getEnabledProviders(): string[] {
    return Object.entries(ProvidersConfig)
        .filter(([_, config]) => config.enabled)
        .sort((a, b) => a[1].priority - b[1].priority)
        .map(([name]) => name)
}

/**
 * Check if a provider is configured and enabled
 */
export function isProviderEnabled(provider: string): boolean {
    const config = ProvidersConfig[provider as keyof typeof ProvidersConfig]
    return config?.enabled ?? false
}

/**
 * Get provider configuration by name
 */
export function getProviderConfig(provider: string): ProviderConfig | undefined {
    return ProvidersConfig[provider as keyof typeof ProvidersConfig]
}

export type ProvidersConfigType = typeof ProvidersConfig
