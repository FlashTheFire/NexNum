/**
 * NexNum Unified Currency Service (v3)
 *
 * Single source of truth for all currency operations.
 *
 * Architecture (Golden Rule):
 * - Backend operates ONLY in Points.
 * - Exchange rates are set MANUALLY by admin via Admin Panel. NO external API.
 * - `pointsToAllFiat()` is used to generate frontend display maps.
 * - `captureSnapshot()` is used to record immutable fiat context at every financial event.
 * - Old financial data is NEVER recalculated. The snapshot is the record.
 *
 * Flow:
 * - INR Deposit:  INR → USD (÷ inrToUsdRate) → Points (× pointsRate) [floor]
 * - Provider Cost: ProviderCurrency → USD (÷ providerRate) → Points (× pointsRate) [ceil]
 * - Display:       Points → USD (÷ pointsRate) → UserFiat (× fiatRate) [2dp]
 * - Snapshot:      Capture full rate map + fiatEquivalent at event time → save to DB
 *
 * Cache Keys (v3 — safe to deploy alongside old v1/v2 keys):
 * - currency:v3:rates    (1 hour TTL)
 * - currency:v3:config   (5 min TTL)
 *
 * @module currency/currency-service
 */

import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'
import { redis } from '@/lib/core/redis'
import Decimal from 'decimal.js'

// Configure Decimal.js globally for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP })

// ============================================================================
// Types & Constants
// ============================================================================

/** All supported display currencies for the frontend. */
export type SupportedCurrency = 'USD' | 'INR' | 'RUB' | 'EUR' | 'GBP' | 'CNY'

const SUPPORTED_CURRENCY_LIST: SupportedCurrency[] = ['USD', 'INR', 'RUB', 'EUR', 'GBP', 'CNY']

/**
 * Coerce any currency code to a supported one. Falls back to 'USD'.
 * Use this at every API boundary to sanitize user-provided currency strings.
 */
export function toSupportedCurrency(code: string | null | undefined): SupportedCurrency {
    return (SUPPORTED_CURRENCY_LIST.includes(code as SupportedCurrency) ? code : 'USD') as SupportedCurrency
}

/** Exchange rates keyed by currency code. INR is always from SystemSettings. */
export interface ExchangeRates {
    USD: number
    INR: number
    RUB: number
    EUR: number
    GBP: number
    CNY: number
    updatedAt: Date
}

/** Pre-computed multi-currency price map for Zero-Math frontend rendering. */
export interface MultiCurrencyPrice {
    points: number
    USD: number
    INR: number
    RUB: number
    EUR: number
    GBP: number
    CNY: number
    [key: string]: number
}

/** System configuration for points/currency conversion. */
export interface ConversionConfig {
    pointsRate: number       // 1 USD = N Points (e.g. 100)
    inrToUsdRate: number     // 1 USD = N INR   (e.g. 83) — single source of truth
    syncBufferPercent: number // Safety buffer for provider cost estimates
}

/**
 * Immutable financial snapshot — captured at every financial event (deposit, purchase, refund, etc.).
 * Stored in WalletTransaction.currencySnapshot (JSON). Never recalculated for display.
 */
export interface CurrencySnapshot {
    points: number                    // Exact point amount of the event
    rates: Record<string, number>     // Full rate map active at event time
    userCurrency: string              // User's preferred display currency
    fiatEquivalent: number            // points converted to userCurrency at event-time rates
    pointsRate: number                // pointsRate active at event time
    inrToUsdRate: number              // inrToUsdRate active at event time
    capturedAt: string                // ISO 8601 timestamp
}

/** Stats returned by the (now DB-only) syncRates operation. */
export interface SyncStats {
    totalFetched: number
    updated: number
    skipped: number
    errors: number
    updatedCurrencies: string[]
}

// v3 Redis keys — safe alongside old v1 (currency:rates:latest) and v2 (currency:rates) keys
const RATES_CACHE_KEY   = 'currency:v3:rates'
const CONFIG_CACHE_KEY  = 'currency:v3:config'
const RATES_CACHE_TTL   = 3600  // 1 hour
const CONFIG_CACHE_TTL  = 300   // 5 minutes

// Safe defaults used only when DB is unreachable
const DEFAULTS: ConversionConfig = { pointsRate: 100, inrToUsdRate: 83, syncBufferPercent: 2 }
const DEFAULT_RATES: Omit<ExchangeRates, 'updatedAt'> = {
    USD: 1, INR: 83, RUB: 92, EUR: 0.92, GBP: 0.79, CNY: 7.25
}

// ============================================================================
// Unified Currency Service (Singleton)
// ============================================================================

