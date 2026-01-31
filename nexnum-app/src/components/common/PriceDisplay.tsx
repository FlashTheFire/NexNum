
"use client"

import React from 'react'
import { useCurrency } from '@/providers/CurrencyProvider'
import { cn } from '@/lib/utils/utils'

// ============================================
// TYPES
// ============================================

interface PriceDisplayProps {
    /** Price in Points (100 Points = 1 USD) */
    amountInPoints: number

    /** Pre-computed prices in all currencies from MeiliSearch (preferred) */
    currencyPrices?: Record<string, number>

    /** CSS class for styling */
    className?: string

    /** Show currency code (e.g. "USD") after the amount */
    showCode?: boolean

    /** Decimal precision (default: 2) */
    precision?: number

    /** Skeleton placeholder class */
    skeletonClassName?: string

    /** Compact display for small spaces */
    compact?: boolean
}

// ============================================
// COMPONENT
// ============================================

/**
 * PriceDisplay - Universal price display component with multi-currency support
 * 
 * Priority order:
 * 1. Use pre-computed `currencyPrices[userCurrency]` (instant, no conversion)
 * 2. Fallback to real-time conversion from `amountInPoints`
 * 
 * @example
 * // From MeiliSearch offer (with pre-computed prices)
 * <PriceDisplay 
 *     amountInPoints={offer.pointPrice} 
 *     currencyPrices={offer.currencyPrices} 
 * />
 * 
 * // From Points-only value (balance, transaction)
 * <PriceDisplay amountInPoints={balance} />
 */
export const PriceDisplay: React.FC<PriceDisplayProps> = ({
    amountInPoints,
    currencyPrices,
    className,
    showCode,
    precision = 2,
    skeletonClassName,
    compact
}) => {
    const { formatFromPrices, formatPrice, isLoading } = useCurrency()

    // Loading state
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

    // Format price using pre-computed prices or fallback to conversion
    let formatted: string

    if (currencyPrices) {
        // Use pre-computed price (preferred - no conversion overhead)
        formatted = formatFromPrices(currencyPrices, amountInPoints)
    } else {
        // Fallback to real-time conversion
        formatted = formatPrice(amountInPoints, { showCode, precision })
    }

    return (
        <span className={cn("font-medium tabular-nums", className)}>
            {formatted}
        </span>
    )
}

// ============================================
// SPECIALIZED VARIANTS
// ============================================

/**
 * BalanceDisplay - Display user balance with Points secondary
 */
export const BalanceDisplay: React.FC<{
    balanceInPoints: number
    className?: string
    showPointsSecondary?: boolean
}> = ({ balanceInPoints, className, showPointsSecondary = false }) => {
    const { formatBalance, preferredCurrency, settings, isLoading } = useCurrency()

    if (isLoading) {
        return <span className="animate-pulse bg-white/10 rounded-md h-6 w-20 inline-block" />
    }

    const primary = formatBalance(balanceInPoints)
    const showSecondary = showPointsSecondary && preferredCurrency !== 'POINTS'

    return (
        <span className={cn("font-bold tabular-nums", className)}>
            {primary}
            {showSecondary && settings && (
                <span className="ml-1 text-xs text-muted-foreground font-normal">
                    ({balanceInPoints.toFixed(0)} {settings.pointsName})
                </span>
            )}
        </span>
    )
}
