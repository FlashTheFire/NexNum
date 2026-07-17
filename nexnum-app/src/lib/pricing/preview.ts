/**
 * Shared live-pricing preview.
 *
 * Used by:
 *   - admin/providers/page.tsx (Live Pricing Preview card)
 *   - ProviderWizard.tsx       (Step 4 "Live Simulation" card)
 *
 * Renders the EXACT same numbers as the production PricingService so admins
 * see what the user will see. Synchronous, dependency-free, browser-safe.
 */

import { resolveRate, type PricingProviderConfig, type StandardRates } from './pricing-service'

export interface PreviewFormData {
    currency?: string
    priceMultiplier?: string | number
    fixedMarkup?: string | number
    normalizationMode?: string
    normalizationRate?: string | number
    depositSpent?: string | number
    depositReceived?: string | number
    depositCurrency?: string
}

export interface PricingPreview {
    /** Sample provider amount used for the demo (1.00 for strong currencies, 100 for weak). */
    sampleProviderAmount: number
    sampleProviderCurrency: string
    /** Rate used to normalize the sample amount (units of providerCurrency per 1 USD). */
    rateUsed: number
    rateSource: string
    /** Cost in USD after normalization. */
    costUsd: number
    /** Price the user pays (USD). */
    userPriceUsd: number
    /** Profit in USD. */
    profitUsd: number
    /** Margin percentage. */
    marginPct: number
    /** String representations, useful for display. */
    userPriceUsdStr: string
    profitUsdStr: string
    costUsdStr: string
    marginPctStr: string
}

const WEAK_CURRENCIES = ['RUB', 'INR', 'JPY', 'KZT', 'VND', 'IDR', 'PKR', 'BDT']

const toNum = (v: unknown, fallback = 0): number => {
    if (v === null || v === undefined || v === '') return fallback
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
}

const round = (n: number, dp: number): number => {
    const m = Math.pow(10, dp)
    return Math.round((n + Number.EPSILON) * m) / m
}

/**
 * Compute the live preview for a provider form.
 *
 * @param formData  Current admin/wizard form state
 * @param rates     Standard rates keyed by ISO code (e.g. { USD: 1, INR: 96.28 })
 * @param baseAmount  Optional override for the sample provider amount
 */
export function previewPricing(
    formData: PreviewFormData,
    rates: StandardRates,
    baseAmount?: number
): PricingPreview {
    const pCurrencyCode = (formData.currency || 'USD').toUpperCase()
    const sampleProviderAmount = baseAmount ?? (
        WEAK_CURRENCIES.includes(pCurrencyCode) ? 100.00 : 1.00
    )

    // Build a config object the resolver understands
    const providerCfg: PricingProviderConfig = {
        currency: pCurrencyCode,
        normalizationMode: formData.normalizationMode || 'AUTO',
        normalizationRate: toNum(formData.normalizationRate, 0),
        depositSpent: toNum(formData.depositSpent, 0),
        depositReceived: toNum(formData.depositReceived, 0),
        depositCurrency: (formData.depositCurrency || 'USD').toUpperCase(),
        priceMultiplier: toNum(formData.priceMultiplier, 1),
        fixedMarkup: toNum(formData.fixedMarkup, 0),
    }

    const { rate, source } = resolveRate(
        providerCfg,
        rates,
        pCurrencyCode,
        providerCfg.depositCurrency ?? 'USD'
    )
    const safeRate = rate > 0 ? rate : 1
    const costUsd = sampleProviderAmount / safeRate
    const multiplier = Math.max(1, toNum(formData.priceMultiplier, 1))
    const fixed = toNum(formData.fixedMarkup, 0)
    const userPrice = (costUsd * multiplier) + fixed
    const profit = userPrice - costUsd
    const margin = userPrice > 0 ? (profit / userPrice) * 100 : 0

    return {
        sampleProviderAmount,
        sampleProviderCurrency: pCurrencyCode,
        rateUsed: round(safeRate, 4),
        rateSource: source,
        costUsd: round(costUsd, 4),
        userPriceUsd: round(userPrice, 4),
        profitUsd: round(profit, 4),
        marginPct: round(margin, 2),
        userPriceUsdStr: userPrice.toFixed(2),
        profitUsdStr: profit.toFixed(2),
        costUsdStr: costUsd.toFixed(4),
        marginPctStr: margin.toFixed(1),
    }
}
