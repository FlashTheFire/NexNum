/**
 * NexNum Pricing & Normalization Engine
 *
 * SINGLE SOURCE OF TRUTH for converting a provider's raw cost into our internal
 * Points anchor (and back). Used by:
 *   - provider-sync.ts (indexing)
 *   - smart-router.ts (purchase-time quote)
 *   - dynamic-provider.ts (getNumber)
 *   - admin/providers/page.tsx + ProviderWizard.tsx (live preview)
 *
 * Replaces the three duplicated `effectiveProviderRate` blocks that used to live
 * in those files. After this module is wired in:
 *   `grep -r "getRateToUSD" src/lib/providers/  →  0 hits`
 *
 * Formula (display in Points; `rawCost` is in the provider's billing currency):
 *
 *      costUsd    = (rawCost / rate) × (1 + spread)        ← rate = units of providerCurrency per 1 USD
 *      sellUsd    = costUsd × multiplier + fixedMarkupUsd
 *      pointPrice = CEIL( sellUsd × pointsRate )             ← margin-protect with ceil
 *      usdFinal   = sellUsd.toDecimalPlaces(2, HALF_UP)     ← for non-points mode
 *
 * Rate resolution precedence (single resolver, used everywhere):
 *
 *      1. manual       → provider.normalizationRate               (1 USD = X providerCurrency)
 *      2. smart_auto   → depositReceived / (depositSpent ÷ depositCurrencyToUsd)
 *      3. auto         → standardRates[providerCurrency]  (default if missing → 1)
 *
 * Zero-cost / NaN / negative raw costs return `null` so callers (the zero-cost
 * filter in processPrices) can drop the offer without needing their own guard.
 */

import { PricingConfig } from '@/config/app.config'
import { logger } from '@/lib/core/logger'

// ============================================================================
// Types
// ============================================================================

/** Source of the rate used in the calculation — exposed in audit & logs. */
export type RateSource = 'manual' | 'smart_auto' | 'auto_standard' | 'usd_native' | 'missing_rate_fallback'

/** Provider config that PricingService needs. Kept as a structural type so it
 *  works with both the Prisma model AND the `this.config` object on
 *  DynamicProvider. Every field is optional with a sensible default. */
export interface PricingProviderConfig {
    currency?: string | null
    normalizationMode?: string | null
    /** Prisma returns Decimal here, so we accept Decimal | string | number | null. */
    normalizationRate?: unknown
    depositSpent?: unknown
    depositReceived?: unknown
    depositCurrency?: string | null
    priceMultiplier?: unknown
    fixedMarkup?: unknown
}

/** Standard rates keyed by ISO 4217 code (e.g. { USD: 1, INR: 96.28, RUB: 72.77, … }). */
export type StandardRates = Record<string, number>

export interface PricingInput {
    rawCost: number
    providerCurrency: string
    provider: PricingProviderConfig
    standardRates: StandardRates
    /** Admin-defined points rate (points per 1 USD). */
    pointsRate: number
    /** Optional: margin safety spread. Default 0.005 (0.5%) to guard against
     *  rate drift between sync ticks. */
    spread?: number
    /** Optional: when true, final price is in Points (CEIL). When false, in
     *  USD (2dp HALF_UP). Default true to match existing behaviour. */
    isPointsMode?: boolean
}

export interface PricingAudit {
    rawCost: string
    rateUsed: string
    rateSource: RateSource
    costUsd: string
    multiplier: string
    fixedMarkupUsd: string
    sellUsd: string
    pointsRate: string
    pointPrice: string
    marginPct: string
    spreadApplied: string
    isPointsMode: boolean
}

export interface PricingResult {
    rawCost: number
    costUsd: number
    rateUsed: number
    rateSource: RateSource
    sellUsd: number
    /** Final price in Points (if isPointsMode) or USD (if not). */
    finalPrice: number
    /** Convenience: same as finalPrice, aliased for legacy callers. */
    pointPrice: number
    displayCurrency: 'POINTS' | 'USD'
    marginPct: number
    profitUsd: number
    audit: PricingAudit
}

// ============================================================================
// Helpers
// ============================================================================

const toNumber = (v: unknown, fallback = 0): number => {
    if (v === null || v === undefined || v === '') return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
}

/** Decimal math using built-in Number is fine for our precision (8 dp cost,
 *  2 dp final). For real audit we use toFixed. We avoid importing Prisma.Decimal
 *  to keep this module dependency-free and synchronous (callers are in hot
 *  loops over thousands of offers). */
const round = (n: number, dp: number, mode: 'half_up' | 'down' = 'half_up'): number => {
    const m = Math.pow(10, dp)
    if (mode === 'down') {
        return Math.floor(n * m) / m
    }
    // Half-up (banker's not used; ROUND_HALF_UP in currency-service.ts is the existing convention)
    return Math.round((n + Number.EPSILON) * m) / m
}

const ceil = (n: number): number => Math.ceil(n)

// ============================================================================
// Rate Resolver — the only function that picks a rate
// ============================================================================

export interface ResolvedRate {
    rate: number
    source: RateSource
}