export class CurrencyService {
    private static instance: CurrencyService | null = null
    private config: ConversionConfig | null = null
    private rates: ExchangeRates | null = null

    private constructor() {}

    public static getInstance(): CurrencyService {
        if (!CurrencyService.instance) {
            CurrencyService.instance = new CurrencyService()
        }
        return CurrencyService.instance
    }

    // ==========================================================================
    // Configuration & Rates (DB + Redis Cache)
    // ==========================================================================

    /**
     * Get system conversion config.
     * Reads from Redis v3 cache, then DB. Never from an external API.
     * INR rate is always `SystemSettings.inrToUsdRate` — single source of truth.
     */
    async getConfig(): Promise<ConversionConfig> {
        if (this.config) return this.config

        try {
            const cached = await redis.get(CONFIG_CACHE_KEY)
            if (cached) {
                this.config = JSON.parse(cached)
                return this.config!
            }

            const settings = await prisma.systemSettings.findUnique({ where: { id: 'default' } })
            const s = settings as any

            this.config = {
                pointsRate:        s?.pointsRate        ? Number(s.pointsRate)        : DEFAULTS.pointsRate,
                inrToUsdRate:      s?.inrToUsdRate      ? Number(s.inrToUsdRate)      : DEFAULTS.inrToUsdRate,
                syncBufferPercent: s?.syncBufferPercent ? Number(s.syncBufferPercent) : DEFAULTS.syncBufferPercent,
            }

            await redis.setex(CONFIG_CACHE_KEY, CONFIG_CACHE_TTL, JSON.stringify(this.config))
            return this.config

        } catch (error) {
            logger.error('[CurrencyService] Failed to load config, using defaults', { error })
            this.config = { ...DEFAULTS }
            return this.config
        }
    }

    /** Alias for backwards compatibility with v1 callers using getSettings(). */
    async getSettings(): Promise<ConversionConfig> {
        return this.getConfig()
    }

    /**
     * Get all active exchange rates.
     * Source: `Currency` table (admin-managed). INR is always overridden by `SystemSettings.inrToUsdRate`.
     * NO external API calls. Rates only change when admin updates them.
     */
    async getRates(): Promise<ExchangeRates> {
        if (this.rates) return this.rates

        try {
            const cached = await redis.get(RATES_CACHE_KEY)
            if (cached) {
                this.rates = JSON.parse(cached)
                return this.rates!
            }

            const [currencies, config] = await Promise.all([
                prisma.currency.findMany({
                    where: { isActive: true },
                    select: { code: true, rate: true, updatedAt: true }
                }),
                this.getConfig()
            ])

            const ratesMap: Record<string, number> = { USD: 1 }
            let latestUpdate = new Date(0)

            for (const curr of currencies) {
                ratesMap[curr.code] = Number(curr.rate)
                if (curr.updatedAt > latestUpdate) latestUpdate = curr.updatedAt
            }

            // INR override: always use SystemSettings.inrToUsdRate so deposit and display match perfectly
            this.rates = {
                USD: ratesMap['USD'] || DEFAULT_RATES.USD,
                INR: config.inrToUsdRate,                          // ← single source of truth
                RUB: ratesMap['RUB'] || DEFAULT_RATES.RUB,
                EUR: ratesMap['EUR'] || DEFAULT_RATES.EUR,
                GBP: ratesMap['GBP'] || DEFAULT_RATES.GBP,
                CNY: ratesMap['CNY'] || DEFAULT_RATES.CNY,
                updatedAt: latestUpdate
            }

            await redis.setex(RATES_CACHE_KEY, RATES_CACHE_TTL, JSON.stringify(this.rates))
            return this.rates

        } catch (error) {
            logger.error('[CurrencyService] Failed to load rates, using defaults', { error })
            this.rates = { ...DEFAULT_RATES, updatedAt: new Date() }
            return this.rates
        }
    }

    /** Alias for backwards compatibility with v1 callers using getAllRates(). Returns flat Record. */
    async getAllRates(): Promise<Record<string, number>> {
        const rates = await this.getRates()
        const { updatedAt, ...flat } = rates
        return flat
    }

    /** Invalidate v3 cache (call after admin updates rates or config via Admin Panel). */
    async invalidateCache(): Promise<void> {
        await Promise.all([
            redis.del(RATES_CACHE_KEY),
            redis.del(CONFIG_CACHE_KEY),
        ])
        this.config = null
        this.rates = null
        logger.info('[CurrencyService] v3 cache invalidated')
    }

