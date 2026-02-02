"use client"

import React, { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Database, Server, Search, Wifi, Activity, Clock,
    RefreshCw, AlertCircle, CheckCircle, XCircle,
    HardDrive, Cpu, MemoryStick, Zap, TrendingUp,
    Users, Box, Layers, Terminal, Smartphone, Globe,
    ArrowUpRight, ArrowDownRight, Sparkles
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis,
    ResponsiveContainer, Tooltip, LineChart, Line, Cell
} from "recharts"
import { GrafanaEmbed } from "@/components/admin/monitoring/GrafanaEmbed"

// ============================================
// TYPES
// ============================================
interface MetricsData {
    timestamp: string
    database: {
        status: 'healthy' | 'warning' | 'critical'
        activeConnections: number
        idleConnections: number
        maxConnections: number
        poolUtilization: number
    }
    redis: {
        status: 'healthy' | 'warning' | 'critical'
        connected: boolean
        memoryUsed: string
        memoryPeak: string
        keyCount: number
        opsPerSec: number
        connectedClients: number
    }
    search: {
        status: 'healthy' | 'warning' | 'critical'
        connected: boolean
        indexName: string
        documentCount: number
        isIndexing: boolean
    }
    providers: {
        total: number
        active: number
        syncing: number
        failed: number
        lowBalance: number
        providers: {
            name: string
            displayName: string
            status: string
            balance: number
            currency: string
            lastSync: string | null
            isActive: boolean
        }[]
    }
    workers: {
        status: 'healthy' | 'warning' | 'critical'
        activeJobs: number
        completedToday: number
        failedToday: number
        queueDepth: number
    }
    application: {
        uptime: number
        memoryUsage: {
            heapUsed: number
            heapTotal: number
            external: number
            rss: number
        }
        cpuUsage: { user: number; system: number }
    }
}

interface ApiLogEntry {
    id: string
    timestamp: string
    method: string
    path: string
    status: number
    duration: number
}

// ============================================
// VISUAL COMPONENTS
// ============================================

// Premium Card Wrapper with Responsive Widths
const PremiumCard = ({ children, className = "", glowColor = "emerald" }: { children: React.ReactNode, className?: string, glowColor?: "emerald" | "cyan" | "purple" | "amber" | "blue" }) => {
    const glows = {
        emerald: "from-emerald-500/10 to-transparent",
        cyan: "from-cyan-500/10 to-transparent",
        purple: "from-purple-500/10 to-transparent",
        amber: "from-amber-500/10 to-transparent",
        blue: "from-blue-500/10 to-transparent",
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[#0F1115] p-4 md:p-5 shadow-2xl flex-shrink-0 w-[85vw] sm:w-[350px] md:w-auto snap-center ${className}`}
        >
            {/* Top Light Accent */}
            <div className={`absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r ${glows[glowColor]} via-white/20 to-transparent opacity-50`} />

            {/* Background Gradient */}
            <div className={`absolute -top-20 -right-20 w-40 h-40 bg-${glowColor}-500/20 blur-[60px] rounded-full pointer-events-none`} />

            {/* Content */}
            <div className="relative z-10 h-full flex flex-col justify-between">
                {children}
            </div>
        </motion.div>
    )
}

// Sparkline (Mini Chart) - Now uses real history data
const Sparkline = ({ data, color = "#10b981", type = "area" }: { data: number[], color?: string, type?: "area" | "bar" }) => {
    const chartData = data.map((v, i) => ({ i, v }))
    return (
        <div className="h-8 md:h-10 w-20 md:w-24">
            <ResponsiveContainer width="100%" height="100%">
                {type === "area" ? (
                    <AreaChart data={chartData}>
                        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={color} fillOpacity={0.1} isAnimationActive={false} />
                    </AreaChart>
                ) : (
                    <BarChart data={chartData}>
                        <Bar dataKey="v" fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                )}
            </ResponsiveContainer>
        </div>
    )
}

// Card Header
const CardHeader = ({ title, icon: Icon, color = "text-emerald-400" }: { title: string, icon: any, color?: string }) => (
    <div className="flex items-center gap-2 mb-3 md:mb-4">
        <div className={`p-1.5 md:p-2 rounded-lg bg-white/5 border border-white/5 ${color}`}>
            <Icon size={16} className="w-3.5 h-3.5 md:w-4 md:h-4" />
        </div>
        <span className="text-xs md:text-sm font-medium text-white/80 uppercase tracking-wide">{title}</span>
    </div>
)

// Helper for formatting
const formatNumber = (num: number) => new Intl.NumberFormat('en-US', { notation: "compact", maximumFractionDigits: 1 }).format(num)
const formatTime = (date: Date | string) => new Date(date).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })

