
"use client"

import React from 'react'
import { useCurrency } from '@/providers/CurrencyProvider'
import { cn } from '@/lib/utils/utils'

// ============================================
// TYPES
// ============================================

interface PriceDisplayProps {
    /** 
     * Pre-computed prices in all currencies. 
     * REQUIRED for Zero-Math Engine. 
     */
    currencyPrices: Record<string, number>

    /** CSS class for styling */
    className?: string

    /** Skeleton placeholder class */
    skeletonClassName?: string

    /** Compact display for small spaces */
    compact?: boolean
}

// ============================================
// COMPONENT
// ============================================

/**
 * PriceDisplay - Strict Zero-Math price display.
 * 
 * @example
 * <PriceDisplay currencyPrices={offer.currencyPrices} />
 */
export const PriceDisplay: React.FC<PriceDisplayProps> = ({
    currencyPrices,
    className,
    skeletonClassName,
    compact
}) => {
    const { formatFromPrices, isLoading } = useCurrency()

    if (isLoading) {
        return (
            <span
                className={cn(
                    "animate-pulse bg-white/10 rounded-md inline-block align-middle",
                    compact ? "h-3 w-8" : "h-4 w-12",
                    skeletonClassName
                )}
            />
        )
    }

    return (
        <span className={cn("font-medium tabular-nums", className)}>
            {formatFromPrices(currencyPrices)}
        </span>
    )
}

// ============================================
// SPECIALIZED VARIANTS
// ============================================

/**
 * BalanceDisplay - Display user balance with zero client-side calculation
 */
export const BalanceDisplay: React.FC<{
    multiBalance?: {
        points: number
        USD: number
        INR: number
        RUB: number
        EUR: number
        GBP: number
        CNY: number
    }
    className?: string
    showPointsSecondary?: boolean
}> = ({ multiBalance, className }) => {
    const { formatFromBalance, isLoading } = useCurrency()

    if (isLoading) {
        return <span className="animate-pulse bg-white/10 rounded-md h-6 w-20 inline-block" />
    }

    return (
        <span className={cn("font-bold tabular-nums", className)}>
            {formatFromBalance(multiBalance || { points: 0, USD: 0 })}
        </span>
    )
}