    /**
     * "Sync" rates — DB only. NO external API.
     * This method now just refreshes the in-memory/Redis cache from the DB.
     * Rates are managed exclusively through the Admin Panel.
     */
    async syncRates(): Promise<SyncStats> {
        const stats: SyncStats = {
            totalFetched: 0,
            updated: 0,
            skipped: 0,
            errors: 0,
            updatedCurrencies: []
        }

        try {
            // Invalidate cache so next read pulls fresh from DB
            await this.invalidateCache()

            // Load fresh rates from DB to populate stats
            const currencies = await prisma.currency.findMany({
                where: { isActive: true },
                select: { code: true }
            })

            stats.totalFetched = currencies.length
            stats.updated = currencies.length
            stats.updatedCurrencies = currencies.map(c => c.code)

            logger.info('[CurrencyService] Rates refreshed from DB (no external API)', stats)
            return stats

        } catch (error) {
            logger.error('[CurrencyService] syncRates failed', { error: error instanceof Error ? error.message : String(error) })
            throw error
        }
    }

    /** Get service status for monitoring. */
    async getStatus(): Promise<{ configLoaded: boolean; ratesLoaded: boolean; lastRatesUpdate: Date | null }> {
        const rates = await this.getRates()
        return {
            configLoaded: !!this.config,
            ratesLoaded: !!this.rates,
            lastRatesUpdate: rates?.updatedAt || null
        }
    }

    // ==========================================================================
    // Core Conversion Methods (All use Decimal.js)
    // ==========================================================================

    /**
     * Convert INR deposit amount to Points.
     * Used by: DepositService.confirmDeposit
     * Formula: floor(INR / inrToUsdRate × pointsRate)
     * Always floors to avoid over-crediting.
     */
    async inrToPoints(inrAmount: number): Promise<number> {
        const { inrToUsdRate, pointsRate } = await this.getConfig()
        return new Decimal(inrAmount)
            .dividedBy(inrToUsdRate)
            .times(pointsRate)
            .floor()
            .toNumber()
    }

    /**
     * Convert USD amount to Points.
     * Formula: floor(USD × pointsRate)
     */
    async usdToPoints(usdAmount: number): Promise<number> {
        const { pointsRate } = await this.getConfig()
        return new Decimal(usdAmount)
            .times(pointsRate)
            .floor()
            .toNumber()
    }

    /**
     * Convert any fiat amount to Points.
     * Used by: purchase route (maxPrice filter), search offers (maxPrice filter)
     * Formula: floor(fiat / fiatRate × pointsRate)
     * Always floors (user gets equal or fewer points than displayed).
     */
    async fiatToPoints(amount: number, fromCurrency: SupportedCurrency): Promise<number> {
        const [config, rates] = await Promise.all([this.getConfig(), this.getRates()])

        const rate = fromCurrency === 'USD' ? 1 : (rates[fromCurrency] || 1)
        return new Decimal(amount)
            .dividedBy(rate)
            .times(config.pointsRate)
            .floor()
            .toNumber()
    }

    /**
     * Convert provider raw cost to internal sell price in Points.
     * Used by: provider-sync.ts (indexing), purchase route (profit calc)
     * Formula: ceil((rawCost / effectiveProviderRate × pointsRate) × multiplier + markupPoints)
     *
     * @param rawCost            Provider's cost in their native currency
     * @param providerCurrency   Provider's billing currency (e.g. 'RUB', 'USD')
     * @param effectiveRate      Admin-set effective rate (units of providerCurrency per 1 USD)
     * @param multiplier         Margin multiplier (e.g. 1.3 = 30% markup). Default 1.
     * @param fixedMarkupUsd     Fixed markup in USD added after multiplier. Default 0.
     */
    async calculateSellPrice(
        rawCost: number,
        providerCurrency: string,
        effectiveRate: number,
        multiplier: number = 1,
        fixedMarkupUsd: number = 0
    ): Promise<{ pointPrice: number; costUsd: number }> {
        const { pointsRate } = await this.getConfig()

        // 1. Raw cost → USD using the admin-defined effective provider rate
        //    effectiveRate = units of providerCurrency per 1 USD
        const costUsd = new Decimal(rawCost).dividedBy(effectiveRate > 0 ? effectiveRate : 1)

        // 2. Apply multiplier + fixed markup (both in USD space)
        const sellUsd = costUsd.times(multiplier).plus(fixedMarkupUsd)

        // 3. USD → Points, always CEIL to protect margin
        const pointPrice = sellUsd.times(pointsRate).ceil().toNumber()

        return { pointPrice, costUsd: costUsd.toDecimalPlaces(6).toNumber() }
    }

