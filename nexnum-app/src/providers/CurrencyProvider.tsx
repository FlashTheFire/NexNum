
"use client"

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { api } from '@/lib/api/api-client'

// ============================================
// TYPES
// ============================================

interface Currency {
    code: string
    name: string
    symbol: string
    rate: number
}

interface SystemSettings {
    baseCurrency: string
    displayCurrency: string
    pointsRate: number | string
    pointsEnabled: boolean
    pointsName: string
}

interface CurrencyContextType {
    currencies: Record<string, Currency>
    settings: SystemSettings | null
    preferredCurrency: string
    isLoading: boolean
    pointsEnabled: boolean
    pointsName: string

    // Core methods
    setCurrency: (code: string) => void

    // ZERO CLIENT-SIDE CALCULATION METHODS
    /**
     * Format a value (number or multi-currency object) to the user's preferred currency.
     * @param amount - A number (legacy/fallback) or a Record of currency codes to values.
     */
    formatPrice: (amount?: number | Record<string, number>) => string

    /** 
     * Format a multi-currency price object to the user's preferred currency.
     * @param prices - Map of currency codes to values (e.g. { USD: 1.50, INR: 120.00 })
     */
    formatFromPrices: (prices?: Record<string, number>) => string

    /**
     * Format a multi-currency balance object.
     * @param balance - The multi-currency balance object from user profile
     */
    formatFromBalance: (balance: { points: number;[key: string]: number }) => string
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

// ============================================
// PROVIDER COMPONENT
// ============================================

const DEFAULT_CURRENCIES: Record<string, Currency> = {
    'USD': { code: 'USD', name: 'US Dollar', symbol: '$', rate: 1 },
    'INR': { code: 'INR', name: 'Indian Rupee', symbol: '₹', rate: 83 },
    'RUB': { code: 'RUB', name: 'Russian Ruble', symbol: '₽', rate: 92 },
    'EUR': { code: 'EUR', name: 'Euro', symbol: '€', rate: 0.92 },
    'GBP': { code: 'GBP', name: 'British Pound', symbol: '£', rate: 0.79 },
    'CNY': { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', rate: 7.25 }
}

const DEFAULT_SETTINGS: SystemSettings = {
    baseCurrency: 'USD',
    displayCurrency: 'USD',
    pointsRate: 100,
    pointsEnabled: false,
    pointsName: 'Points'
}

/**
 * Utility to format positive decimal values.
 * Shows up to 3 decimal places as per the global platform markup rule,
 * while maintaining a minimum of 2 decimal places for clean UI.
 */
function formatActualDecimal(value: number): string {
    if (value <= 0) return "0.00";
    
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 3,
        useGrouping: true
    }).format(value);
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
    const [currencies, setCurrencies] = useState<Record<string, Currency>>(DEFAULT_CURRENCIES)
    const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS)
    const [preferredCurrency, setPreferredCurrency] = useState(() => {
        if (typeof window !== 'undefined') {
            const match = document.cookie.match(new RegExp('(^| )nexnum-currency=([^;]+)'));
            if (match) return match[2];
        }
        return 'USD';
    });
    const [isLoading, setIsLoading] = useState(true)

    // Offline-first predefined configuration: No API request needed, preventing errors and forcing currency mode
    useEffect(() => {
        setCurrencies(DEFAULT_CURRENCIES)
        setSettings(DEFAULT_SETTINGS)
        setIsLoading(false)
        console.log('[CurrencyProvider] Offline-first Predefined Engine Loaded. Using static defaults.')
    }, [])

    // ============================================
    // FORMATTING METHODS (ZERO MATH & PREDEFINED OFFLINE FALLBACKS)
    // ============================================

    /**
     * Format using pre-computed currency prices.
     * Computes conversion dynamically using predefined rates if specific currency is missing.
     */
    const formatFromPrices = useCallback((prices?: Record<string, number>): string => {
        if (!prices) return '--'

        const targetCurrency = (!preferredCurrency || preferredCurrency === 'POINTS') ? 'USD' : preferredCurrency
        const currencyData = currencies?.[targetCurrency] || DEFAULT_CURRENCIES[targetCurrency]
        const symbol = currencyData?.symbol || '$'
        const rate = currencyData?.rate || 1

        if (targetCurrency in prices) {
            const val = prices[targetCurrency]
            return `${symbol}${formatActualDecimal(val)}`
        }

        // Fallback: Dynamic offline calculation if the specific currency is missing from prices
        if ('USD' in prices) {
            const usdVal = prices['USD']
            const converted = usdVal * rate
            return `${symbol}${formatActualDecimal(converted)}`
        }

        // Search for any other currency to base calculation off of
        for (const [code, val] of Object.entries(prices)) {
            if (code !== 'points' && typeof val === 'number') {
                const sourceCurrencyData = currencies?.[code] || DEFAULT_CURRENCIES[code]
                const sourceRate = sourceCurrencyData?.rate || 1
                const converted = (val / sourceRate) * rate
                return `${symbol}${formatActualDecimal(converted)}`
            }
        }

        return '--'
    }, [preferredCurrency, currencies, settings])

    /**
     * Robust formatting that handles both legacy numbers and multi-currency objects.
     */
    const formatPrice = useCallback((amount?: number | Record<string, number>): string => {
        if (amount === undefined || amount === null) return '--'

        if (typeof amount === 'number') {
            const targetCurrency = (!preferredCurrency || preferredCurrency === 'POINTS') ? 'USD' : preferredCurrency
            const currencyData = currencies?.[targetCurrency] || DEFAULT_CURRENCIES[targetCurrency]
            const symbol = currencyData?.symbol || '$'
            const rate = currencyData?.rate || 1

            // If points system is active, legacy numbers represent points, so we divide by pointsRate
            let usdVal = amount
            if (settings?.pointsEnabled) {
                const pointsRate = Number(settings?.pointsRate) || 100
                usdVal = amount / pointsRate
            }

            const converted = usdVal * rate
            return `${symbol}${formatActualDecimal(converted)}`
        }

        return formatFromPrices(amount)
    }, [preferredCurrency, currencies, settings, formatFromPrices])

    /**
     * Format user balance from pre-computed multi-currency balance object.
     * Computes conversion dynamically using predefined rates if specific currency is missing.
     */
    const formatFromBalance = useCallback((balance: any): string => {
        if (!balance) return '$0.00'

        const targetCurrencyCode = preferredCurrency || 'USD'
        const safeCurrencyCode = targetCurrencyCode === 'POINTS' ? 'USD' : targetCurrencyCode
        const currencyData = currencies?.[safeCurrencyCode] || DEFAULT_CURRENCIES[safeCurrencyCode]
        const symbol = currencyData?.symbol || '$'

        if (typeof balance === 'object') {
            let value = balance[safeCurrencyCode]

            // If the target currency value is missing in balance, dynamically compute it!
            if (value === undefined) {
                const rate = currencyData?.rate || 1

                if (balance.USD !== undefined) {
                    value = balance.USD * rate
                }
            }

            if (value !== undefined) {
                return `${symbol}${formatActualDecimal(value)}`
            }
        } else if (typeof balance === 'number') {
            const rate = currencyData?.rate || 1
            let usdVal = balance
            if (settings?.pointsEnabled) {
                const pointsRate = Number(settings?.pointsRate) || 100
                usdVal = balance / pointsRate
            }
            const value = usdVal * rate
            return `${symbol}${formatActualDecimal(value)}`
        }

        // Ultimate fallback
        if (balance && typeof balance === 'object' && balance.USD !== undefined) {
            const usdCurrencyData = currencies?.['USD'] || DEFAULT_CURRENCIES['USD']
            const usdSymbol = usdCurrencyData?.symbol || '$'
            return `${usdSymbol}${formatActualDecimal(balance.USD)}`
        }

        return '$0.00'
    }, [preferredCurrency, currencies, settings])

    // ============================================
    // CURRENCY SELECTION
    // ============================================

    const setCurrency = useCallback((code: string) => {
        if (code === 'POINTS' || code === 'points' || !currencies[code]) {
            console.warn(`[CurrencyProvider] Invalid or restricted currency: ${code}`)
            return
        }

        setPreferredCurrency(code)
        document.cookie = `nexnum-currency=${code}; path=/; max-age=31536000; SameSite=Lax`

        api.request('/api/auth/me', 'PATCH', { preferredCurrency: code }).catch(() => { })
    }, [currencies])

    return (
        <CurrencyContext.Provider value={{
            currencies,
            settings,
            preferredCurrency,
            isLoading,
            pointsEnabled: settings?.pointsEnabled || false,
            pointsName: settings?.pointsName || 'Points',
            setCurrency,
            formatPrice,
            formatFromPrices,
            formatFromBalance
        }}>
            {children}
        </CurrencyContext.Provider>
    )
}

export const useCurrency = () => {
    const context = useContext(CurrencyContext)
    if (context === undefined) {
        throw new Error('useCurrency must be used within a CurrencyProvider')
    }
    return context
}
