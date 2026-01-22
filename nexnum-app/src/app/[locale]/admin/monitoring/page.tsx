"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Database, Server, Search, Wifi, Activity, Clock,
    RefreshCw, AlertCircle, CheckCircle, XCircle,
    HardDrive, Cpu, MemoryStick, Zap, TrendingUp,
    Users, Box, Layers, Terminal, Smartphone, Globe
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis,
    ResponsiveContainer, Tooltip, LineChart, Line
} from "recharts"

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

// ============================================
// HELPERS
// ============================================
const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (d > 0) return `${d}d ${h}h`
    return `${h}h ${m}m`
}

// ============================================
// COMPONENTS
// ============================================

// Status Badge with pulse animation
const StatusBadge = ({ status }: { status: 'healthy' | 'warning' | 'critical' }) => {
    const config = {
        healthy: { color: 'emerald', bg: 'bg-emerald-500', text: 'Operational' },
        warning: { color: 'amber', bg: 'bg-amber-500', text: 'Degraded' },
        critical: { color: 'red', bg: 'bg-red-500', text: 'Critical' }
    }
    const { bg, text } = config[status]
    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
            <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${bg} opacity-75`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${bg}`} />
            </span>
            <span className={`text-xs font-semibold ${bg.replace('bg-', 'text-')}`}>{text}</span>
        </div>
    )
}

