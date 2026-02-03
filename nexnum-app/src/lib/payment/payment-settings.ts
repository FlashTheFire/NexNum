/**
 * Payment Settings Service
 * 
 * Centralized service for fetching and caching payment gateway configuration
 * from the SystemSettings table. Uses Redis for fast access with TTL-based invalidation.
 * 
 * @module payment/payment-settings
 */

import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'
import { Prisma } from '@prisma/client'
import { encrypt, decrypt } from '@/lib/security/encryption'

// ============================================================================
// Types
// ============================================================================

export type UPIProviderMode = 'THIRD_PARTY' | 'DIRECT_PAYTM' | 'DISABLED'
export type PaytmEnvironment = 'STAGING' | 'PRODUCTION'

export interface PaymentConfig {
    // General
    paymentsEnabled: boolean
    upiProviderMode: UPIProviderMode

    // 3rd Party UPI Gateway
    upiApiToken: string | null
    upiCreateOrderUrl: string | null
    upiCheckStatusUrl: string | null
    upiQrBaseUrl: string | null

    // Direct Paytm (Future)
    paytmMerchantId: string | null
    paytmMerchantKey: string | null
    paytmWebsite: string | null
    paytmIndustryType: string | null
    paytmChannelId: string | null
    paytmCallbackUrl: string | null
    paytmEnvironment: PaytmEnvironment

    // Transaction Limits
    depositMinAmount: number
    depositMaxAmount: number
    depositTimeoutMins: number
    maxPendingDeposits: number

    // Deposit Bonus
    depositBonusPercent: number

    // Points (from SystemSettings)
    pointsRate: number
}

export interface PublicPaymentConfig {
    enabled: boolean
    mode: UPIProviderMode
    limits: {
        minAmount: number
        maxAmount: number
        timeoutMinutes: number
        maxPending: number
    }
    bonusPercent: number
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_KEY = 'payment:settings'
const CACHE_TTL_SECONDS = 300 // 5 minutes

// Default config used when payments disabled or not configured
const DEFAULT_CONFIG: PaymentConfig = {
    paymentsEnabled: false,
    upiProviderMode: 'DISABLED',
    upiApiToken: null,
    upiCreateOrderUrl: null,
    upiCheckStatusUrl: null,
    upiQrBaseUrl: null,
    paytmMerchantId: null,
    paytmMerchantKey: null,
    paytmWebsite: null,
    paytmIndustryType: null,
    paytmChannelId: null,
    paytmCallbackUrl: null,
    paytmEnvironment: 'STAGING',
    depositMinAmount: 10,
    depositMaxAmount: 50000,
    depositTimeoutMins: 30,
    maxPendingDeposits: 3,
    depositBonusPercent: 0,
    pointsRate: 100,
}

// ============================================================================
// Helper Functions
// ============================================================================

function decimalToNumber(val: Prisma.Decimal | number | null | undefined, defaultVal: number): number {
    if (val === null || val === undefined) return defaultVal
    return typeof val === 'number' ? val : Number(val.toString())
}

// ============================================================================
// Service
// ============================================================================

export class PaymentSettingsService {
    /**
     * Get payment configuration with caching
     */
    async getConfig(): Promise<PaymentConfig> {
        try {
            // Try cache first
            const cached = await redis.get(CACHE_KEY)
            if (cached) {
                return JSON.parse(cached) as PaymentConfig
            }

            // Fetch from database
            const settings = await prisma.systemSettings.findUnique({
                where: { id: 'default' },
            })

            if (!settings) {
                logger.warn('[PaymentSettings] No system settings found, using defaults')
                return DEFAULT_CONFIG
            }

            const config: PaymentConfig = {
                paymentsEnabled: settings.paymentsEnabled,
                upiProviderMode: settings.upiProviderMode as UPIProviderMode,
                upiApiToken: settings.upiApiToken ? decrypt(settings.upiApiToken) : null,
                upiCreateOrderUrl: settings.upiCreateOrderUrl,
                upiCheckStatusUrl: settings.upiCheckStatusUrl,
                upiQrBaseUrl: settings.upiQrBaseUrl,
                paytmMerchantId: settings.paytmMerchantId,
                paytmMerchantKey: settings.paytmMerchantKey ? decrypt(settings.paytmMerchantKey) : null,
                paytmWebsite: settings.paytmWebsite,
                paytmIndustryType: settings.paytmIndustryType,
                paytmChannelId: settings.paytmChannelId,
                paytmCallbackUrl: settings.paytmCallbackUrl,
                paytmEnvironment: settings.paytmEnvironment as PaytmEnvironment,
                depositMinAmount: decimalToNumber(settings.depositMinAmount, 10),
                depositMaxAmount: decimalToNumber(settings.depositMaxAmount, 50000),
                depositTimeoutMins: settings.depositTimeoutMins,
                maxPendingDeposits: settings.maxPendingDeposits,
                depositBonusPercent: decimalToNumber(settings.depositBonusPercent, 0),
                pointsRate: decimalToNumber(settings.pointsRate, 100),
            }

            // Cache the config
            await redis.setex(CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(config))

            return config
        } catch (error: any) {
            logger.error('[PaymentSettings] Failed to get config', { error: error.message })
            return DEFAULT_CONFIG
        }
    }

