
"use client"

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'

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
}

interface FormatOptions {
    showCode?: boolean
    precision?: number
}

interface CurrencyContextType {
    currencies: Record<string, Currency>
    settings: SystemSettings | null
    preferredCurrency: string
    isLoading: boolean

    // Core methods
    formatPrice: (amountInUsd: number, options?: FormatOptions) => string
    convert: (amount: number, from: string, to: string) => number

    // Multi-currency support (NEW)
    setCurrency: (code: string) => void
    formatFromPrices: (currencyPrices?: Record<string, number>, fallbackUsd?: number) => string
    formatBalance: (balanceInUsd: number) => string
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

// ============================================
// PROVIDER COMPONENT
// ============================================

export function CurrencyProvider({ children }: { children: ReactNode }) {
    const [currencies, setCurrencies] = useState<Record<string, Currency>>({})
    const [settings, setSettings] = useState<SystemSettings | null>(null)
    const [preferredCurrency, setPreferredCurrency] = useState('USD')
    const [isLoading, setIsLoading] = useState(true)

    // Fetch currency data on mount
    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('/api/public/currency')
                const data = await res.json()
                setCurrencies(data.currencies)
                setSettings(data.settings)
                setPreferredCurrency(data.preferredCurrency || 'USD')
            } catch (e) {
                console.error("[CurrencyProvider] Failed to fetch currency data", e)
            } finally {
                setIsLoading(false)
            }
        }
        fetchData()
    }, [])

    // ============================================
    // CURRENCY CONVERSION
    // ============================================

    const convert = useCallback((amount: number, from: string, to: string): number => {
        if (!settings || !currencies) return amount

        // Step 1: Convert "from" to USD (Technical Base)
        let amountInUsd = 0
        if (from === settings.baseCurrency || from === 'USD') {
            amountInUsd = amount
        } else if (currencies[from]) {
            amountInUsd = amount / currencies[from].rate
        } else {
            amountInUsd = amount
        }

        // Step 2: Convert USD to "to"
        if (to === settings.baseCurrency || to === 'USD') {
            return amountInUsd
        } else if (currencies[to]) {
            return amountInUsd * currencies[to].rate
        }

        return amountInUsd
    }, [settings, currencies])

    // ============================================
    // FORMATTING METHODS
    // ============================================

    /**
     * Format amount in USD to user's preferred currency (with real-time conversion)
     */
    const formatPrice = useCallback((amountInUsd: number, options?: FormatOptions): string => {
        if (!settings) return amountInUsd.toString()

        const targetCurrency = preferredCurrency === 'POINTS' ? 'USD' : preferredCurrency
        const precision = options?.precision ?? 2

        const converted = convert(amountInUsd, 'USD', targetCurrency)
        const currencyData = currencies[targetCurrency]
        const symbol = currencyData?.symbol || '$'
        const code = options?.showCode ? ` ${targetCurrency}` : ''

        return `${symbol}${converted.toFixed(precision)}${code}`
    }, [settings, preferredCurrency, currencies, convert])

    /**
     * Format using pre-computed currency prices (preferred) or fallback to conversion
     * This is the PRIMARY method for displaying prices from MeiliSearch offers
     */
    const formatFromPrices = useCallback((
        currencyPrices?: Record<string, number>,
        fallbackUsd?: number
    ): string => {
        const targetCurrency = preferredCurrency === 'POINTS' ? 'USD' : preferredCurrency

        // Priority 1: Use pre-computed price for user's currency
        if (currencyPrices && targetCurrency in currencyPrices) {
            const price = currencyPrices[targetCurrency]
            const currencyData = currencies[targetCurrency]
            const symbol = currencyData?.symbol || '$'
            return `${symbol}${price.toFixed(2)}`
        }

        // Priority 2: Real-time conversion from USD
        if (fallbackUsd !== undefined) {
            return formatPrice(fallbackUsd)
        }

        return '--'
    }, [preferredCurrency, currencies, formatPrice])

    /**
     * Format user balance (always stored in USD) to user's preferred currency
     */
    const formatBalance = useCallback((balanceInUsd: number): string => {
        if (!settings) return balanceInUsd.toString()

        const targetCurrency = preferredCurrency === 'POINTS' ? 'USD' : preferredCurrency

        const converted = convert(balanceInUsd, 'USD', targetCurrency)
        const currencyData = currencies[targetCurrency]
        const symbol = currencyData?.symbol || '$'

        // For balance, show 2 decimal places
        return `${symbol}${converted.toFixed(2)}`
    }, [settings, preferredCurrency, currencies, convert])

    // ============================================
    // CURRENCY SELECTION
    // ============================================

    /**
     * Set user's preferred currency with persistence
     */
    const setCurrency = useCallback((code: string) => {
        // Validate currency exists and is NOT points
        if (code === 'POINTS' || !currencies[code]) {
            console.warn(`[CurrencyProvider] Invalid or restricted currency: ${code}`)
            return
        }

        setPreferredCurrency(code)

        // Persist to cookie (1 year expiry)
        document.cookie = `nexnum-currency=${code}; path=/; max-age=31536000; SameSite=Lax`

        // Sync to user profile in background (fire and forget)
        fetch('/api/auth/me', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preferredCurrency: code })
        }).catch(() => {
            // Silently fail - cookie is primary persistence
        })
    }, [currencies])

    // ============================================
    // RENDER
    // ============================================

    return (
        <CurrencyContext.Provider value={{
            currencies,
            settings,
            preferredCurrency,
            isLoading,
            formatPrice,
            convert,
            setCurrency,
            formatFromPrices,
            formatBalance
        }}>
            {children}
        </CurrencyContext.Provider>
    )
}

// ============================================
// HOOK
// ============================================

export const useCurrency = () => {
    const context = useContext(CurrencyContext)
    if (context === undefined) {
        throw new Error('useCurrency must be used within a CurrencyProvider')
    }
    return context
}
