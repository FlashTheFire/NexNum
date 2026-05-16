/**
 * Pricing Utils
 *
 * Thin wrapper around CurrencyService for legacy callers.
 * New code should call getCurrencyService() directly.
 *
 * ZERO-MATH STANDARD: all multi-currency maps are generated server-side
 * using pointsToAllFiat(); no client-side arithmetic is performed.
 */
import { getCurrencyService, MultiCurrencyPrice, ExchangeRates } from "@/lib/currency/currency-service";

/**
 * Legacy interface for raw pricing data.
 * Prefer getCurrencyService().getConfig() and getAllRates() directly.
 */
export interface PricingData {
    rates: Record<string, number>;
    pointsRate: number;
}

/**
 * Calculate multi-currency prices for a given point price.
 * Wrapper around CurrencyService.pointsToAllFiat — single source of truth.
 */
export async function calculatePrices(pointPrice: number): Promise<MultiCurrencyPrice> {
    return getCurrencyService().pointsToAllFiat(pointPrice);
}

/**
 * Legacy support: fetch raw pricing data if absolutely needed.
 * Prefer getCurrencyService().getSettings() and getAllRates() directly.
 *
 * NOTE: getRates() returns ExchangeRates (with named fields USD, INR, etc.)
 * which is destructured here into a flat Record for legacy callers.
 */
export async function getPricingData(): Promise<PricingData> {
    const currencyService = getCurrencyService();
    const [rates, settings] = await Promise.all([
        currencyService.getRates(),
        currencyService.getConfig()
    ]);

    // ExchangeRates has named fields — spread into flat Record for callers expecting Record<string,number>
    const { updatedAt, ...rateFields } = rates as ExchangeRates & { updatedAt: unknown };
    const ratesMap: Record<string, number> = rateFields as Record<string, number>;

    return {
        rates: ratesMap,
        pointsRate: settings.pointsRate
    };
}
