
"use client"

import React from 'react'
import { useCurrency } from '@/providers/CurrencyProvider'
import { cn } from '@/lib/utils/utils'

interface PriceDisplayProps {
    amountInPoints: number
    className?: string
    showCode?: boolean
    precision?: number
    skeletonClassName?: string
}

export const PriceDisplay: React.FC<PriceDisplayProps> = ({
    amountInPoints,
    className,
    showCode,
    precision,
    skeletonClassName
}) => {
    const { formatPrice, isLoading, settings } = useCurrency()

    if (isLoading) {
        return (
            <span className={cn("animate-pulse bg-white/10 rounded-md h-4 w-12 inline-block align-middle", skeletonClassName)} />
        )
    }

    const formatted = formatPrice(amountInPoints, { showCode, precision })

    return (
        <span className={cn("font-medium", className)}>
            {formatted}
        </span>
    )
}
