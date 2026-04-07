import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'
import { redis } from '@/lib/core/redis'
import { Decimal } from 'decimal.js'

// ============================================================================
// Types & Constants
// ============================================================================

export interface ExchangeRate {
    code: string
    rate: number
    updatedAt: Date
}

export interface SyncStats {
    totalFetched: number
    updated: number
    skipped: number
    errors: number
    updatedCurrencies: string[]
}

export interface MultiCurrencyPrice {
    points: number
    USD: number
    INR: number
    RUB?: number
    EUR?: number
    GBP?: number
    CNY?: number
    [key: string]: number | undefined
}

const FRANKFURTER_API = 'https://api.frankfurter.app/latest?from=USD'
const RATES_CACHE_KEY = 'currency:rates:latest'
const SETTINGS_CACHE_KEY = 'currency:settings'
const CACHE_TTL = 3600 // 1 hour

// ============================================================================
// Currency Service
// ============================================================================

export class CurrencyService {
    private static instance: CurrencyService | null = null

    private constructor() {
        // Set Decimal precision for financial calculations
        Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP })
    }

    public static getInstance(): CurrencyService {
        if (!CurrencyService.instance) {
            CurrencyService.instance = new CurrencyService()
        }
        return CurrencyService.instance
    }

    /**
     * Get system settings with caching
     */
    public async getSettings() {
        // Try cache first
        const cached = await redis.get(SETTINGS_CACHE_KEY)
        if (cached) return JSON.parse(cached)

        const settings = await prisma.systemSettings.findFirst()
        const settingsAny = settings as any
        const data = {
            pointsRate: Number(settings?.pointsRate) || 100,
            inrToUsdRate: Number(settings?.inrToUsdRate) || 83,
            syncBufferPercent: Number(settings?.syncBufferPercent) || 2, 
            volatilitySpread: Number(settingsAny?.volatilitySpread) || 2,
        }

        await redis.setex(SETTINGS_CACHE_KEY, CACHE_TTL, JSON.stringify(data))
        return data
    }

    /**
     * Compatibility alias for getRates
     */
    public async getRates(): Promise<Record<string, number>> {
        return this.getAllRates()
    }

    /**
     * Compatibility alias for getSettings
     */
    public async getConfig() {
        return this.getSettings()
    }

    /**
     * Get all rates with caching
     */
    public async getAllRates(): Promise<Record<string, number>> {
        const cached = await redis.get(RATES_CACHE_KEY)
        if (cached) return JSON.parse(cached)

        const ratesList = await prisma.currency.findMany({
            where: { isActive: true },
            select: { code: true, rate: true }
        })

        const rates: Record<string, number> = {}
        ratesList.forEach(r => {
            rates[r.code] = Number(r.rate)
        })

        // Ensure USD is always present as base
        if (!rates['USD']) rates['USD'] = 1

        await redis.setex(RATES_CACHE_KEY, CACHE_TTL, JSON.stringify(rates))
        return rates
    }

    /**
     * Precise conversion between any two currencies
     */
    public async convert(amount: number, from: string, to: string): Promise<number> {
        if (from === to) return amount
        if (amount === 0) return 0

        const rates = await this.getAllRates()
        const fromRate = rates[from]
        const toRate = rates[to]

        if (!fromRate || !toRate || fromRate === 0) {
            logger.warn(`[CurrencyService] Missing or invalid rate for ${from} or ${to}`)
            return amount // Fallback to 1:1 if rates missing
        }

        // Calculation: (amount / fromRate) * toRate
        // Using Decimal for precision
        const result = new Decimal(amount)
            .div(fromRate)
            .mul(toRate)

        return result.toNumber()
    }

    /**
     * Convert Points to a specific Fiat currency
     */
    public async pointsToFiat(points: number, currencyCode: string): Promise<number> {
        const { pointsRate } = await this.getSettings()
        // Points -> USD: points / pointsRate
        const usdAmount = new Decimal(points).div(pointsRate).toNumber()
        // USD -> Target Fiat
        return this.convert(usdAmount, 'USD', currencyCode)
    }

    /**
     * Zero-Math Helper: Get point price in all supported fiat currencies
     */
    public async pointsToAllFiat(points: number): Promise<MultiCurrencyPrice> {
        const rates = await this.getAllRates()
        const { pointsRate } = await this.getSettings()
        
        const usdBase = new Decimal(points).div(pointsRate)
        const prices: MultiCurrencyPrice = {
            points: Number(points)
        } as MultiCurrencyPrice

        for (const [code, rate] of Object.entries(rates)) {
            prices[code] = usdBase.mul(rate).toDecimalPlaces(4).toNumber()
        }

        return prices
    }

    /**
     * Convert INR Deposit to Points
     */
    public async inrToPoints(inrAmount: number): Promise<number> {
        const { inrToUsdRate, pointsRate } = await this.getSettings()
        // INR -> USD: inrAmount / inrToUsdRate
        // USD -> Points: usdAmount * pointsRate
        const points = new Decimal(inrAmount)
            .div(inrToUsdRate)
            .mul(pointsRate)
            .floor() // Always floor for user credit to avoid fractional points

        return points.toNumber()
    }

    /**
     * Convert Provider Cost (USD) to Internal Points with markup/buffer
     */
    public async providerCostToPoints(usdCost: number, customMarkup?: number): Promise<number> {
        const { pointsRate, syncBufferPercent } = await this.getSettings()
        const buffer = customMarkup ?? syncBufferPercent
        
        // (usdCost * pointsRate) * (1 + buffer/100)
        const basePoints = new Decimal(usdCost).mul(pointsRate)
        const pointsWithBuffer = basePoints.mul(new Decimal(1).add(new Decimal(buffer).div(100)))
        
        return pointsWithBuffer.toDecimalPlaces(2).toNumber()
    }

    /**
     * Normalize a provider price into internal points logic
     */
    public async normalizeProviderPrice(price: number, currency: string = 'USD'): Promise<number> {
        if (currency === 'POINTS') return price
        
        // Convert any currency to USD first
        const usdPrice = await this.convert(price, currency, 'USD')
        return this.providerCostToPoints(usdPrice)
    }

    /**
     * Synchronize exchange rates from Frankfurter API
     */
    public async syncRates(): Promise<SyncStats> {
        const stats: SyncStats = {
            totalFetched: 0,
            updated: 0,
            skipped: 0,
            errors: 0,
            updatedCurrencies: []
        }

        try {
            const response = await fetch(FRANKFURTER_API)
            if (!response.ok) throw new Error(`Frankfurter API error: ${response.statusText}`)
            
            const data = await response.json()
            const fetchedRates = data.rates || {}
            
            // Add USD base rate
            fetchedRates['USD'] = 1.0
            
            const currencies = Object.entries(fetchedRates)
            stats.totalFetched = currencies.length

            for (const [code, rate] of currencies) {
                try {
                    const result = await prisma.currency.upsert({
                        where: { code },
                        update: { 
                            rate: Number(rate),
                            isActive: true,
                            updatedAt: new Date()
                        },
                        create: {
                            code,
                            name: code, // Default name to code
                            symbol: code,
                            rate: Number(rate),
                            isActive: true
                        }
                    })
                    
                    if (result) {
                        stats.updated++
                        stats.updatedCurrencies.push(code)
                    }
                } catch (err) {
                    logger.error(`[CurrencyService] Error updating rate for ${code}:`, { error: err instanceof Error ? err.message : String(err) })
                    stats.errors++
                }
            }

            // Clear cache after sync
            await redis.del(RATES_CACHE_KEY)
            
            logger.info('[CurrencyService] Sync completed', stats)
            return stats
        } catch (error) {
            logger.error('[CurrencyService] Sync failed:', { error: error instanceof Error ? error.message : String(error) })
            throw error
        }
    }
}

// Export singleton factory
export const getCurrencyService = () => CurrencyService.getInstance()