    /**
     * Convert provider cost directly to Points (for profit calculation).
     * Alias used by purchase route to compute: profit = sellPoints - providerCostPoints
     *
     * @param rawCost          Provider's cost in their native currency
     * @param providerCurrency Provider's billing currency
     * @param effectiveRate    Admin-set rate (providerCurrency per 1 USD). Defaults to DB rate.
     */
    async providerCostToPoints(
        rawCost: number,
        providerCurrency: string,
        effectiveRate?: number
    ): Promise<number> {
        const [config, rates] = await Promise.all([this.getConfig(), this.getRates()])

        // Guaranteed number — TypeScript narrowing via const
        const rate: number = effectiveRate && effectiveRate > 0
            ? effectiveRate
            : (providerCurrency === 'USD' ? 1 : ((rates as any)[providerCurrency] as number | undefined) ?? 1)

        return new Decimal(rawCost)
            .dividedBy(rate)
            .times(config.pointsRate)
            .ceil()
            .toNumber()
    }



    /**
     * Convert Points to a single fiat currency.
     * Formula: (points / pointsRate) × fiatRate, 2dp HALF_UP.
     */
    async pointsToFiat(points: number, targetCurrency: SupportedCurrency): Promise<number> {
        const [config, rates] = await Promise.all([this.getConfig(), this.getRates()])

        const usdAmount = new Decimal(points).dividedBy(config.pointsRate)
        if (targetCurrency === 'USD') return toActualDecimal(usdAmount)

        const rate = rates[targetCurrency] || 1
        return toActualDecimal(usdAmount.times(rate))
    }

    /**
     * Convert Points to ALL supported fiat currencies at once.
     * This is the core Zero-Math method: used for search index pricing, balance display, etc.
     * The result is saved as `currencyPrices` in MeiliSearch or sent as the balance map.
     * Frontend ONLY renders this — no conversion on the client.
     */
    async pointsToAllFiat(points: number): Promise<MultiCurrencyPrice> {
        const [config, rates] = await Promise.all([this.getConfig(), this.getRates()])

        const usdAmount = new Decimal(points).dividedBy(config.pointsRate)

        return {
            points,
            USD: toActualDecimal(usdAmount),
            INR: toActualDecimal(usdAmount.times(rates.INR)),
            RUB: toActualDecimal(usdAmount.times(rates.RUB)),
            EUR: toActualDecimal(usdAmount.times(rates.EUR)),
            GBP: toActualDecimal(usdAmount.times(rates.GBP)),
            CNY: toActualDecimal(usdAmount.times(rates.CNY)),
        }
    }

    /**
     * Capture an immutable currency snapshot at the current moment.
     *
     * This is the Golden Rule method. Call this at every financial event:
     * deposit, purchase, refund, reserve, commit, rollback.
     * Save the result to `WalletTransaction.currencySnapshot`.
     * NEVER recalculate historical data from this snapshot.
     *
     * @param points       Exact point amount of the event
     * @param userCurrency User's preferred display currency at the time
     */
    async captureSnapshot(points: number, userCurrency: string = 'USD'): Promise<CurrencySnapshot> {
        const [config, rates] = await Promise.all([this.getConfig(), this.getRates()])

        const safeCurrency = toSupportedCurrency(userCurrency)
        const usdAmount = new Decimal(points).dividedBy(config.pointsRate)
        const rate = rates[safeCurrency] || 1
        const fiatEquivalent = toActualDecimal(usdAmount.times(rate))

        const { updatedAt, ...flatRates } = rates

        return {
            points,
            rates: flatRates,
            userCurrency: safeCurrency,
            fiatEquivalent,
            pointsRate: config.pointsRate,
            inrToUsdRate: config.inrToUsdRate,
            capturedAt: new Date().toISOString(),
        }
    }

    /**
     * Generic fiat-to-fiat conversion via USD as intermediate.
     * Rarely needed — prefer Points-based methods.
     */
    async convert(amount: number, from: string, to: string): Promise<number> {
        if (from === to) return amount
        if (amount === 0) return 0

        const rates = await this.getAllRates()
        const fromRate = rates[from] || 1
        const toRate = rates[to] || 1

        return new Decimal(amount).dividedBy(fromRate).times(toRate).toNumber()
    }
}

/**
 * Utility to format decimal values for storage/indexing.
 * Rounds UP (ceil) to exactly 3 decimal places to ensure the platform
 * makes a micro-profit (markup) rather than a loss on exchange discrepancies.
 * e.g. 1.1850009 -> 1.186
 */
function toActualDecimal(value: Decimal): number {
    return value.toDecimalPlaces(3, Decimal.ROUND_UP).toNumber()
}

// ============================================================================
// Singleton Factory
// ============================================================================

/** Returns the shared CurrencyService singleton. Use this everywhere. */
export const getCurrencyService = () => CurrencyService.getInstance()
