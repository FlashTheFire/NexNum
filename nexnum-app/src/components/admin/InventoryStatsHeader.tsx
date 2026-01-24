"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
    Globe,
    Smartphone,
    EyeOff,
    Server,
    RefreshCw,
    TrendingUp,
    Clock,
    Activity
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatDistanceToNow } from "date-fns"

interface InventoryStats {
    totalCountries: number
    totalServices: number
    hiddenItems: number
    activeProviders: number
    lastSyncTime?: number
    totalStock: number
}

interface InventoryStatsHeaderProps {
    onSyncAll?: () => void
    syncing?: boolean
}

export function InventoryStatsHeader({ onSyncAll, syncing }: InventoryStatsHeaderProps) {
    const [stats, setStats] = useState<InventoryStats | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch('/api/admin/inventory/stats')
                if (res.ok) {
                    const data = await res.json()
                    setStats(data)
                }
            } catch (e) {
                console.error('Failed to fetch inventory stats', e)
            } finally {
                setLoading(false)
            }
        }
        fetchStats()

        // Refresh every 30 seconds
        const interval = setInterval(fetchStats, 30000)
        return () => clearInterval(interval)
    }, [])

    const statCards = [
        {
            label: 'Countries',
            value: stats?.totalCountries || 0,
            icon: Globe,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/20'
        },
        {
            label: 'Services',
            value: stats?.totalServices || 0,
            icon: Smartphone,
            color: 'text-purple-400',
            bg: 'bg-purple-500/10',
            border: 'border-purple-500/20'
        },
        {
            label: 'Hidden',
            value: stats?.hiddenItems || 0,
            icon: EyeOff,
            color: 'text-orange-400',
            bg: 'bg-orange-500/10',
            border: 'border-orange-500/20'
        },
        {
            label: 'Providers',
            value: stats?.activeProviders || 0,
            icon: Server,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10',
            border: 'border-emerald-500/20'
        }
    ]

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#111318]/80 border border-white/5 rounded-2xl p-4 md:p-6"
        >
            {/* Header Row */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-[hsl(var(--neon-lime))]/10 text-[hsl(var(--neon-lime))]">
                        <Activity size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">Inventory Overview</h2>
                        <p className="text-xs text-gray-500 flex items-center gap-1.5">
                            <Clock size={10} />
                            {stats?.lastSyncTime
                                ? `Last sync ${formatDistanceToNow(new Date(stats.lastSyncTime))} ago`
                                : 'Loading...'
                            }
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    {stats?.totalStock && (
                        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                            <TrendingUp size={14} className="text-emerald-400" />
                            <span className="text-sm font-mono text-emerald-400">
                                {stats.totalStock.toLocaleString()} total stock
                            </span>
                        </div>
                    )}
                    {onSyncAll && (
                        <Button
                            size="sm"
                            onClick={onSyncAll}
                            disabled={syncing}
                            className="bg-[hsl(var(--neon-lime))] hover:bg-[hsl(var(--neon-lime-soft))] text-black"
                        >
                            <RefreshCw size={14} className={`mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
                            Sync All
                        </Button>
                    )}
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {statCards.map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className={`p-3 md:p-4 rounded-xl ${stat.bg} border ${stat.border} flex items-center gap-3`}
                    >
                        <div className={`p-2 rounded-lg bg-black/20 ${stat.color}`}>
                            <stat.icon size={18} />
                        </div>
                        <div>
                            <p className="text-2xl md:text-3xl font-bold text-white">
                                {loading ? (
                                    <span className="inline-block w-8 h-6 bg-white/10 rounded animate-pulse" />
                                ) : (
                                    stat.value.toLocaleString()
                                )}
                            </p>
                            <p className="text-xs text-gray-400">{stat.label}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Mobile Stock Display */}
            {stats?.totalStock && (
                <div className="md:hidden mt-3 flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <TrendingUp size={14} className="text-emerald-400" />
                    <span className="text-sm font-mono text-emerald-400">
                        {stats.totalStock.toLocaleString()} total stock
                    </span>
                </div>
            )}
        </motion.div>
    )
}
