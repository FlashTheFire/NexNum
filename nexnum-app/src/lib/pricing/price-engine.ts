
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { logger } from '@/lib/core/logger'

/**
 * Price Configuration Schema
 * Enforces business rules at the configuration level.
 */
export const PriceConfigSchema = z.object({
    multiplier: z.number().min(1, "Multiplier must be at least 1.0"),
    fixedMarkup: z.number().min(0, "Fixed markup cannot be negative"), // In USD
    rateVolatilitySpread: z.number().min(0).max(0.1).default(0.005), // 0.5% default safety spread
})

export type PriceConfig = z.infer<typeof PriceConfigSchema>

export interface CurrencySettings {
    providerToUsdRate: number; // Rate to convert provider currency to USD
    usdToDisplayRate: number;  // Rate to convert USD to display currency (Points)
    isPointsEnabled: boolean;
}

export interface CalculationAudit {
    rawCost: string;
    costUsd: string;
    sellUsd: string;
    displayFinal: string;
    multiplier: number;
    markup: number;
    spreadApplied: number;
}

/**
 * NexNum Centralized Price Engine (Industrial Grade)
 * 
 * Uses high-precision Decimal math to prevent floating-point margin leaks.
 * All calculations are performed with 'Decimal' and coerced to numbers only at the edge.
 */
export class PriceEngine {
    /**
     * INGESTION: Forward Calculation (Raw -> Marketplace)
     * Transforms raw provider cost into local marketplace price.
     */
    static calculateSellPrice(
        rawPrice: number,
        config: PriceConfig,
        settings: CurrencySettings
    ): { price: number; audit: CalculationAudit } {
        const conf = PriceConfigSchema.parse(config);

        // 1. Convert to Decimal for precision
        const dRaw = new Prisma.Decimal(rawPrice);
        const dProvToUsd = new Prisma.Decimal(settings.providerToUsdRate);
        const dUsdToDisp = new Prisma.Decimal(settings.usdToDisplayRate);
        const dMult = new Prisma.Decimal(conf.multiplier);
        const dMarkup = new Prisma.Decimal(conf.fixedMarkup);
        const dSpread = new Prisma.Decimal(1).add(conf.rateVolatilitySpread); // Safety spread against rate volatility

        // 2. Normalize to USD (Cost with volatility buffer)
        // We divide by providerToUsd - but we multiply by spread to ensure we don't under-calculate cost
        const costUsd = dRaw.div(dProvToUsd).mul(dSpread);

        // 3. Apply Margin Logic
        const sellUsd = costUsd.mul(dMult).add(dMarkup);

        // 4. Convert to Display Currency
        const sellPriceDisplay = sellUsd.mul(dUsdToDisp);

        // 5. Professional Rounding Strategy
        let finalPrice: number;
        if (settings.isPointsEnabled) {
            // Always CEIL for coins/points to protect against sub-unit loss
            finalPrice = sellPriceDisplay.ceil().toNumber();
        } else {
            // Standard 2-decimal rounding for FIAT
            finalPrice = sellPriceDisplay.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
        }

        const audit: CalculationAudit = {
            rawCost: dRaw.toString(),
            costUsd: costUsd.toDecimalPlaces(6).toString(),
            sellUsd: sellUsd.toDecimalPlaces(6).toString(),
            displayFinal: sellPriceDisplay.toString(),
            multiplier: conf.multiplier,
            markup: conf.fixedMarkup,
            spreadApplied: conf.rateVolatilitySpread
        };

        return { price: finalPrice, audit };
    }

    /**
     * MARGIN PROTECTION: Reverse Calculation (Sold -> Max Safe Cost)
     * Determines the highest cost we can afford for a specific purchase.
     */
    static calculateSafeRawMaxPrice(
        sellPrice: number,
        config: PriceConfig,
        settings: CurrencySettings
    ): number {
        const conf = PriceConfigSchema.parse(config);

        const dSell = new Prisma.Decimal(sellPrice);
        const dUsdToDisp = new Prisma.Decimal(settings.usdToDisplayRate);
        const dMult = new Prisma.Decimal(conf.multiplier);
        const dMarkup = new Prisma.Decimal(conf.fixedMarkup);
        const dProvToUsd = new Prisma.Decimal(settings.providerToUsdRate);

        // Success Buffer (0.1%) to account for micro-jitter
        const dBuffer = new Prisma.Decimal(0.999);

        // 1. Sell Display -> Sell USD
        const sellUsd = dSell.div(dUsdToDisp);

        // 2. Reverse Markup: (SellUsd - Markup) / Multiplier
        const safeCostUsd = sellUsd.minus(dMarkup).div(dMult).mul(dBuffer);

        // 3. USD -> Provider Raw
        const safeRawPrice = safeCostUsd.mul(dProvToUsd);

        // 4. Round DOWN to be conservative (protect the margin)
        return safeRawPrice.toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN).toNumber();
    }
}
