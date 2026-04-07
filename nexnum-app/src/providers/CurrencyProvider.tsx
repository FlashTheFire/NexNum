
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
}

interface CurrencyContextType {
    currencies: Record<string, Currency>
    settings: SystemSettings | null
    preferredCurrency: string
    isLoading: boolean

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
}

const DEFAULT_SETTINGS: SystemSettings = {
    baseCurrency: 'USD',
    displayCurrency: 'USD',
    pointsRate: 100
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

    // Fetch currency data on mount
    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await api.request<any>('/api/public/currency')
                if (!res.success || !res.data) throw new Error('API Error')
                const data = res.data

                if (data.currencies && Object.keys(data.currencies).length > 0) {
                    setCurrencies(data.currencies)
                }

                if (data.settings) {
                    setSettings(data.settings)
                }

                // SMART PREFERRED CURRENCY LOGIC
                const serverPref = data.preferredCurrency === 'POINTS' ? 'USD' : (data.preferredCurrency || 'USD')
                if (serverPref === 'USD' && preferredCurrency !== 'USD') {
                    // Keep local preference
                } else if (serverPref !== preferredCurrency) {
                    setPreferredCurrency(serverPref)
                }

                console.log('[CurrencyProvider] Zero-Math Engine Loaded.', data.settings ? 'Settings loaded.' : 'Using defaults.')
            } catch (e) {
                console.error("[CurrencyProvider] Failed to load data", e)
            } finally {
                setIsLoading(false)
            }
        }
        fetchData()
    }, [])

    // ============================================
    // FORMATTING METHODS (ZERO MATH)
    // ============================================

    /**
     * Format using pre-computed currency prices.
     * Returns '--' if the specific currency is missing from the prices object.
     */
    const formatFromPrices = useCallback((prices?: Record<string, number>): string => {
        if (!prices) return '--'

        const targetCurrency = (!preferredCurrency || preferredCurrency === 'POINTS') ? 'USD' : preferredCurrency
        const currencyData = currencies?.[targetCurrency]
        const symbol = currencyData?.symbol || '$'

        if (targetCurrency in prices) {
            return `${symbol}${prices[targetCurrency].toFixed(2)}`
        }

        // Fallback to USD if specific currency missing (but USD exists)
        if ('USD' in prices) {
            return `$${prices['USD'].toFixed(2)}`
        }

        return '--'
    }, [preferredCurrency, currencies])

    /**
     * Robust formatting that handles both legacy numbers and multi-currency objects.
     */
    const formatPrice = useCallback((amount?: number | Record<string, number>): string => {
        if (amount === undefined || amount === null) return '--'

        if (typeof amount === 'number') {
            const targetCurrency = (!preferredCurrency || preferredCurrency === 'POINTS') ? 'USD' : preferredCurrency
            const currencyData = currencies?.[targetCurrency]
            const symbol = currencyData?.symbol || '$'
            return `${symbol}${amount.toFixed(2)}`
        }

        return formatFromPrices(amount)
    }, [preferredCurrency, currencies, formatFromPrices])

    /**
     * Format user balance from pre-computed multi-currency balance object.
     */
    const formatFromBalance = useCallback((balance: any): string => {
        if (!balance) return '$0.00'

        const targetCurrencyCode = preferredCurrency || 'USD'
        // Defensive check for "points" currency which shouldn't be selected but just in case
        const safeCurrencyCode = targetCurrencyCode === 'POINTS' ? 'USD' : targetCurrencyCode

        if (typeof balance === 'object' && safeCurrencyCode in balance) {
            const value = balance[safeCurrencyCode]

            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: safeCurrencyCode,
                minimumFractionDigits: 2
            }).format(value)
        }

        // Ultimate fallback if multi-currency data is missing but we have points...
        // We can't convert perfectly without rates, but if we have USD in the object we use that.
        if (balance.USD !== undefined) {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2
            }).format(balance.USD)
        }

        return '$0.00'
    }, [preferredCurrency])

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
