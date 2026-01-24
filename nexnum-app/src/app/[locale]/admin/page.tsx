"use client"

import { useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import { useTranslations } from "next-intl"
import {
    BarChart3, Activity, Monitor, Users, Wallet, Package,
    Settings, ArrowRight, TrendingUp, Clock
} from "lucide-react"
import Link from "next/link"

// Command Center Components
import { CommandCenterHeader } from "@/components/admin/CommandCenterHeader"
import { KPIGrid } from "@/components/admin/KPIGrid"
import { IncidentsSummary } from "@/components/admin/IncidentsSummary"
import { QuickActionsPanel } from "@/components/admin/QuickActionsPanel"

// ============================================================================
// TYPES
// ============================================================================

interface CommandCenterData {
    timestamp: string
    systemStatus: 'healthy' | 'degraded' | 'critical'
    kpis: {
        rps: number
        errorRate: number
        p99Latency: number
        activeRentals: number
        walletShortfalls: number
    }
    incidents: {
        id: string
        title: string
        severity: 'critical' | 'warning' | 'info'
        timestamp: string
        affectedSystem?: string
        description?: string
    }[]
}

// ============================================================================
// NAVIGATION CARDS
// ============================================================================

const navCards = [
    {
        id: 'monitoring',
        title: 'System Monitoring',
        description: 'Real-time metrics and infrastructure health',
        icon: Monitor,
        href: '/en/admin/monitoring',
        color: 'emerald'
    },
    {
        id: 'providers',
        title: 'Providers',
        description: 'SMS provider management and configuration',
        icon: Package,
        href: '/en/admin/providers',
        color: 'blue'
    },
    {
        id: 'transactions',
        title: 'Transactions',
        description: 'Wallet and payment history',
        icon: Wallet,
        href: '/en/admin/transactions',
        color: 'purple'
    },
    {
        id: 'users',
        title: 'Users',
        description: 'User management and analytics',
        icon: Users,
        href: '/en/admin/users',
        color: 'amber'
    }
]

const colorStyles: Record<string, { bg: string; border: string; text: string }> = {
    emerald: {
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20 hover:border-emerald-500/40',
        text: 'text-emerald-400'
    },
    blue: {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20 hover:border-blue-500/40',
        text: 'text-blue-400'
    },
    purple: {
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/20 hover:border-purple-500/40',
        text: 'text-purple-400'
    },
    amber: {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20 hover:border-amber-500/40',
        text: 'text-amber-400'
    }
}

function NavCard({ card, index }: { card: typeof navCards[0]; index: number }) {
    const colors = colorStyles[card.color]
    const Icon = card.icon

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.05 }}
        >
            <Link
                href={card.href}
                className={`
                    block relative overflow-hidden rounded-xl
                    bg-[#0F1115] border ${colors.border}
                    p-5 group transition-all duration-300
                    hover:bg-[#131720]
                `}
            >
                <div className="flex items-start justify-between">
                    <div className={`p-2.5 rounded-xl ${colors.bg}`}>
                        <Icon className={`w-5 h-5 ${colors.text}`} />
                    </div>
                    <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/60 group-hover:translate-x-1 transition-all" />
                </div>

                <h3 className="text-sm font-semibold text-white mt-4 mb-1">
                    {card.title}
                </h3>
                <p className="text-xs text-white/40">
                    {card.description}
                </p>
            </Link>
        </motion.div>
    )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminCommandCenter() {
    const t = useTranslations("admin")
    const [data, setData] = useState<CommandCenterData | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [lastUpdate, setLastUpdate] = useState<string | null>(null)

    const fetchData = useCallback(async () => {
        try {
            const response = await fetch('/api/admin/command-center')

            if (response.status === 401) {
                window.location.href = '/en/login'
                return
            }

            if (!response.ok) throw new Error('Failed to fetch')

            const result = await response.json()
            setData(result)
            setLastUpdate(result.timestamp)
        } catch (error) {
            console.error('Failed to fetch Command Center data:', error)
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchData()

        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchData, 30000)
        return () => clearInterval(interval)
    }, [fetchData])

    // Build KPI data for the grid
    const kpis = data ? [
        {
            id: 'rps',
            label: 'RPS',
            value: data.kpis.rps,
            unit: 'req/s',
            trend: '+12%',
            trendDirection: 'up' as const,
            status: 'healthy' as const
        },
        {
            id: 'error-rate',
            label: 'Error Rate',
            value: `${(data.kpis.errorRate * 100).toFixed(2)}`,
            unit: '%',
            status: data.kpis.errorRate > 0.05 ? 'critical' as const :
                data.kpis.errorRate > 0.01 ? 'warning' as const : 'healthy' as const
        },
        {
            id: 'p99-latency',
            label: 'P99 Latency',
            value: data.kpis.p99Latency,
            unit: 'ms',
            status: data.kpis.p99Latency > 2000 ? 'critical' as const :
                data.kpis.p99Latency > 500 ? 'warning' as const : 'healthy' as const
        },
        {
            id: 'active-rentals',
            label: 'Active Rentals',
            value: data.kpis.activeRentals,
            trend: '+5%',
            trendDirection: 'up' as const,
            status: 'healthy' as const
        },
        {
            id: 'wallet-shortfalls',
            label: 'Wallet Shortfalls',
            value: data.kpis.walletShortfalls,
            status: data.kpis.walletShortfalls > 0 ? 'warning' as const : 'healthy' as const
        }
    ] : []

    // Handler for retry jobs
    const handleRetryJobs = async () => {
        const response = await fetch('/api/admin/jobs/retry', { method: 'POST' })
        if (!response.ok) throw new Error('Failed to retry jobs')
        await fetchData() // Refresh data
    }

    return (
        <main className="min-h-screen p-4 md:p-6 lg:p-8">
            {/* Command Center Header */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
            >
                <CommandCenterHeader
                    systemStatus={data?.systemStatus || 'unknown'}
                    lastCheck={lastUpdate}
                    isLoading={isLoading}
                    onRefresh={fetchData}
                />
            </motion.div>

            {/* KPI Grid */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="mb-6"
            >
                <KPIGrid kpis={kpis} isLoading={isLoading} />
            </motion.div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Incidents - Takes 1 column on large screens */}
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 }}
                    className="lg:col-span-1"
                >
                    <IncidentsSummary
                        incidents={data?.incidents || []}
                        isLoading={isLoading}
                        maxDisplay={3}
                    />
                </motion.div>

                {/* Quick Actions - Takes 2 columns on large screens */}
                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="lg:col-span-2"
                >
                    <QuickActionsPanel
                        onRetryJobs={handleRetryJobs}
                    />
                </motion.div>
            </div>

            {/* Navigation Cards */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white">Quick Navigation</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {navCards.map((card, index) => (
                        <NavCard key={card.id} card={card} index={index} />
                    ))}
                </div>
            </motion.div>

            {/* Footer */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-8 pt-6 border-t border-white/5"
            >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-white/30">
                    <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Auto-refreshes every 30 seconds</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link
                            href="/en/admin/settings"
                            className="flex items-center gap-1 hover:text-white/60 transition-colors"
                        >
                            <Settings className="w-3.5 h-3.5" />
                            Settings
                        </Link>
                        <span>NexNum Admin v1.0</span>
                    </div>
                </div>
            </motion.div>
        </main>
    )
}
