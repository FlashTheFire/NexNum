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
                    icon={Activity}
                    title="Transactions"
                    value={data.overview.totalTransactions.toLocaleString()}
                    color="cyan"
                />
                <StatCard
                    icon={Zap}
                    title="Active Providers"
                    value={data.providers.length}
                    color="amber"
                />
            </div>

            {/* Revenue chart */}
            <ChartCard title="Revenue Overview">
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.charts.revenue}>
                            <defs>
                                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
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
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </ChartCard>

            {/* Provider stats + Number status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ChartCard title="Provider Balance">
                    <div className="space-y-3">
                        {data.providers.map((provider, i) => (
                            <motion.div
                                key={provider.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg"
                            >
                                <div>
                                    <p className="font-medium text-white">{provider.displayName}</p>
                                    <p className="text-sm text-gray-400">{provider._count.syncJobs} syncs</p>
                                </div>
                                <div className="text-right">
                                    <p className={`font-bold ${provider.balance < 10 ? 'text-red-400' : 'text-emerald-400'}`}>
                                        ${provider.balance.toFixed(2)}
                                    </p>
                                    <p className="text-xs text-gray-500">Priority: {provider.priority}</p>
                                </div>
                            </motion.div>
                        ))}
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
