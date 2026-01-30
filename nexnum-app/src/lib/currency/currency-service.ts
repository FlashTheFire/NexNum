
import { prisma } from '../core/db'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/core/logger'

export interface CurrencyInfo {
    code: string
    name: string
    symbol: string
    rate: number
    isBase: boolean
}

export class CurrencyService {
    private static instance: CurrencyService
    private ratesCache: Map<string, number> = new Map()
    private lastUpdate: number = 0
    private CACHE_TTL = 10 * 60 * 1000 // 10 minutes

    private constructor() { }

    public static getInstance(): CurrencyService {
        if (!CurrencyService.instance) {
            CurrencyService.instance = new CurrencyService()
        }
        return CurrencyService.instance
    }

    /**
     * Convert an amount between two currencies
     * @param amount The amount to convert
     * @param from Source currency code (e.g., 'RUB')
     * @param to Target currency code (e.g., 'USD' or 'POINTS')
     */
    async convert(amount: number | Prisma.Decimal, from: string, to: string): Promise<number> {
        const val = typeof amount === 'number' ? amount : amount.toNumber()
        if (from === to) return val

        await this.ensureRates()

        const settings = await this.getSettings()

        // Internal logic:
        // All rates in DB are relative to 'Technical Base' (usually USD)
        // Rate = Amount of [Currency] per 1 USD
        // Seed script set USD rate: 1.0, INR rate: 83.0. 
        // This means 1 USD = 83 INR.

        let amountInUSD = 0

        // 1. Convert source to USD
        if (from === 'USD') {
            amountInUSD = val
        } else if (from === 'POINTS' || from === settings.pointsName.toUpperCase()) {
            amountInUSD = val / Number(settings.pointsRate)
        } else {
            const fromRate = this.ratesCache.get(from.toUpperCase()) || 1
            amountInUSD = val / fromRate
        }

        // 2. Convert USD to target
        if (to === 'USD') {
            return amountInUSD
        }

        if (to === 'POINTS' || to === settings.pointsName.toUpperCase()) {
            return amountInUSD * Number(settings.pointsRate)
        }

        const toRate = this.ratesCache.get(to.toUpperCase()) || 1
        return amountInUSD * toRate
    }

    /**
     * Convert a price from a specific provider's currency to the system's internal Points
     * taking into account provider-specific normalization rules (Manual, Smart-Auto, etc.)
     * @param amount The raw price from the provider
     * @param providerName The internal slug of the provider
     */
    async normalizeProviderPrice(amount: number | Prisma.Decimal, providerName: string): Promise<number> {
        const val = typeof amount === 'number' ? amount : amount.toNumber()

        // 1. Fetch provider settings
        const provider = await prisma.provider.findUnique({
            where: { name: providerName },
            select: {
                currency: true,
                normalizationMode: true,
                normalizationRate: true,
                depositSpent: true,
                depositReceived: true,
                depositCurrency: true
            } as any
        })

        if (!provider) return this.convert(val, 'USD', 'POINTS') // Safety fallback

        const settings = await this.getSettings()
        const p = provider as any
        const fromCurrency = String(p.currency || 'USD').toUpperCase()

        // 2. Determine Effective Rate (Provider Units per 1 USD)
        let effectiveRate = 1.0

        switch (String(p.normalizationMode || 'AUTO')) {
            case 'MANUAL':
                effectiveRate = Number(p.normalizationRate || 1.0)
                break

            case 'SMART_AUTO':
                if (p.depositSpent && p.depositReceived && Number(p.depositSpent) > 0) {
                    // 1. Convert "Spent amount" (e.g. 100 EUR) to the system Anchor (USD)
                    const spentCurrency = String(p.depositCurrency || 'USD').toUpperCase()
                    const spentInUSD = await this.convert(p.depositSpent, spentCurrency, 'USD')

                    // 2. Effective Rate = Total Provider Units Received / Total USD equivalent Spent
                    effectiveRate = Number(p.depositReceived) / (spentInUSD || 1.0)
                } else {
                    // Fallback to auto if deposits not filled
                    await this.ensureRates()
                    effectiveRate = this.ratesCache.get(fromCurrency) || 1.0
                }
                break

            case 'API':
                // For now API mode uses standard FX; can be extended for Crypto pairs
                await this.ensureRates()
                effectiveRate = this.ratesCache.get(fromCurrency) || 1.0
                break

            case 'AUTO':
            default:
                await this.ensureRates()
                effectiveRate = this.ratesCache.get(fromCurrency) || 1.0
                break
        }

        // 3. Normalize to USD anchor
        const amountInUSD = val / (effectiveRate || 1.0)

        // 4. Convert USD to Points
        return amountInUSD * Number(settings.pointsRate)
    }

    /**
     * Get all active currencies for the UI selector
     */
    async getActiveCurrencies(): Promise<CurrencyInfo[]> {
        await this.ensureRates();
        // @ts-ignore
        const currencies = await prisma.currency.findMany({
            where: { isActive: true },
            orderBy: { code: 'asc' }
        });

        return currencies.map(c => ({
            code: c.code,
            name: c.name,
            symbol: c.symbol,
            rate: Number(c.rate),
            isBase: c.code === 'USD'
        }));
    }

    /**
     * Get system settings (display currency, points rate etc)
     */
    async getSettings() {
        // @ts-ignore - Prisma linter sync issue
        const settings = await prisma.systemSettings.findUnique({
            where: { id: 'default' }
        })
        return settings || {
            baseCurrency: 'USD',
            displayCurrency: 'USD',
            pointsEnabled: false,
            pointsName: 'Points',
            pointsRate: new Prisma.Decimal(1.0)
        }
    }

    /**
     * Ensure rates are loaded and fresh
     */
    private async ensureRates() {
        const now = Date.now()
        if (this.ratesCache.size > 0 && (now - this.lastUpdate < this.CACHE_TTL)) {
            return
        }

        // @ts-ignore - Prisma linter sync issue
        const currencies = await prisma.currency.findMany({
            where: { isActive: true }
        })

        this.ratesCache.clear()
        for (const cur of currencies) {
            this.ratesCache.set(cur.code.toUpperCase(), Number(cur.rate))
        }
        this.lastUpdate = now
    }

    /**
     * Update exchange rates from external APIs
     */
    async syncRates() {
        try {
            logger.info('Syncing exchange rates from external API...', { context: 'CURRENCY' })
            // Frankfurter API for fiat (relative to EUR by default, but we can use USD)
            const response = await fetch('https://api.frankfurter.app/latest?from=USD')
            if (!response.ok) throw new Error('Failed to fetch fiat rates')

            const data = await response.json()
            const rates = data.rates as Record<string, number>

            for (const [code, rate] of Object.entries(rates)) {
                // @ts-ignore - Prisma linter sync issue
                await prisma.currency.updateMany({
                    where: { code, autoUpdate: true },
                    data: { rate: new Prisma.Decimal(rate) }
                })
            }

            // Clear cache to force reload
            this.ratesCache.clear()
            this.lastUpdate = 0
            logger.info('Exchange rates synced successfully', { context: 'CURRENCY' })
        } catch (e: any) {
            logger.error('Rate sync failed', { context: 'CURRENCY', error: e.message })
        }
    }
}

export const currencyService = CurrencyService.getInstance()
