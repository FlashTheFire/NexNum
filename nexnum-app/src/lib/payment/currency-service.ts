/**
 * Currency Service
 * 
 * Forensic-grade conversion engine for financial integrity.
 * Acts as the Single Source of Truth for all currency conversions.
 * 
 * Architecture:
 * - Points are the internal "anchor" currency (integer-based for precision)
 * - 1 USD = pointsRate Points (default: 100)
 * - All fiat conversions go through USD as intermediate
 * 
 * Flow:
 * - INR Deposit: INR → USD (via inrToUsdRate) → Points (via pointsRate)
 * - Provider Cost: ProviderCurrency → USD (via exchange API) → Points
 * - Display: Points → USD → UserPreferredCurrency
 * 
 * @module payment/currency-service
 */

import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'
import Decimal from 'decimal.js'

// Configure Decimal.js for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP })

// ============================================================================
// Types
// ============================================================================

export type SupportedCurrency = 'USD' | 'INR' | 'RUB' | 'EUR' | 'GBP' | 'CNY'

export interface ExchangeRates {
    USD: number
    INR: number
    RUB: number
    EUR: number
    GBP: number
    CNY: number
    updatedAt: Date
}

export interface MultiCurrencyPrice {
    points: number
    USD: number
    INR: number
    RUB: number
    EUR: number
    GBP: number
    CNY: number
}

export interface ConversionConfig {
    pointsRate: number      // 1 USD = X Points
    inrToUsdRate: number    // 1 USD = X INR
    syncBufferPercent: number
}

// Redis keys
const RATES_CACHE_KEY = 'currency:rates'
const RATES_CACHE_TTL = 3600 // 1 hour
const CONFIG_CACHE_KEY = 'currency:config'
const CONFIG_CACHE_TTL = 300 // 5 minutes

// ============================================================================
// Currency Service
// ============================================================================

export class CurrencyService {
    private config: ConversionConfig | null = null
    private rates: ExchangeRates | null = null

    /**
     * Initialize service with fresh config
     */
    async initialize(): Promise<void> {
        await this.refreshConfig()
        await this.refreshRates()
    }

    /**
     * Refresh conversion config from database
     */
    async refreshConfig(): Promise<ConversionConfig> {
        try {
            // Try cache first
            const cached = await redis.get(CONFIG_CACHE_KEY)
            if (cached) {
                this.config = JSON.parse(cached)
                return this.config!
            }

            // Fetch from database
            const settings = await prisma.systemSettings.findFirst()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const settingsAny = settings as any

            this.config = {
                pointsRate: settings?.pointsRate ? Number(settings.pointsRate) : 100,
                inrToUsdRate: settingsAny?.inrToUsdRate ? Number(settingsAny.inrToUsdRate) : 83,
                syncBufferPercent: settingsAny?.syncBufferPercent ? Number(settingsAny.syncBufferPercent) : 2
            }

            // Cache it
            await redis.setex(CONFIG_CACHE_KEY, CONFIG_CACHE_TTL, JSON.stringify(this.config))

            return this.config
        } catch (error) {
            logger.error('[CurrencyService] Failed to refresh config', { error })
            // Return safe defaults
            return {
                pointsRate: 100,
                inrToUsdRate: 83,
                syncBufferPercent: 2
            }
        }
    }

    /**
     * Refresh exchange rates from cache or Currency table
     */
    async refreshRates(): Promise<ExchangeRates> {
        try {
            // Try cache first
            const cached = await redis.get(RATES_CACHE_KEY)
            if (cached) {
                this.rates = JSON.parse(cached)
                return this.rates!
            }

            // Fetch from Currency table
            const currencies = await prisma.currency.findMany({
                where: { isActive: true },
                select: { code: true, rate: true, updatedAt: true }
            })

            const ratesMap: Record<string, number> = { USD: 1 }
            let latestUpdate = new Date()

            for (const curr of currencies) {
                ratesMap[curr.code] = Number(curr.rate)
                if (curr.updatedAt > latestUpdate) {
                    latestUpdate = curr.updatedAt
                }
            }

            this.rates = {
                USD: ratesMap['USD'] || 1,
                INR: ratesMap['INR'] || 83,
                RUB: ratesMap['RUB'] || 92,
                EUR: ratesMap['EUR'] || 0.92,
                GBP: ratesMap['GBP'] || 0.79,
                CNY: ratesMap['CNY'] || 7.25,
                updatedAt: latestUpdate
            }

            // Cache it
            await redis.setex(RATES_CACHE_KEY, RATES_CACHE_TTL, JSON.stringify(this.rates))

            return this.rates
        } catch (error) {
            logger.error('[CurrencyService] Failed to refresh rates', { error })
            // Return safe defaults
            return {
                USD: 1,
                INR: 83,
                RUB: 92,
                EUR: 0.92,
                GBP: 0.79,
                CNY: 7.25,
                updatedAt: new Date()
            }
        }
    }

    /**
     * Get current config (with lazy load)
     */
    async getConfig(): Promise<ConversionConfig> {
        if (!this.config) {
            await this.refreshConfig()
        }
        return this.config!
    }

    /**
     * Get current rates (with lazy load)
     */
    async getRates(): Promise<ExchangeRates> {
        if (!this.rates) {
            await this.refreshRates()
        }
        return this.rates!
    }

    // ========================================================================
    // Core Conversion Methods
    // ========================================================================

