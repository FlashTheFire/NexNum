import { redis } from '@/lib/redis'
import { prisma } from '@/lib/db'

// Types
export interface AppSettings {
    general: {
        siteName: string
        timezone: string
        maintenanceMode: boolean
        maintenanceMessage: string
    }
    pricing: {
        defaultMarkup: number
        fixedMarkup: number
        minPrice: number
        currency: string
    }
    rateLimit: {
        apiLimit: number
        authLimit: number
        adminLimit: number
        windowSize: number // seconds
    }
    notifications: {
        emailEnabled: boolean
        lowBalanceThreshold: number
        syncFailureAlert: boolean
    }
}

const DEFAULT_SETTINGS: AppSettings = {
    general: {
        siteName: 'NexNum',
        timezone: 'UTC',
        maintenanceMode: false,
        maintenanceMessage: 'We are currently performing scheduled maintenance.',
    },
    pricing: {
        defaultMarkup: 1.2,
        fixedMarkup: 0.5,
        minPrice: 0.10,
        currency: 'USD',
    },
    rateLimit: {
        apiLimit: 100,
        authLimit: 5,
        adminLimit: 30,
        windowSize: 60,
    },
    notifications: {
        emailEnabled: false,
        lowBalanceThreshold: 10,
        syncFailureAlert: true,
    },
}

const SETTINGS_CACHE_KEY = 'app:settings'
const CACHE_TTL = 300 // 5 minutes

export class SettingsService {
    /**
     * Get all settings, using cache if available
     */
    static async getSettings(): Promise<AppSettings> {
        try {
            // Try cache first
            const cached = await redis.get(SETTINGS_CACHE_KEY)
            if (cached) {
                return { ...DEFAULT_SETTINGS, ...JSON.parse(cached as string) }
            }

            // Fallback to database (simulated with Redis persistence for now, 
            // since we don't have a Settings table yet. In a real app, you'd fetch from DB)
            // For now, we'll just return defaults if cache is empty
            return DEFAULT_SETTINGS
        } catch (error) {
            console.error('Failed to get settings:', error)
            return DEFAULT_SETTINGS
        }
    }

    /**
     * Update a specific section of settings
     */
    static async updateSettings(section: keyof AppSettings, updates: Partial<AppSettings[keyof AppSettings]>) {
        try {
            const current = await this.getSettings()
            const updated = {
                ...current,
                [section]: {
                    ...current[section],
                    ...updates,
                },
            }

            // Save to Redis (persistent)
            await redis.set(SETTINGS_CACHE_KEY, JSON.stringify(updated))

            return updated
        } catch (error) {
            console.error('Failed to update settings:', error)
            throw error
        }
    }

    /**
     * Helper to get rate limit config specifically
     */
    static async getRateLimits() {
        const settings = await this.getSettings()
        return settings.rateLimit
    }
}