    /**
     * Get public-facing config (for frontend, no sensitive data)
     */
    async getPublicConfig(): Promise<PublicPaymentConfig> {
        const config = await this.getConfig()

        return {
            enabled: config.paymentsEnabled && config.upiProviderMode !== 'DISABLED',
            mode: config.upiProviderMode,
            limits: {
                minAmount: config.depositMinAmount,
                maxAmount: config.depositMaxAmount,
                timeoutMinutes: config.depositTimeoutMins,
                maxPending: config.maxPendingDeposits,
            },
            bonusPercent: config.depositBonusPercent,
        }
    }

    /**
     * Update payment configuration
     */
    async updateConfig(updates: Partial<Omit<PaymentConfig, 'pointsRate'>>): Promise<PaymentConfig> {
        try {
            const settings = await prisma.systemSettings.upsert({
                where: { id: 'default' },
                create: {
                    id: 'default',
                    ...this.mapConfigToPrisma(updates),
                },
                update: this.mapConfigToPrisma(updates),
            })

            // Invalidate cache
            await this.invalidateCache()

            logger.info('[PaymentSettings] Configuration updated', {
                paymentsEnabled: settings.paymentsEnabled,
                upiProviderMode: settings.upiProviderMode,
            })

            // Return fresh config
            return this.getConfig()
        } catch (error: any) {
            logger.error('[PaymentSettings] Failed to update config', { error: error.message })
            throw error
        }
    }

    /**
     * Invalidate cached configuration
     */
    async invalidateCache(): Promise<void> {
        await redis.del(CACHE_KEY)
        logger.debug('[PaymentSettings] Cache invalidated')
    }

    /**
     * Test 3rd party gateway connection
     */
    async testThirdPartyConnection(): Promise<{ success: boolean; message: string }> {
        const config = await this.getConfig()

        if (!config.upiApiToken || !config.upiCheckStatusUrl) {
            return { success: false, message: 'API token or status URL not configured' }
        }

        try {
            // Simple health check - try to check a non-existent order
            const response = await fetch(`${config.upiCheckStatusUrl}?order_id=test_health&token=${config.upiApiToken}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            })

            // Even a 404 or "order not found" means the API is reachable
            if (response.ok || response.status === 404) {
                return { success: true, message: 'Gateway connection successful' }
            }

            return { success: false, message: `Gateway returned status ${response.status}` }
        } catch (error: any) {
            return { success: false, message: error.message || 'Connection failed' }
        }
    }

    /**
     * Check if payments are fully configured and enabled
     */
    async isOperational(): Promise<boolean> {
        const config = await this.getConfig()

        if (!config.paymentsEnabled) return false

        if (config.upiProviderMode === 'THIRD_PARTY') {
            return !!(config.upiApiToken && config.upiCreateOrderUrl && config.upiCheckStatusUrl)
        }

        if (config.upiProviderMode === 'DIRECT_PAYTM') {
            return !!(config.paytmMerchantId && config.paytmMerchantKey)
        }

        return false
    }

    /**
     * Map config object to Prisma update format
     */
    private mapConfigToPrisma(config: Partial<Omit<PaymentConfig, 'pointsRate'>>) {
        const mapped: Record<string, unknown> = {}

        if (config.paymentsEnabled !== undefined) mapped.paymentsEnabled = config.paymentsEnabled
        if (config.upiProviderMode !== undefined) mapped.upiProviderMode = config.upiProviderMode
        if (config.upiApiToken !== undefined) {
            mapped.upiApiToken = config.upiApiToken ? encrypt(config.upiApiToken) : null
        }
        if (config.upiCreateOrderUrl !== undefined) mapped.upiCreateOrderUrl = config.upiCreateOrderUrl
        if (config.upiCheckStatusUrl !== undefined) mapped.upiCheckStatusUrl = config.upiCheckStatusUrl
        if (config.upiQrBaseUrl !== undefined) mapped.upiQrBaseUrl = config.upiQrBaseUrl
        if (config.paytmMerchantId !== undefined) mapped.paytmMerchantId = config.paytmMerchantId
        if (config.paytmMerchantKey !== undefined) {
            mapped.paytmMerchantKey = config.paytmMerchantKey ? encrypt(config.paytmMerchantKey) : null
        }
        if (config.paytmWebsite !== undefined) mapped.paytmWebsite = config.paytmWebsite
        if (config.paytmIndustryType !== undefined) mapped.paytmIndustryType = config.paytmIndustryType
        if (config.paytmChannelId !== undefined) mapped.paytmChannelId = config.paytmChannelId
        if (config.paytmCallbackUrl !== undefined) mapped.paytmCallbackUrl = config.paytmCallbackUrl
        if (config.paytmEnvironment !== undefined) mapped.paytmEnvironment = config.paytmEnvironment
        if (config.depositMinAmount !== undefined) mapped.depositMinAmount = config.depositMinAmount
        if (config.depositMaxAmount !== undefined) mapped.depositMaxAmount = config.depositMaxAmount
        if (config.depositTimeoutMins !== undefined) mapped.depositTimeoutMins = config.depositTimeoutMins
        if (config.maxPendingDeposits !== undefined) mapped.maxPendingDeposits = config.maxPendingDeposits
        if (config.depositBonusPercent !== undefined) mapped.depositBonusPercent = config.depositBonusPercent

        return mapped
    }
}

// ============================================================================
// Singleton
// ============================================================================

let serviceInstance: PaymentSettingsService | null = null

export function getPaymentSettingsService(): PaymentSettingsService {
    if (!serviceInstance) {
        serviceInstance = new PaymentSettingsService()
    }
    return serviceInstance
}