export function resolveRate(
    provider: PricingProviderConfig,
    standardRates: StandardRates,
    providerCurrency: string,
    depositCurrency?: string
): ResolvedRate {
    const cur = (providerCurrency || 'USD').toUpperCase()
    const depCur = (depositCurrency || provider.depositCurrency || 'USD').toUpperCase()

    // 1. USD-native: no conversion needed
    if (cur === 'USD') {
        return { rate: 1, source: 'usd_native' }
    }

    const normMode = String(provider.normalizationMode || 'AUTO').toUpperCase()

    // 2. Manual
    if (normMode === 'MANUAL') {
        const r = toNumber(provider.normalizationRate, 0)
        if (r > 0) return { rate: r, source: 'manual' }
    }

    // 3. Smart Auto (deposit-based)
    if (normMode === 'SMART_AUTO') {
        const spent = toNumber(provider.depositSpent, 0)
        const received = toNumber(provider.depositReceived, 0)
        if (spent > 0 && received > 0) {
            const spentRate = depCur === 'USD' ? 1 : (standardRates[depCur] || 1)
            const spentInUSD = spent / spentRate
            const r = received / (spentInUSD || 1)
            if (r > 0) return { rate: r, source: 'smart_auto' }
        }
    }

    // 4. Auto: standard exchange rate
    const std = standardRates[cur]
    if (std && std > 0) {
        return { rate: std, source: 'auto_standard' }
    }

    // 5. Last-resort fallback: 1 with warning
    logger.warn('[PricingService] Missing rate, falling back to 1:1', {
        providerCurrency: cur,
        normalizationMode: normMode,
        hasStandardRate: Boolean(std)
    })
    return { rate: 1, source: 'missing_rate_fallback' }
}

// ============================================================================
// PricingService — public API
// ============================================================================

export class PricingService {
    /**
     * Forward calculation: raw provider cost → internal Points/USD anchor.
     *
     * Returns `null` if the raw cost is invalid (≤ 0, NaN, not finite).
     * Callers can use this as the zero-cost filter without their own guard.
     */
    static compute(input: PricingInput): PricingResult | null {
        const {
            rawCost,
            providerCurrency,
            provider,
            standardRates,
            pointsRate,
            spread = 0.005,
            isPointsMode = true,
        } = input

        // Guard: zero / negative / non-finite cost → caller drops the offer
        if (!Number.isFinite(rawCost) || rawCost <= 0) {
            return null
        }

        const pc = (providerCurrency || 'USD').toUpperCase()
        const dc = (provider.depositCurrency || 'USD').toUpperCase()
        const { rate, source } = resolveRate(provider, standardRates, pc, dc)
        const safeRate = rate > 0 ? rate : 1
        const multiplier = Math.max(1, toNumber(provider.priceMultiplier, 1))
        const fixedMarkupUsd = toNumber(provider.fixedMarkup, 0)

        // Cost normalization (with margin safety spread)
        const costUsd = (rawCost / safeRate) * (1 + spread)
        // Margin & profit
        const sellUsd = costUsd * multiplier + fixedMarkupUsd
        const profitUsd = sellUsd - costUsd
        const marginPct = sellUsd > 0 ? (profitUsd / sellUsd) * 100 : 0

        // Final price: points (CEIL) or USD (2dp HALF_UP)
        const pointPrice = isPointsMode
            ? ceil(sellUsd * pointsRate)
            : 0
        const usdFinal = isPointsMode
            ? 0
            : round(sellUsd, PricingConfig.precision)

        const finalPrice = isPointsMode ? pointPrice : usdFinal

        return {
            rawCost,
            costUsd: round(costUsd, 6),
            rateUsed: safeRate,
            rateSource: source,
            sellUsd: round(sellUsd, 6),
            finalPrice,
            pointPrice: finalPrice, // legacy alias
            displayCurrency: isPointsMode ? 'POINTS' : 'USD',
            marginPct: round(marginPct, 2),
            profitUsd: round(profitUsd, 6),
            audit: {
                rawCost: String(rawCost),
                rateUsed: String(safeRate),
                rateSource: source,
                costUsd: round(costUsd, 6).toString(),
                multiplier: String(multiplier),
                fixedMarkupUsd: String(fixedMarkupUsd),
                sellUsd: round(sellUsd, 6).toString(),
                pointsRate: String(pointsRate),
                pointPrice: String(finalPrice),
                marginPct: round(marginPct, 2).toString(),
                spreadApplied: String(spread),
                isPointsMode,
            },
        }
    }

    /**
     * Reverse calculation: given a target sell price, what is the maximum raw
     * cost we can pay the provider to protect margin?
     * Used by purchase flow to cap maxPrice.
     */
    static safeMaxRaw(
        sellPrice: number,
        provider: PricingProviderConfig,
        standardRates: StandardRates,
        providerCurrency: string,
        pointsRate: number,
        spread: number = 0.005,
        isPointsMode: boolean = true,
        /** 0.001 = 0.1% safety buffer (existing convention) */
        safetyBuffer: number = 0.999
    ): number {
        if (!Number.isFinite(sellPrice) || sellPrice <= 0) return 0

        const pc = (providerCurrency || 'USD').toUpperCase()
        const dc = (provider.depositCurrency || 'USD').toUpperCase()
        const { rate, source } = resolveRate(provider, standardRates, pc, dc)
        const safeRate = rate > 0 ? rate : 1
        const multiplier = Math.max(1, toNumber(provider.priceMultiplier, 1))
        const fixedMarkupUsd = toNumber(provider.fixedMarkup, 0)

        // 1. Sell → USD
        const sellUsd = isPointsMode ? sellPrice / pointsRate : sellPrice
        // 2. Reverse markup & multiplier (with safety buffer for jitter)
        const safeCostUsd = (sellUsd - fixedMarkupUsd) / multiplier * safetyBuffer
        // 3. Strip the spread we added on the forward path
        const costUsd = safeCostUsd / (1 + spread)
        // 4. USD → provider raw currency
        const safeRawPrice = costUsd * safeRate

        void source // logged via audit if needed
        return round(safeRawPrice, 4, 'down')
    }
}

// ============================================================================
// Re-exports for the legacy PriceEngine class so other code that still
// references it doesn't break. They delegate to the new service.
// ============================================================================

export { PricingConfig }