    /**
     * Convert INR deposit amount to Points
     * Used by: DepositService.confirmDeposit
     * 
     * @param inrAmount - Amount in Indian Rupees
     * @returns Points (integer)
     */
    async inrToPoints(inrAmount: number): Promise<number> {
        const config = await this.getConfig()

        // INR → USD → Points
        const usdAmount = new Decimal(inrAmount).dividedBy(config.inrToUsdRate)
        const points = usdAmount.times(config.pointsRate)

        // Round down for safety (never over-credit)
        return points.floor().toNumber()
    }

    /**
     * Convert USD amount to Points
     * 
     * @param usdAmount - Amount in USD
     * @returns Points (integer)
     */
    async usdToPoints(usdAmount: number): Promise<number> {
        const config = await this.getConfig()

        const points = new Decimal(usdAmount).times(config.pointsRate)
        return points.floor().toNumber()
    }

    /**
     * Convert provider cost to Points with optional buffer
     * Used by: provider-sync.ts during MeiliSearch indexing
     * 
     * @param cost - Raw cost from provider
     * @param providerCurrency - Provider's billing currency (e.g., 'RUB', 'USD')
     * @param bufferPercent - Additional safety buffer (provider-specific or global)
     * @returns Points including buffer
     */
    async providerCostToPoints(
        cost: number,
        providerCurrency: string,
        bufferPercent: number = 0
    ): Promise<number> {
        const config = await this.getConfig()
        const rates = await this.getRates()

        // Convert provider currency to USD
        let usdCost: Decimal

        if (providerCurrency === 'USD') {
            usdCost = new Decimal(cost)
        } else {
            const rate = (rates as any)[providerCurrency] || 1
            usdCost = new Decimal(cost).dividedBy(rate)
        }

        // Apply buffer for currency volatility protection
        const effectiveBuffer = bufferPercent > 0 ? bufferPercent : config.syncBufferPercent
        const bufferedCost = usdCost.times(1 + effectiveBuffer / 100)

        // Convert to Points
        const points = bufferedCost.times(config.pointsRate)

        // Round UP for sell price (protect margin)
        return points.ceil().toNumber()
    }

    /**
     * Convert Points to single fiat currency
     * 
     * @param points - Points amount
     * @param targetCurrency - Target fiat currency
     * @returns Fiat amount (2 decimal places)
     */
    async pointsToFiat(points: number, targetCurrency: SupportedCurrency): Promise<number> {
        const config = await this.getConfig()
        const rates = await this.getRates()

        // Points → USD
        const usdAmount = new Decimal(points).dividedBy(config.pointsRate)

        // USD → Target Currency
        if (targetCurrency === 'USD') {
            return usdAmount.toDecimalPlaces(2).toNumber()
        }

        const rate = rates[targetCurrency] || 1
        const fiatAmount = usdAmount.times(rate)

        return fiatAmount.toDecimalPlaces(2).toNumber()
    }

    /**
     * Convert Points to ALL supported fiat currencies
     * Used by: dashboard/state API, MeiliSearch indexing
     * 
     * This is the key method for ZERO client-side calculation.
     * 
     * @param points - Points amount
     * @returns Object with all currency equivalents
     */
    async pointsToAllFiat(points: number): Promise<MultiCurrencyPrice> {
        const config = await this.getConfig()
        const rates = await this.getRates()

        // Points → USD (base conversion)
        const usdAmount = new Decimal(points).dividedBy(config.pointsRate)

        return {
            points,
            USD: usdAmount.toDecimalPlaces(2).toNumber(),
            INR: usdAmount.times(rates.INR).toDecimalPlaces(2).toNumber(),
            RUB: usdAmount.times(rates.RUB).toDecimalPlaces(2).toNumber(),
            EUR: usdAmount.times(rates.EUR).toDecimalPlaces(2).toNumber(),
            GBP: usdAmount.times(rates.GBP).toDecimalPlaces(2).toNumber(),
            CNY: usdAmount.times(rates.CNY).toDecimalPlaces(2).toNumber()
        }
    }

    /**
     * Convert any fiat to Points
     * Used by: General purpose conversion
     * 
     * @param amount - Fiat amount
     * @param fromCurrency - Source currency
     * @returns Points (integer)
     */
    async fiatToPoints(amount: number, fromCurrency: SupportedCurrency): Promise<number> {
        const config = await this.getConfig()
        const rates = await this.getRates()

        // Fiat → USD
        let usdAmount: Decimal

        if (fromCurrency === 'USD') {
            usdAmount = new Decimal(amount)
        } else {
            const rate = rates[fromCurrency] || 1
            usdAmount = new Decimal(amount).dividedBy(rate)
        }

        // USD → Points
        const points = usdAmount.times(config.pointsRate)

        return points.floor().toNumber()
    }

    // ========================================================================
    // Utility Methods
    // ========================================================================

    /**
     * Invalidate all caches (call after admin updates rates/config)
     */
    async invalidateCache(): Promise<void> {
        await redis.del(RATES_CACHE_KEY)
        await redis.del(CONFIG_CACHE_KEY)
        this.config = null
        this.rates = null
        logger.info('[CurrencyService] Cache invalidated')
    }

    /**
     * Get current service status (for monitoring)
     */
    async getStatus(): Promise<{
        configLoaded: boolean
        ratesLoaded: boolean
        lastRatesUpdate: Date | null
    }> {
        const rates = await this.getRates()
        return {
            configLoaded: !!this.config,
            ratesLoaded: !!this.rates,
            lastRatesUpdate: rates?.updatedAt || null
        }
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let serviceInstance: CurrencyService | null = null

export function getCurrencyService(): CurrencyService {
    if (!serviceInstance) {
        serviceInstance = new CurrencyService()
    }
    return serviceInstance
}
