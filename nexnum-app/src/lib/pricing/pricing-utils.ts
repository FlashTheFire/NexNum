import { getCurrencyService, MultiCurrencyPrice } from "@/lib/payment/currency-service";

/**
 * Interface for legacy compatibility if needed, 
 * but new code should favor CurrencyService directly.
 */
export interface PricingData {
    rates: Record<string, number>;
    pointsRate: number;
}

/**
 * Calculate multi-currency prices based on point price.
 * 
 * This is now a wrapper around CurrencyService.pointsToAllFiat
 * to ensure absolute consistency across the entire application.
 * 
 * FOLLOWS ZERO-MATH STANDARD.
 */
export async function calculatePrices(pointPrice: number): Promise<MultiCurrencyPrice> {
    const currencyService = getCurrencyService();
    return currencyService.pointsToAllFiat(pointPrice);
}

/**
 * Legacy support for fetching raw pricing data if absolutely necessary,
 * but getCurrencyService().getSettings() and getAllRates() are preferred.
 */
export async function getPricingData(): Promise<PricingData> {
    const currencyService = getCurrencyService();
    const [rates, settings] = await Promise.all([
        currencyService.getRates(),
        currencyService.getConfig()
    ]);

    const ratesMap: Record<string, number> = {
        USD: rates.USD,
        INR: rates.INR,
        RUB: rates.RUB,
        EUR: rates.EUR,
        GBP: rates.GBP,
        CNY: rates.CNY
    };

    return {
        rates: ratesMap,
        pointsRate: settings.pointsRate
    };
}