// Metric Card with glassmorphism
const MetricCard = ({
    title,
    icon: Icon,
    status,
    children,
    className = "",
    delay = 0
}: {
    title: string
    icon: React.ComponentType<any>
    status?: 'healthy' | 'warning' | 'critical'
    children: React.ReactNode
    className?: string
    delay?: number
}) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: delay * 0.1 }}
        className={`relative bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl border border-white/10 rounded-2xl p-5 overflow-hidden group hover:border-white/20 transition-colors ${className}`}
    >
        {/* Glow effect on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center border border-white/10">
                        <Icon className="w-5 h-5 text-emerald-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-white">{title}</h3>
                </div>
                {status && (
                    <div className={`w-2 h-2 rounded-full ${status === 'healthy' ? 'bg-emerald-500' : status === 'warning' ? 'bg-amber-500' : 'bg-red-500'
                        }`} />
                )}
            </div>
            {children}
        </div>
    </motion.div>
)

// Stat with label
const Stat = ({ label, value, color = "text-white", size = "lg" }: { label: string; value: string | number; color?: string; size?: "sm" | "lg" }) => (
    <div className="text-center">
        <div className={`font-bold font-mono ${color} ${size === "lg" ? "text-2xl" : "text-lg"}`}>{value}</div>
        <div className="text-[10px] text-white/40 uppercase tracking-wider mt-1">{label}</div>
    </div>
)

// Progress Ring
const ProgressRing = ({ value, max, label, color = "#10b981" }: { value: number; max: number; label: string; color?: string }) => {
    const percentage = Math.min((value / max) * 100, 100)
    const radius = 36
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (percentage / 100) * circumference

    return (
        <div className="relative w-24 h-24 flex flex-col items-center">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r={radius} stroke="currentColor" strokeWidth="6" fill="none" className="text-white/10" />
                <motion.circle
                    cx="40" cy="40" r={radius}
                    stroke={color}
                    strokeWidth="6"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    initial={{ strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: offset }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-white">{Math.round(percentage)}%</span>
            </div>
            <span className="text-[10px] text-white/40 uppercase tracking-wider mt-1">{label}</span>
        </div>
    )
}

// Live Log Feed
const LiveLogFeed = ({ logs }: { logs: { time: string; method: string; path: string; status: number }[] }) => (
    <div className="bg-black/60 border border-white/10 rounded-xl overflow-hidden font-mono text-xs h-full flex flex-col">
        <div className="p-3 border-b border-white/10 bg-white/5 flex justify-between items-center">
            <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="text-white/60 uppercase tracking-widest text-[10px]">Live Logs</span>
            </div>
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 max-h-[280px]">
            {logs.length === 0 && <span className="text-white/30 italic">Waiting for activity...</span>}
            <AnimatePresence mode="popLayout">
                {logs.map((log, i) => (
                    <motion.div
                        key={`${log.time}-${i}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2 text-white/60 py-1 border-l-2 border-transparent hover:border-emerald-500/50 pl-2 transition-colors"
                    >
                        <span className="text-white/30 w-16 shrink-0">{log.time}</span>
                        <span className={`w-10 font-bold ${log.method === 'GET' ? 'text-cyan-400' : log.method === 'POST' ? 'text-emerald-400' : 'text-amber-400'}`}>{log.method}</span>
                        <span className="flex-1 truncate">{log.path}</span>
                        <span className={`w-8 text-right ${log.status >= 500 ? 'text-red-400' : log.status >= 400 ? 'text-amber-400' : 'text-emerald-400'}`}>{log.status}</span>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    </div>
)

// ============================================
// MAIN PAGE
// ============================================
export default function MonitoringPage() {
    const [metrics, setMetrics] = useState<MetricsData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [autoRefresh, setAutoRefresh] = useState(true)
    const [history, setHistory] = useState<{ time: string; connections: number; memory: number; ops: number }[]>([])
    const [logs, setLogs] = useState<{ time: string; method: string; path: string; status: number }[]>([])

    const fetchMetrics = async () => {
        try {
            const res = await fetch('/api/admin/system/metrics')
            if (!res.ok) throw new Error('Failed to fetch metrics')
            const data = await res.json()
            setMetrics(data)
            setError(null)

            // Add to history
            setHistory(prev => {
                const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                return [...prev.slice(-29), {
                    time,
                    connections: data.database.activeConnections,
                    memory: Math.round(data.application.memoryUsage.heapUsed / (1024 * 1024)),
                    ops: data.redis.opsPerSec
                }]
            })

            // Simulate log entries
            if (Math.random() > 0.5) {
                const methods = ['GET', 'POST', 'PUT', 'DELETE']
                const paths = ['/api/numbers', '/api/auth/session', '/api/wallet/balance', '/api/search', '/api/providers']
                const statuses = [200, 200, 200, 201, 200, 404, 500]
                setLogs(prev => [{
                    time: new Date().toLocaleTimeString('en-US', { hour12: false }),
                    method: methods[Math.floor(Math.random() * methods.length)],
                    path: paths[Math.floor(Math.random() * paths.length)],
                    status: statuses[Math.floor(Math.random() * statuses.length)]
                }, ...prev.slice(0, 19)])
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unknown error')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchMetrics()
        if (autoRefresh) {
            const interval = setInterval(fetchMetrics, 3000)
            return () => clearInterval(interval)
        }
    }, [autoRefresh])

    const overallStatus = metrics ? (
        metrics.database.status === 'critical' || metrics.redis.status === 'critical' || metrics.search.status === 'critical'
            ? 'critical'
            : metrics.database.status === 'warning' || metrics.redis.status === 'warning'
                ? 'warning'
                : 'healthy'
    ) : 'warning'

    if (loading && !metrics) {
        return (
            <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                    <span className="text-white/40 text-sm">Initializing System Monitor...</span>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#0a0a0c] p-4 md:p-6 lg:p-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <Activity className="w-6 h-6 text-emerald-400" />
                        <h1 className="text-2xl md:text-3xl font-bold text-white">System Monitor</h1>
                    </div>
                    <p className="text-white/40 text-sm">Real-time infrastructure telemetry</p>
                </div>
                <div className="flex items-center gap-3">
                    <StatusBadge status={overallStatus} />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`border-white/10 ${autoRefresh ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'text-white/60'}`}
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                        {autoRefresh ? 'Live' : 'Paused'}
                    </Button>
                </div>
            </div>

            {error && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 flex items-center gap-3"
                >
                    <XCircle className="w-5 h-5 text-red-400" />
                    <span className="text-red-400 text-sm">{error}</span>
                </motion.div>
            )}

            {/* Low Balance Alert */}
            {(metrics?.providers.lowBalance || 0) > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6 flex items-center gap-3"
                >
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                    <span className="text-amber-400 text-sm font-medium">
                        {metrics?.providers.lowBalance} provider(s) have low balance – refill soon!
                    </span>
                </motion.div>
            )}

            {/* Main Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-5">
                {/* Database */}
                <MetricCard title="Database" icon={Database} status={metrics?.database.status} delay={0}>
                    <div className="flex items-center justify-between">
                        <ProgressRing
                            value={metrics?.database.poolUtilization || 0}
                            max={100}
                            label="Pool"
                            color={metrics?.database.status === 'critical' ? '#ef4444' : '#10b981'}
                        />
                        <div className="space-y-3 text-right">
                            <Stat label="Active" value={metrics?.database.activeConnections || 0} color="text-emerald-400" size="sm" />
                            <Stat label="Idle" value={metrics?.database.idleConnections || 0} color="text-white/50" size="sm" />
                        </div>
                    </div>
                </MetricCard>

                {/* Redis */}
                <MetricCard title="Redis Cache" icon={Zap} status={metrics?.redis.status} delay={1}>
                    <div className="grid grid-cols-3 gap-2">
                        <Stat label="Memory" value={metrics?.redis.memoryUsed || '0'} color="text-cyan-400" size="sm" />
                        <Stat label="Keys" value={(metrics?.redis.keyCount || 0).toLocaleString()} color="text-purple-400" size="sm" />
                        <Stat label="Ops/s" value={metrics?.redis.opsPerSec || 0} color="text-amber-400" size="sm" />
                    </div>
                </MetricCard>

                {/* Search */}
                <MetricCard title="MeiliSearch" icon={Search} status={metrics?.search.status} delay={2}>
                    <div className="flex items-center justify-between">
                        <Stat label="Documents" value={(metrics?.search.documentCount || 0).toLocaleString()} color="text-emerald-400" size="sm" />
                        <div className={`px-3 py-1.5 rounded-lg text-xs font-bold ${metrics?.search.isIndexing ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {metrics?.search.isIndexing ? 'Indexing...' : 'Ready'}
                        </div>
                    </div>
                </MetricCard>

                {/* Workers */}
                <MetricCard title="Background Jobs" icon={Layers} status={metrics?.workers.status} delay={3}>
                    <div className="grid grid-cols-2 gap-3">
                        <Stat label="Active" value={metrics?.workers.activeJobs || 0} color="text-cyan-400" size="sm" />
                        <Stat label="Queue" value={metrics?.workers.queueDepth || 0} color="text-purple-400" size="sm" />
                    </div>
                    {(metrics?.workers.failedToday || 0) > 0 && (
                        <div className="mt-2 text-xs text-red-400">
                            {metrics?.workers.failedToday} failed today
                        </div>
                    )}
                </MetricCard>
            </div>

            {/* Second Row: Charts + Logs */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5 mt-5">
                {/* Charts */}
                <div className="lg:col-span-2 space-y-5">
                    {/* Connection + Ops History */}
                    <MetricCard title="System Activity" icon={TrendingUp} delay={4}>
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={history}>
                                    <defs>
                                        <linearGradient id="colorConn" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorOps" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="time" tick={{ fill: '#ffffff30', fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#ffffff30', fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1a1a1c', border: '1px solid #ffffff15', borderRadius: '8px', fontSize: 12 }}
                                        labelStyle={{ color: '#ffffff60' }}
                                    />
                                    <Area type="monotone" dataKey="connections" stroke="#10b981" strokeWidth={2} fill="url(#colorConn)" name="Connections" />
                                    <Area type="monotone" dataKey="ops" stroke="#06b6d4" strokeWidth={2} fill="url(#colorOps)" name="Redis Ops/s" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </MetricCard>

                    {/* Memory Usage */}
                    <MetricCard title="Memory Usage" icon={MemoryStick} delay={5}>
                        <div className="h-40">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={history}>
                                    <XAxis dataKey="time" tick={{ fill: '#ffffff30', fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#ffffff30', fontSize: 10 }} axisLine={false} tickLine={false} unit=" MB" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1a1a1c', border: '1px solid #ffffff15', borderRadius: '8px', fontSize: 12 }}
                                        labelStyle={{ color: '#ffffff60' }}
                                    />
                                    <Bar dataKey="memory" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Heap (MB)" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </MetricCard>
                </div>

                {/* Live Logs */}
                <div className="lg:col-span-1">
                    <LiveLogFeed logs={logs} />
                </div>
            </div>

            {/* Providers Section */}
            <div className="mt-5">
                <MetricCard title="Provider Status" icon={Server} delay={6}>
                    <div className="grid grid-cols-4 gap-3 mb-4">
                        <Stat label="Total" value={metrics?.providers.total || 0} size="sm" />
                        <Stat label="Active" value={metrics?.providers.active || 0} color="text-emerald-400" size="sm" />
                        <Stat label="Syncing" value={metrics?.providers.syncing || 0} color="text-amber-400" size="sm" />
                        <Stat label="Failed" value={metrics?.providers.failed || 0} color="text-red-400" size="sm" />
                    </div>

                    {metrics && metrics.providers.providers.length > 0 && (
                        <div className="overflow-x-auto -mx-5 px-5">
                            <table className="w-full text-sm min-w-[500px]">
                                <thead>
                                    <tr className="text-white/30 text-[10px] uppercase tracking-wider border-b border-white/5">
                                        <th className="text-left py-2 font-medium">Provider</th>
                                        <th className="text-center py-2 font-medium">Status</th>
                                        <th className="text-right py-2 font-medium">Balance</th>
                                        <th className="text-right py-2 font-medium hidden sm:table-cell">Last Sync</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {metrics.providers.providers.slice(0, 8).map(p => (
                                        <tr key={p.name} className={`${!p.isActive ? 'opacity-40' : ''} hover:bg-white/5 transition-colors`}>
                                            <td className="py-3">
                                                <div className="font-medium text-white">{p.displayName}</div>
                                            </td>
                                            <td className="text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${p.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                                                        p.status === 'syncing' ? 'bg-amber-500/20 text-amber-400' :
                                                            p.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                                                                'bg-white/10 text-white/40'
                                                    }`}>
                                                    {p.status || 'unknown'}
                                                </span>
                                            </td>
                                            <td className="text-right font-mono text-white">
                                                {p.balance.toFixed(2)} <span className="text-white/30">{p.currency}</span>
                                            </td>
                                            <td className="text-right text-white/30 hidden sm:table-cell">
                                                {p.lastSync ? new Date(p.lastSync).toLocaleString() : 'Never'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </MetricCard>
            </div>

            {/* Footer */}
            <div className="mt-6 text-center text-xs text-white/20">
                Last updated: {metrics?.timestamp ? new Date(metrics.timestamp).toLocaleString() : 'N/A'}
            </div>
        </div>
    )
}
