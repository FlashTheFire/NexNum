import * as React from "react"
import { cn } from "@/lib/utils/utils"

interface BalanceRingProps {
    balance: number
    spent: number
    deposit: number
    size?: number
    strokeWidth?: number
    className?: string
}

export function BalanceRing({
    balance,
    spent,
    deposit,
    size = 180,
    strokeWidth = 12,
    className
}: BalanceRingProps) {
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius

    // Simple calculation for demo purposes
    const total = balance + spent
    const balancePercent = total > 0 ? (balance / total) * 100 : 0

    const balanceNav = (balancePercent / 100) * circumference

    return (
        <div className={cn("relative flex items-center justify-center", className)} style={{ width: size, height: size }}>
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                className="rotate-[-90deg]"
            >
                {/* Background Circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-muted/20"
                />

                {/* Balance Segment */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="url(#gradient-balance)"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference - balanceNav}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                />

                <defs>
                    <linearGradient id="gradient-balance" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#10b981" />
                        <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                </defs>
            </svg>

            <div className="absolute flex flex-col items-center">
                <span className="text-sm text-muted-foreground uppercase tracking-widest text-[10px] font-semibold">Current Balance</span>
                <span className="text-3xl font-bold tracking-tight text-white">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(balance)}
                </span>
            </div>
        </div>
    )
}
