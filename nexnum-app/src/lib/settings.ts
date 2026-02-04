import { redis } from '@/lib/core/redis'
import { prisma } from '@/lib/core/db'

// Types
export interface AppSettings {
    general: {
        siteName: string
        emailSender: string
        timezone: string
        maintenanceMode: boolean
        maintenanceMessage: string
    }
    priceOptimization: {
        enabled: boolean
        costWeight: number      // 0-1
        stockWeight: number     // 0-1
        minStock: number
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
    smtp: {
        host: string
        port: number
        user: string
        pass: string
        from: string
    }
}

const DEFAULT_SETTINGS: AppSettings = {
    general: {
        siteName: 'NexNum',
        emailSender: process.env.FROM_EMAIL || 'harshtakur001@gmail.com', // Configurable via env
        timezone: 'UTC',
        maintenanceMode: false,
        maintenanceMessage: 'We are currently performing scheduled maintenance.',
    },
    priceOptimization: {
        enabled: true,
        costWeight: 0.6,     // Cost is most important
        stockWeight: 0.4,    // Stock availability matters
        minStock: 1,         // Require at least 1 in stock
    },
    rateLimit: {
        apiLimit: 300,
        authLimit: 5,
        adminLimit: 30,
        windowSize: 60,
    },
    notifications: {
        emailEnabled: false,
        lowBalanceThreshold: 10,
        syncFailureAlert: true,
    },
    smtp: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
        from: process.env.FROM_EMAIL || 'harshtakur001@gmail.com',
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

            // Fetch from database
            const dbSettings = await prisma.systemSettings.findUnique({
                where: { id: 'default' }
            })

            if (!dbSettings) {
                return DEFAULT_SETTINGS
            }

            // Map DB settings to AppSettings
            // Note: We'll need a way to decrypt secrets if they are in AppSettings
            // For now, let's just use what's in SystemSettings
            const settings: AppSettings = {
                ...DEFAULT_SETTINGS,
                smtp: {
                    host: dbSettings.smtpHost || DEFAULT_SETTINGS.smtp.host,
                    port: dbSettings.smtpPort || DEFAULT_SETTINGS.smtp.port,
                    user: dbSettings.smtpUser || DEFAULT_SETTINGS.smtp.user,
                    pass: dbSettings.smtpPass ? require('@/lib/security/encryption').decrypt(dbSettings.smtpPass) : DEFAULT_SETTINGS.smtp.pass,
                    from: dbSettings.emailFrom || DEFAULT_SETTINGS.smtp.from,
                }
            }

            // Cache for next time
            await redis.setex(SETTINGS_CACHE_KEY, CACHE_TTL, JSON.stringify(settings))

            return settings
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
            } as AppSettings

            // Persist to Database if it's the SMTP section
            if (section === 'smtp') {
                const smtpUpdates = updates as Partial<AppSettings['smtp']>
                await prisma.systemSettings.upsert({
                    where: { id: 'default' },
                    create: {
                        id: 'default',
                        smtpHost: smtpUpdates.host,
                        smtpPort: smtpUpdates.port,
                        smtpUser: smtpUpdates.user,
                        smtpPass: smtpUpdates.pass ? require('@/lib/security/encryption').encrypt(smtpUpdates.pass) : undefined,
                        emailFrom: smtpUpdates.from,
                    },
                    update: {
                        smtpHost: smtpUpdates.host,
                        smtpPort: smtpUpdates.port,
                        smtpUser: smtpUpdates.user,
                        smtpPass: smtpUpdates.pass ? require('@/lib/security/encryption').encrypt(smtpUpdates.pass) : undefined,
                        emailFrom: smtpUpdates.from,
                    }
                })
            }

            // Save to Redis (cache)
            await redis.setex(SETTINGS_CACHE_KEY, CACHE_TTL, JSON.stringify(updated))

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
