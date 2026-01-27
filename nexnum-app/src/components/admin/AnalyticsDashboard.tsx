"use client"

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, PieChart, Pie, Cell, LineChart, Line
} from 'recharts'
import { TrendingUp, TrendingDown, Users, DollarSign, Activity, Zap, RefreshCw } from 'lucide-react'

// Premium color palette
const COLORS = {
    primary: '#8b5cf6',
    secondary: '#06b6d4',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    gradient: ['#8b5cf6', '#6366f1', '#3b82f6'],
}

const PIE_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444']

interface AnalyticsData {
    overview: {
        totalUsers: number
        newUsers: number
        userGrowth: string
        totalTransactions: number
        totalRevenue: string
    }
    charts: {
        revenue: { date: string; revenue: number }[]
        profit: { date: string; profit: number }[]
    }
    advanced: {
        overallHealth: any
        slaCompliance: any
        avgMargin: number
        providers: Array<{
            id: string
            name: string
            successRate: number
            latency: number
            margin: number
        }>
    }
    providers: any[]
    recentActivity: any[]
    numberStats: Record<string, number>
}

// Animated counter hook
function useAnimatedCount(target: number, duration = 1000) {
    const [count, setCount] = useState(0)

    useEffect(() => {
        let start = 0
        const increment = target / (duration / 16)
        const timer = setInterval(() => {
            start += increment
            if (start >= target) {
                setCount(target)
                clearInterval(timer)
            } else {
                setCount(Math.floor(start))
            }
        }, 16)
        return () => clearInterval(timer)
    }, [target, duration])

    return count
}

// Premium stat card with animation
function StatCard({
    icon: Icon,
    title,
    value,
    change,
    positive = true,
    color = 'violet'
}: {
    icon: any
    title: string
    value: string | number
    change?: string
    positive?: boolean
    color?: string
}) {
    const colorClasses = {
        violet: 'from-violet-500/20 to-violet-600/5 border-violet-500/30',
        cyan: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/30',
        emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/30',
        amber: 'from-amber-500/20 to-amber-600/5 border-amber-500/30',
    }[color] || 'from-violet-500/20 to-violet-600/5 border-violet-500/30'

    const iconColor = {
        violet: 'text-violet-400',
        cyan: 'text-cyan-400',
        emerald: 'text-emerald-400',
        amber: 'text-amber-400',
    }[color] || 'text-violet-400'

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${colorClasses} border backdrop-blur-sm p-5`}
        >
            {/* Glow effect */}
            <div className={`absolute -top-20 -right-20 w-40 h-40 rounded-full bg-${color}-500/10 blur-3xl`} />

            <div className="relative flex items-start justify-between">
                <div>
                    <p className="text-gray-400 text-sm font-medium">{title}</p>
                    <p className="text-2xl font-bold text-white mt-1">{value}</p>
                    {change && (
                        <div className={`flex items-center gap-1 mt-2 text-sm ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                            {positive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                            <span>{change}</span>
                        </div>
                    )}
                </div>
                <div className={`p-3 rounded-lg bg-gray-800/50 ${iconColor}`}>
                    <Icon className="w-5 h-5" />
                </div>
            </div>
        </motion.div>
    )
}

