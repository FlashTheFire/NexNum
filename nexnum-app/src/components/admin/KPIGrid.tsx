"use client"

import React from 'react'
import { motion } from 'framer-motion'
import {
    Activity, TrendingUp, TrendingDown, AlertTriangle,
    Clock, Wallet, Hash, Gauge
} from 'lucide-react'

type KPIStatus = 'healthy' | 'warning' | 'critical'

interface KPI {
    id: string
    label: string
    value: string | number
    unit?: string
    trend?: string
    trendDirection?: 'up' | 'down' | 'neutral'
    status?: KPIStatus
    icon?: React.ElementType
}

interface KPIGridProps {
    kpis: KPI[]
    isLoading?: boolean
}

const defaultIcons: Record<string, React.ElementType> = {
    'RPS': Activity,
    'Error Rate': AlertTriangle,
    'P99 Latency': Clock,
    'Active Rentals': Hash,
    'Wallet Shortfalls': Wallet
}

const statusColors = {
    healthy: {
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        text: 'text-emerald-400',
        glow: 'from-emerald-500/20'
    },
    warning: {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        text: 'text-amber-400',
        glow: 'from-amber-500/20'
    },
    critical: {
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        text: 'text-red-400',
        glow: 'from-red-500/20'
    }
}

function KPICard({ kpi, index }: { kpi: KPI; index: number }) {
    const status = kpi.status || 'healthy'
    const colors = statusColors[status]
    const Icon = kpi.icon || defaultIcons[kpi.label] || Gauge

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`
                relative overflow-hidden rounded-xl
                bg-[#0F1115] border ${colors.border}
                p-4 md:p-5
                group hover:border-white/20 transition-all duration-300
            `}
        >
            {/* Top Glow */}
            <div className={`
                absolute top-0 left-0 right-0 h-[1px]
                bg-gradient-to-r ${colors.glow} via-white/10 to-transparent
                opacity-50
            `} />

            {/* Background Gradient */}
            <div className={`
                absolute -top-10 -right-10 w-24 h-24
                bg-gradient-radial ${colors.glow} to-transparent
                blur-2xl opacity-30 group-hover:opacity-50 transition-opacity
            `} />

            <div className="relative">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className={`p-1.5 rounded-lg ${colors.bg}`}>
                        <Icon className={`w-3.5 h-3.5 ${colors.text}`} />
                    </div>
                    {kpi.trend && (
                        <div className={`
                            flex items-center gap-1 text-xs font-medium
                            ${kpi.trendDirection === 'up' ? 'text-emerald-400' :
                                kpi.trendDirection === 'down' ? 'text-red-400' :
                                    'text-white/40'}
                        `}>
                            {kpi.trendDirection === 'up' && <TrendingUp className="w-3 h-3" />}
                            {kpi.trendDirection === 'down' && <TrendingDown className="w-3 h-3" />}
                            {kpi.trend}
                        </div>
                    )}
                </div>

                {/* Value */}
                <div className="flex items-baseline gap-1 mb-1">
                    <span className="text-2xl md:text-3xl font-bold text-white">
                        {kpi.value}
                    </span>
                    {kpi.unit && (
                        <span className={`text-sm font-medium ${colors.text}`}>
                            {kpi.unit}
                        </span>
                    )}
                </div>

                {/* Label */}
                <div className="text-xs text-white/40 uppercase tracking-wider font-medium">
                    {kpi.label}
                </div>
            </div>
        </motion.div>
    )
}

export function KPIGrid({ kpis, isLoading = false }: KPIGridProps) {
    if (isLoading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-28 rounded-xl bg-[#0F1115] border border-white/5 animate-pulse"
                    />
                ))}
            </div>
        )
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {kpis.map((kpi, index) => (
                <KPICard key={kpi.id} kpi={kpi} index={index} />
            ))}
        </div>
    )
}

export default KPIGrid