// ============================================
// MAIN PAGE
// ============================================
export default function MonitoringPage() {
    const [metrics, setMetrics] = useState<MetricsData | null>(null)
    const [history, setHistory] = useState<{ time: string; connections: number; memory: number; ops: number }[]>([])
    const [logs, setLogs] = useState<ApiLogEntry[]>([])
    const [autoRefresh, setAutoRefresh] = useState(true)
    const [activeCard, setActiveCard] = useState(0)
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
    const [viewMode, setViewMode] = useState<'native' | 'grafana'>('native')

    // Handle scroll for pagination dots on mobile
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const scrollLeft = e.currentTarget.scrollLeft
        const cardWidth = e.currentTarget.offsetWidth * 0.85
        const index = Math.round(scrollLeft / cardWidth)
        setActiveCard(index)
    }

    const [error, setError] = useState<string | null>(null)

    // Fetch real metrics from API
    const fetchMetrics = async () => {
        try {
            const res = await fetch('/api/admin/system/metrics')

            if (res.status === 401) {
                // If unauthorized, redirect to login (or handle as needed)
                window.location.href = '/en/login'
                return
            }

            if (!res.ok) throw new Error('Failed to fetch metrics')

            const data = await res.json()
            setMetrics(data)
            setError(null)
            setLastUpdate(new Date())

            // Build history from real data points
            setHistory(prev => {
                const time = formatTime(new Date())
                const newPoint = {
                    time,
                    connections: data.database?.activeConnections || 0,
                    memory: Math.round((data.application?.memoryUsage?.heapUsed || 0) / (1024 * 1024)),
                    ops: data.redis?.opsPerSec || 0
                }
                return [...prev.slice(-29), newPoint]
            })
        } catch (e: any) {
            console.error('Metrics fetch error:', e)
            setError(e.message || 'Failed to connect to monitoring service')
        }
    }

    // Fetch real API logs
    const fetchLogs = async () => {
        try {
            const res = await fetch('/api/admin/system/logs')
            if (res.status === 401) return
            if (!res.ok) return
            const data = await res.json()
            if (data.logs && Array.isArray(data.logs)) {
                setLogs(data.logs.slice(0, 15))
            }
        } catch (e) {
            console.error('Logs fetch error:', e)
        }
    }

    useEffect(() => {
        fetchMetrics()
        fetchLogs()

        if (autoRefresh) {
            const metricsInterval = setInterval(fetchMetrics, 3000)
            const logsInterval = setInterval(fetchLogs, 5000)
            return () => {
                clearInterval(metricsInterval)
                clearInterval(logsInterval)
            }
        }
    }, [autoRefresh])

    // Derive sparkline data from history
    const poolHistory = history.map(h => h.connections)
    const opsHistory = history.map(h => h.ops)

    if (!metrics) {
        return (
            <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
                <div className="text-center">
                    <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin mx-auto mb-4" />
                    <p className="text-white/40">Connecting to infrastructure...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#0a0a0c] p-4 md:p-6 lg:p-8 font-sans overflow-x-hidden">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6 md:mb-8">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
                        <Activity className="text-emerald-400 w-5 h-5 md:w-6 md:h-6" strokeWidth={3} />
                        System Monitor
                    </h1>
                    <p className="text-white/40 mt-1 pl-1 text-sm md:text-base">
                        Live Infrastructure Telemetry
                        {lastUpdate && (
                            <span className="ml-2 text-white/20">
                                • Updated {formatTime(lastUpdate)}
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`px-2.5 py-1 rounded-full border flex items-center gap-2 ${metrics.database.status === 'healthy' && metrics.redis.status === 'healthy'
                        ? 'bg-emerald-500/10 border-emerald-500/20'
                        : 'bg-amber-500/10 border-amber-500/20'
                        }`}>
                        <span className="relative flex h-2 w-2">
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${metrics.database.status === 'healthy' ? 'bg-emerald-500' : 'bg-amber-500'
                                }`}></span>
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${metrics.database.status === 'healthy' ? 'bg-emerald-500' : 'bg-amber-500'
                                }`}></span>
                        </span>
                        <span className={`text-[10px] font-bold tracking-wider ${metrics.database.status === 'healthy' ? 'text-emerald-500' : 'text-amber-500'
                            }`}>
                            {metrics.database.status === 'healthy' ? 'ALL SYSTEMS OPERATIONAL' : 'DEGRADED'}
                        </span>
                    </div>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`h-8 px-2 text-xs border border-white/10 ${autoRefresh ? 'text-emerald-400 bg-emerald-500/5' : 'text-white/40'}`}
                    >
                        {autoRefresh ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                        {autoRefresh ? 'Live' : 'Paused'}
                    </Button>
                    <div className="flex bg-white/5 p-1 rounded-lg border border-white/10">
                        <button
                            onClick={() => setViewMode('native')}
                            className={`px-3 py-1 rounded text-xs font-medium transition-all ${viewMode === 'native'
                                ? 'bg-zinc-800 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                        >
                            Native
                        </button>
                        <button
                            onClick={() => setViewMode('grafana')}
                            className={`px-3 py-1 rounded text-xs font-medium transition-all ${viewMode === 'grafana'
                                ? 'bg-orange-600 text-white shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-300'
                                }`}
                        >
                            Grafana
                        </button>
                    </div>
                </div>
            </div>

            {viewMode === 'grafana' ? (
                <GrafanaEmbed height="1500px" />
            ) : (
                <>

                    {/* MAIN GRID - Horizontal Scroll on Mobile, Grid on Desktop */}
                    <div
                        className="flex overflow-x-auto snap-x snap-mandatory pb-6 -mx-4 px-4 gap-4 md:overflow-visible md:grid md:grid-cols-2 xl:grid-cols-4 md:gap-6 md:pb-8 md:mx-0 md:px-0 scrollbar-hide"
                        onScroll={handleScroll}
                    >

                        {/* 1. DATABASE CARD */}
                        <PremiumCard glowColor="emerald">
                            <CardHeader title="Database" icon={Database} color="text-emerald-400" />
                            <div className="flex items-end justify-between mb-4 md:mb-6">
                                <div>
                                    <div className="text-3xl md:text-4xl font-bold text-white mb-1">
                                        {metrics.database.poolUtilization}<span className="text-base md:text-lg text-emerald-400">%</span>
                                    </div>
                                    <div className="text-[10px] md:text-xs text-white/40 uppercase tracking-widest">Pool Usage</div>
                                </div>
                                <Sparkline data={poolHistory.length > 0 ? poolHistory : [0]} color="#10b981" />
                            </div>

                            {/* Visual Pool Bar */}
                            <div className="flex gap-1 h-1.5 w-full bg-white/5 rounded-full overflow-hidden mb-4">
                                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(metrics.database.activeConnections / metrics.database.maxConnections) * 100}%` }} />
                                <div className="h-full bg-emerald-500/30 transition-all duration-500" style={{ width: `${(metrics.database.idleConnections / metrics.database.maxConnections) * 100}%` }} />
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center border-t border-white/5 pt-3 md:pt-4">
                                <div>
                                    <div className="text-base md:text-lg font-bold text-emerald-400">{metrics.database.activeConnections}</div>
                                    <div className="text-[9px] md:text-[10px] text-white/30 uppercase">Active</div>
                                </div>
                                <div>
                                    <div className="text-base md:text-lg font-bold text-white/60">{metrics.database.idleConnections}</div>
                                    <div className="text-[9px] md:text-[10px] text-white/30 uppercase">Idle</div>
                                </div>
                                <div>
                                    <div className="text-base md:text-lg font-bold text-white/40">{metrics.database.maxConnections}</div>
                                    <div className="text-[9px] md:text-[10px] text-white/30 uppercase">Limit</div>
                                </div>
                            </div>
                        </PremiumCard>

                        {/* 2. REDIS CARD */}
                        <PremiumCard glowColor="cyan">
                            <CardHeader title="Redis Cache" icon={Zap} color="text-cyan-400" />
                            <div className="flex items-end justify-between mb-4 md:mb-6">
                                <div>
                                    <div className="text-3xl md:text-4xl font-bold text-white mb-1">
                                        {metrics.redis.memoryUsed.replace('M', '')}<span className="text-base md:text-lg text-cyan-400">MB</span>
                                    </div>
                                    <div className="text-[10px] md:text-xs text-white/40 uppercase tracking-widest">Memory</div>
                                </div>
                                <Sparkline data={opsHistory.length > 0 ? opsHistory : [0]} color="#06b6d4" type="bar" />
                            </div>

                            <div className="space-y-3 md:space-y-4 pt-2">
                                <div className="flex justify-between items-center p-2.5 md:p-3 bg-white/5 rounded-xl border border-white/5">
                                    <div className="flex items-center gap-2">
                                        <span className="p-1 md:p-1.5 rounded bg-cyan-500/20 text-cyan-400"><TrendingUp size={12} className="md:w-3.5 md:h-3.5" /></span>
                                        <span className="text-[10px] md:text-xs text-white/60 font-medium">Ops/Sec</span>
                                    </div>
                                    <span className="text-base md:text-lg font-bold text-cyan-400 font-mono">{metrics.redis.opsPerSec}</span>
                                </div>
                                <div className="flex justify-between items-center px-2">
                                    <div className="text-[10px] md:text-xs text-white/40">Keys Stored</div>
                                    <div className="text-xs md:text-sm font-bold text-white tabular-nums">{metrics.redis.keyCount.toLocaleString()}</div>
                                </div>
                            </div>
                        </PremiumCard>

                        {/* 3. MEILISEARCH CARD */}
                        <PremiumCard glowColor="purple">
                            <CardHeader title="Search Engine" icon={Search} color="text-purple-400" />
                            <div className="flex flex-col h-full justify-center pb-4 md:pb-8">
                                <div className="relative flex items-center justify-center p-4 md:p-6">
                                    {/* Animated Pulse Rings */}
                                    <div className={`absolute inset-0 m-auto w-24 h-24 md:w-32 md:h-32 rounded-full border border-purple-500/20 animate-[ping_3s_linear_infinite]`} />
                                    <div className={`absolute inset-0 m-auto w-16 h-16 md:w-24 md:h-24 rounded-full border border-purple-500/30 animate-[ping_3s_linear_infinite_0.5s]`} />

                                    <div className="text-center relative z-10">
                                        <div className="text-2xl md:text-3xl font-bold text-white mb-1">{formatNumber(metrics.search.documentCount)}</div>
                                        <div className="text-[10px] md:text-xs text-purple-400/80 uppercase tracking-wider font-medium">Documents</div>
                                    </div>
                                </div>

                                <div className="absolute bottom-4 md:bottom-5 left-0 right-0 text-center">
                                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] md:text-xs font-bold ${metrics.search.isIndexing ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                        <span className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${metrics.search.isIndexing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                                        {metrics.search.isIndexing ? 'INDEXING...' : 'SYSTEM READY'}
                                    </div>
                                </div>
                            </div>
                        </PremiumCard>

                        {/* 4. WORKERS CARD */}
                        <PremiumCard glowColor="amber">
                            <CardHeader title="Background Jobs" icon={Layers} color="text-amber-400" />

                            <div className="flex gap-3 md:gap-4 mb-4 md:mb-6">
                                <div className="flex-1 p-3 md:p-4 bg-white/5 rounded-xl border border-white/5 text-center transition-colors hover:bg-white/10 group">
                                    <div className="text-xl md:text-2xl font-bold text-white group-hover:scale-110 transition-transform">{metrics.workers.activeJobs}</div>
                                    <div className="text-[9px] md:text-[10px] text-cyan-400 uppercase tracking-widest mt-1">Active</div>
                                </div>
                                <div className="flex-1 p-3 md:p-4 bg-white/5 rounded-xl border border-white/5 text-center transition-colors hover:bg-white/10 group">
                                    <div className="text-xl md:text-2xl font-bold text-white group-hover:scale-110 transition-transform">{metrics.workers.queueDepth}</div>
                                    <div className="text-[9px] md:text-[10px] text-purple-400 uppercase tracking-widest mt-1">Queue</div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-[10px] md:text-xs items-center">
                                    <span className="text-white/40">Completed</span>
                                    <span className="text-emerald-400 font-mono">{metrics.workers.completedToday.toLocaleString()}</span>
                                </div>
                                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-emerald-500 transition-all duration-500"
                                        style={{ width: `${metrics.workers.completedToday > 0 ? Math.min(100, (metrics.workers.completedToday / (metrics.workers.completedToday + metrics.workers.failedToday + 1)) * 100) : 0}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-[10px] md:text-xs items-center pt-1">
                                    <span className="text-white/40">Failed</span>
                                    <span className={`${metrics.workers.failedToday > 0 ? 'text-red-400' : 'text-white/20'} font-mono`}>{metrics.workers.failedToday}</span>
                                </div>
                            </div>
                        </PremiumCard>
                    </div>

                    {/* Mobile Scroll Dots - Only visible on mobile */}
                    <div className="flex md:hidden justify-center gap-2 mb-6 -mt-2">
                        {[0, 1, 2, 3].map((i) => (
                            <div
                                key={i}
                                className={`h-1.5 rounded-full transition-all duration-300 ${activeCard === i ? 'w-6 bg-emerald-500' : 'w-1.5 bg-white/20'}`}
                            />
                        ))}
                    </div>

                    {/* SECONDARY ROW: Charts & Logs */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-auto lg:h-[400px]">

                        {/* Visual Chart Area */}
                        <div className="lg:col-span-2 bg-[#0F1115] border border-white/10 rounded-2xl p-4 md:p-6 shadow-xl flex flex-col h-[300px] lg:h-auto">
                            <div className="flex justify-between items-center mb-4 md:mb-6">
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="text-blue-400" size={18} />
                                    <h3 className="text-white font-semibold text-sm md:text-base">System Throughput</h3>
                                </div>
                                <div className="flex gap-3 md:gap-4 text-[10px] md:text-xs">
                                    <div className="flex items-center gap-1.5 md:gap-2">
                                        <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500" />
                                        <span className="text-white/60">Connections</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 md:gap-2">
                                        <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-cyan-500" />
                                        <span className="text-white/60">Redis Ops</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 w-full min-h-0">
                                {history.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={history}>
                                            <defs>
                                                <linearGradient id="chartConn" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                </linearGradient>
                                                <linearGradient id="chartOps" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2} />
                                                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="time" tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={false} tickLine={false} minTickGap={30} />
                                            <YAxis yAxisId="left" tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={false} tickLine={false} />
                                            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={false} tickLine={false} />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff' }}
                                                itemStyle={{ fontSize: '12px' }}
                                            />
                                            <Area yAxisId="left" type="monotone" dataKey="connections" stroke="#10b981" strokeWidth={2} fill="url(#chartConn)" activeDot={{ r: 4, fill: '#fff' }} />
                                            <Area yAxisId="right" type="monotone" dataKey="ops" stroke="#06b6d4" strokeWidth={2} fill="url(#chartOps)" />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="flex items-center justify-center h-full text-white/20">
                                        <p>Collecting data...</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Real API Logs */}
                        <div className="lg:col-span-1 bg-[#0F1115] border border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-xl h-[250px] lg:h-auto">
                            <div className="p-3 md:p-4 bg-white/5 border-b border-white/5 flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <Terminal size={14} className="text-white/40" />
                                    <span className="text-[10px] md:text-xs font-bold text-white/60 uppercase tracking-widest">API Activity</span>
                                </div>
                                <div className={`w-1.5 h-1.5 rounded-full ${logs.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-white/20'}`} />
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 font-mono text-[10px] md:text-[11px] space-y-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                                {logs.length > 0 ? (
                                    <AnimatePresence initial={false}>
                                        {logs.map((log, i) => (
                                            <motion.div
                                                key={log.id || `${log.timestamp}-${i}`}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                className="flex items-center gap-2 md:gap-3 p-1.5 md:p-2 rounded hover:bg-white/5 transition-colors border-l-2 border-transparent hover:border-emerald-500/50"
                                            >
                                                <span className="text-white/20 select-none w-14 shrink-0">{formatTime(log.timestamp)}</span>
                                                <span className={`w-10 font-bold ${log.method === 'GET' ? 'text-blue-400' :
                                                    log.method === 'POST' ? 'text-emerald-400' :
                                                        log.method === 'PUT' ? 'text-amber-400' :
                                                            log.method === 'DELETE' ? 'text-red-400' :
                                                                log.method === 'VIEW' ? 'text-violet-400' : 'text-white/40'
                                                    }`}>{log.method}</span>
                                                <span className="flex-1 text-white/60 truncate" title={log.path}>{log.path}</span>
                                                <span className={`${log.status >= 400 ? 'text-red-400' : log.status >= 300 ? 'text-amber-400' : 'text-emerald-400'}`}>{log.status}</span>
                                                {log.duration > 0 && (
                                                    <span className="text-white/20 text-[9px]">{log.duration}ms</span>
                                                )}
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                ) : (
                                    <div className="flex items-center justify-center h-full text-white/20 text-xs">
                                        <p>No recent API activity</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* PROVIDERS TABLE */}
                    <div className="mt-6 md:mt-8 bg-[#0F1115] border border-white/10 rounded-2xl p-4 md:p-6 shadow-xl">
                        <div className="flex items-center gap-2 mb-4 md:mb-6">
                            <Globe className="text-indigo-400" size={18} />
                            <h3 className="text-white font-semibold text-sm md:text-base">Provider Network Status</h3>
                            <span className="ml-auto text-[10px] text-white/30">
                                {metrics.providers.active}/{metrics.providers.total} active
                            </span>
                        </div>

                        {metrics && metrics.providers.providers.length > 0 ? (
                            <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
                                <table className="w-full text-xs md:text-sm text-left whitespace-nowrap lg:whitespace-normal">
                                    <thead>
                                        <tr className="text-[10px] md:text-xs text-white/30 uppercase tracking-wider border-b border-white/5">
                                            <th className="pb-3 md:pb-4 pl-2 md:pl-4 font-medium">Provider</th>
                                            <th className="pb-3 md:pb-4 font-medium text-center">Status</th>
                                            <th className="pb-3 md:pb-4 font-medium text-right">Balance</th>
                                            <th className="pb-3 md:pb-4 pr-2 md:pr-4 font-medium text-right">Last Sync</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {metrics.providers.providers.map((p) => (
                                            <tr key={p.name} className="group hover:bg-white/[0.02] transition-colors">
                                                <td className="py-3 md:py-4 pl-2 md:pl-4">
                                                    <div className="font-medium text-white group-hover:text-emerald-400 transition-colors">{p.displayName}</div>
                                                    <div className="text-[9px] md:text-[10px] text-white/30 font-mono">{p.name.toUpperCase()}</div>
                                                </td>
                                                <td className="py-3 md:py-4 text-center">
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold border ${p.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                        p.status === 'syncing' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                            'bg-red-500/10 text-red-400 border-red-500/20'
                                                        }`}>
                                                        {p.status?.toUpperCase() || 'UNKNOWN'}
                                                    </span>
                                                </td>
                                                <td className="py-3 md:py-4 text-right">
                                                    <div className="font-mono font-medium text-white">{p.balance.toFixed(2)}</div>
                                                    <div className="text-[9px] md:text-[10px] text-white/30">{p.currency}</div>
                                                </td>
                                                <td className="py-3 md:py-4 pr-2 md:pr-4 text-right text-white/40 font-mono text-[10px] md:text-xs">
                                                    {p.lastSync ? formatTime(p.lastSync) : 'Never'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-8 text-center text-white/20 italic text-sm">No providers configured.</div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
