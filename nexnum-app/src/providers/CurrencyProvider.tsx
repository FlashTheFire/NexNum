
"use client"

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'

interface Currency {
    code: string
    name: string
    symbol: string
    rate: number
}

interface SystemSettings {
    baseCurrency: string
    displayCurrency: string
    pointsEnabled: boolean
    pointsName: string
    pointsRate: number
}

interface CurrencyContextType {
    currencies: Record<string, Currency>
    settings: SystemSettings | null
    preferredCurrency: string
    formatPrice: (amountInPoints: number, options?: { showCode?: boolean; precision?: number }) => string
    convert: (amount: number, from: string, to: string) => number
    isLoading: boolean
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

export function CurrencyProvider({ children }: { children: ReactNode }) {
    const [currencies, setCurrencies] = useState<Record<string, Currency>>({})
    const [settings, setSettings] = useState<SystemSettings | null>(null)
    const [preferredCurrency, setPreferredCurrency] = useState('USD')
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await fetch('/api/public/currency')
                const data = await res.json()
                setCurrencies(data.currencies)
                setSettings(data.settings)
                setPreferredCurrency(data.preferredCurrency)
            } catch (e) {
                console.error("Failed to fetch currency data", e)
            } finally {
                setIsLoading(false)
            }
        }
        fetchData()
    }, [])

    const convert = (amount: number, from: string, to: string): number => {
        if (!settings || !currencies) return amount

        // Logic:
        // 1. Convert "from" to Technical Base (USD)
        // 2. Convert Technical Base to "to"

        let amountInUsd = 0

        if (from === 'POINTS') {
            amountInUsd = amount / settings.pointsRate
        } else if (from === settings.baseCurrency) {
            amountInUsd = amount
        } else if (currencies[from]) {
            amountInUsd = amount / currencies[from].rate
        } else {
            amountInUsd = amount // Fallback
        }

        if (to === 'POINTS') {
            return amountInUsd * settings.pointsRate
        } else if (to === settings.baseCurrency) {
            return amountInUsd
        } else if (currencies[to]) {
            return amountInUsd * currencies[to].rate
        }

        return amountInUsd
    }

    const formatPrice = (amountInPoints: number, options?: { showCode?: boolean; precision?: number }): string => {
        if (!settings) return amountInPoints.toString()

        const targetCurrency = preferredCurrency
        const precision = options?.precision ?? (targetCurrency === 'POINTS' ? 2 : 2)

        if (targetCurrency === 'POINTS') {
            return `${amountInPoints.toFixed(precision)} ${settings.pointsName}`
        }

        const converted = convert(amountInPoints, 'POINTS', targetCurrency)
        const currencyData = currencies[targetCurrency]
        const symbol = currencyData?.symbol || ''
        const code = options?.showCode ? ` ${targetCurrency}` : ''

        // Format: Symbol + Amount + (optional Code)
        // e.g. $1.50 or ₹120.00 INR
        return `${symbol}${converted.toFixed(precision)}${code}`
    }

    return (
        <CurrencyContext.Provider value={{
            currencies,
            settings,
            preferredCurrency,
            formatPrice,
            convert,
            isLoading
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