// Premium chart card wrapper
function ChartCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-gray-900/50 border border-gray-800 rounded-xl p-5 backdrop-blur-sm ${className}`}
        >
            <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
            {children}
        </motion.div>
    )
}

// Custom tooltip for charts
function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null

    return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
            <p className="text-gray-400 text-sm mb-1">{label}</p>
            {payload.map((entry: any, i: number) => (
                <p key={i} className="text-white font-medium">
                    ${entry.value?.toFixed(2)}
                </p>
            ))}
        </div>
    )
}

export function AnalyticsDashboard() {
    const [data, setData] = useState<AnalyticsData | null>(null)
    const [period, setPeriod] = useState('7d')
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    const fetchData = async () => {
        try {
            const res = await fetch(`/api/admin/analytics?period=${period}`)
            if (res.ok) {
                const json = await res.json()
                setData(json)
            }
        } catch (error) {
            console.error('Failed to fetch analytics:', error)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [period])

    const handleRefresh = () => {
        setRefreshing(true)
        fetchData()
    }

    // Must call hooks before any conditional returns
    const revenueTarget = data ? parseFloat(data.overview.totalRevenue) || 0 : 0
    const animatedRevenue = useAnimatedCount(revenueTarget)

    if (loading) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-32 bg-gray-800/50 rounded-xl" />
                    ))}
                </div>
                <div className="h-80 bg-gray-800/50 rounded-xl" />
            </div>
        )
    }

    if (!data) return null

    return (
        <div className="space-y-6">
            {/* Period selector + refresh */}
            <div className="flex items-center justify-between">
                <div className="flex gap-2">
                    {['24h', '7d', '30d', '90d'].map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-4 py-2 rounded-lg font-medium transition-all ${period === p
                                ? 'bg-violet-600 text-white'
                                : 'bg-gray-800 text-gray-400 hover:text-white'
                                }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    icon={Users}
                    title="Total Users"
                    value={data.overview.totalUsers.toLocaleString()}
                    change={`+${data.overview.newUsers} this period`}
                    positive={true}
                    color="violet"
                />
                <StatCard
                    icon={DollarSign}
                    title="Revenue"
                    value={`$${animatedRevenue.toLocaleString()}`}
                    change={data.overview.userGrowth}
                    positive={!data.overview.userGrowth.startsWith('-')}
                    color="emerald"
                />
                <StatCard
                    icon={TrendingUp}
                    title="Profit Margin"
                    value={`${data.advanced.avgMargin.toFixed(1)}%`}
                    color="cyan"
                />
                <StatCard
                    icon={Activity}
                    title="SLA Compliance"
                    value={`${data.advanced.slaCompliance.value.toFixed(1)}%`}
                    color="amber"
                />
            </div>

            {/* System Health Panel */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-gray-900/80 to-gray-800/50 border border-gray-700/50 rounded-xl p-5 backdrop-blur-sm"
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        System Health
                    </h3>
                    <span className="text-xs text-gray-500 font-mono">Live</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Database */}
                    <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">Database</p>
                            <p className="text-emerald-400 font-semibold text-sm">Connected</p>
                        </div>
                    </div>
                    {/* Redis */}
                    <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">Redis</p>
                            <p className="text-emerald-400 font-semibold text-sm">Healthy</p>
                        </div>
                    </div>
                    {/* Workers */}
                    <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">Workers</p>
                            <p className="text-emerald-400 font-semibold text-sm">Running</p>
                        </div>
                    </div>
                    {/* API */}
                    <div className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm text-gray-400">API</p>
                            <p className="text-emerald-400 font-semibold text-sm">Online</p>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Revenue & Profit chart */}
            <ChartCard title="Business Performance (Revenue vs Profit)">
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.charts.revenue.map((r, i) => ({
                            ...r,
                            profit: data.charts.profit[i]?.profit || 0
                        }))}>
                            <defs>
                                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={COLORS.success} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={COLORS.success} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                            <XAxis
                                dataKey="date"
                                stroke="#9ca3af"
                                tick={{ fontSize: 12 }}
                                tickFormatter={(v) => new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                            />
                            <YAxis
                                stroke="#9ca3af"
                                tick={{ fontSize: 12 }}
                                tickFormatter={(v) => `$${v}`}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="revenue"
                                stroke={COLORS.primary}
                                strokeWidth={2}
                                fill="url(#revenueGradient)"
                            />
                            <Area
                                type="monotone"
                                dataKey="profit"
                                stroke={COLORS.success}
                                strokeWidth={2}
                                fill="url(#profitGradient)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </ChartCard>

            {/* Provider stats + Number status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Provider Performance Matrix">
                    <div className="overflow-x-auto">
                        <table className="w-100 text-left">
                            <thead>
                                <tr className="text-gray-400 text-xs uppercase font-medium border-b border-gray-800">
                                    <th className="pb-3 px-2">Provider</th>
                                    <th className="pb-3 px-2">Success</th>
                                    <th className="pb-3 px-2">Latency</th>
                                    <th className="pb-3 px-2">Margin</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {data.advanced.providers.map((p, i) => (
                                    <tr key={p.id} className="text-sm">
                                        <td className="py-3 px-2 text-white font-medium">{p.name}</td>
                                        <td className="py-3 px-2">
                                            <span className={p.successRate > 90 ? 'text-emerald-400' : p.successRate > 70 ? 'text-amber-400' : 'text-danger'}>
                                                {p.successRate.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="py-3 px-2 text-gray-300">{(p.latency).toFixed(0)}ms</td>
                                        <td className="py-3 px-2 font-mono text-cyan-400">{p.margin.toFixed(1)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </ChartCard>

                <ChartCard title="Number Status Distribution">
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={Object.entries(data.numberStats).map(([status, count]) => ({
                                        name: status,
                                        value: count
                                    }))}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {Object.keys(data.numberStats).map((_, i) => (
                                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-3 justify-center mt-4">
                        {Object.entries(data.numberStats).map(([status, count], i) => (
                            <div key={status} className="flex items-center gap-2">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                                />
                                <span className="text-sm text-gray-400 capitalize">{status}: {count}</span>
                            </div>
                        ))}
                    </div>
                </ChartCard>
            </div>
        </div>
    )
}

export default AnalyticsDashboard
