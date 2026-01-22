"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
    Database, Server, Search, Wifi, Activity, Clock,
    RefreshCw, AlertCircle, CheckCircle, XCircle,
    HardDrive, Cpu, MemoryStick, Zap, TrendingUp,
    Users, Box, Layers
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis,
    ResponsiveContainer, Tooltip, Cell
} from "recharts"

// Types
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

// Helper: Format bytes
const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

// Helper: Format uptime
const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return `${h}h ${m}m`
}

// Status Badge
const StatusBadge = ({ status }: { status: 'healthy' | 'warning' | 'critical' }) => {
    const config = {
        healthy: { color: 'bg-emerald-500', icon: CheckCircle, text: 'Healthy' },
        warning: { color: 'bg-amber-500', icon: AlertCircle, text: 'Warning' },
        critical: { color: 'bg-red-500', icon: XCircle, text: 'Critical' }
    }
    const { color, icon: Icon, text } = config[status]
    return (
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${color}/20`}>
            <Icon className={`w-3 h-3 ${color.replace('bg-', 'text-')}`} />
            <span className={`text-[10px] font-bold ${color.replace('bg-', 'text-')}`}>{text}</span>
        </div>
    )
}

// Metric Card Component
const MetricCard = ({
    title,
    icon: Icon,
    status,
    children,
    className = ""
}: {
    title: string
    icon: React.ComponentType<any>
    status?: 'healthy' | 'warning' | 'critical'
    children: React.ReactNode
    className?: string
}) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5 ${className}`}
    >
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="text-sm font-semibold text-white">{title}</h3>
            </div>
            {status && <StatusBadge status={status} />}
        </div>
        {children}
    </motion.div>
)

// Stat Item
const StatItem = ({ label, value, unit, color = "text-white" }: { label: string; value: string | number; unit?: string; color?: string }) => (
    <div className="text-center">
        <div className={`text-2xl font-bold ${color}`}>
            {value}
            {unit && <span className="text-xs text-white/40 ml-1">{unit}</span>}
        </div>
        <div className="text-[10px] text-white/40 uppercase tracking-wider mt-1">{label}</div>
    </div>
)

// Progress Ring
const ProgressRing = ({ value, max, color = "#10b981" }: { value: number; max: number; color?: string }) => {
    const percentage = Math.min((value / max) * 100, 100)
    const radius = 40
    const circumference = 2 * Math.PI * radius
    const offset = circumference - (percentage / 100) * circumference

    return (
        <div className="relative w-24 h-24">
            <svg className="w-24 h-24 -rotate-90">
                <circle cx="48" cy="48" r={radius} stroke="currentColor" strokeWidth="8" fill="none" className="text-white/10" />
                <circle
                    cx="48" cy="48" r={radius}
                    stroke={color}
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xl font-bold text-white">{Math.round(percentage)}%</span>
            </div>
        </div>
    )
}

export default function MonitoringPage() {
    const [metrics, setMetrics] = useState<MetricsData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [autoRefresh, setAutoRefresh] = useState(true)
    const [history, setHistory] = useState<{ time: string; connections: number; memory: number }[]>([])

    const fetchMetrics = async () => {
        try {
            const res = await fetch('/api/admin/system/metrics')
            if (!res.ok) throw new Error('Failed to fetch metrics')
            const data = await res.json()
            setMetrics(data)
            setError(null)

            // Add to history (keep last 20 points)
            setHistory(prev => {
                const newPoint = {
                    time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    connections: data.database.activeConnections,
                    memory: Math.round(data.application.memoryUsage.heapUsed / (1024 * 1024))
                }
                return [...prev.slice(-19), newPoint]
            })
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
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-[#0a0a0c] p-4 md:p-6 lg:p-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white">System Monitoring</h1>
                    <p className="text-white/40 text-sm mt-1">Real-time infrastructure health</p>
                </div>
                <div className="flex items-center gap-3">
                    <StatusBadge status={overallStatus} />
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={`border-white/10 ${autoRefresh ? 'bg-emerald-500/20 text-emerald-400' : ''}`}
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
                        {autoRefresh ? 'Live' : 'Paused'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={fetchMetrics} className="border-white/10">
                        <RefreshCw className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6 flex items-center gap-3">
                    <XCircle className="w-5 h-5 text-red-400" />
                    <span className="text-red-400 text-sm">{error}</span>
                </div>
            )}

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                {/* Database */}
                <MetricCard title="Database" icon={Database} status={metrics?.database.status}>
                    <div className="flex items-center justify-between">
                        <ProgressRing
                            value={metrics?.database.poolUtilization || 0}
                            max={100}
                            color={metrics?.database.status === 'critical' ? '#ef4444' : metrics?.database.status === 'warning' ? '#f59e0b' : '#10b981'}
                        />
                        <div className="space-y-3 text-right">
                            <StatItem label="Active" value={metrics?.database.activeConnections || 0} color="text-emerald-400" />
                            <StatItem label="Idle" value={metrics?.database.idleConnections || 0} color="text-white/60" />
                            <StatItem label="Max" value={metrics?.database.maxConnections || 10} color="text-white/40" />
                        </div>
                    </div>
                </MetricCard>

                {/* Redis */}
                <MetricCard title="Redis Cache" icon={Zap} status={metrics?.redis.status}>
                    <div className="grid grid-cols-3 gap-4">
                        <StatItem label="Memory" value={metrics?.redis.memoryUsed || '0'} color="text-cyan-400" />
                        <StatItem label="Keys" value={metrics?.redis.keyCount || 0} color="text-purple-400" />
                        <StatItem label="Ops/sec" value={metrics?.redis.opsPerSec || 0} color="text-amber-400" />
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/10 flex justify-between text-xs text-white/40">
                        <span>Peak: {metrics?.redis.memoryPeak || '0'}</span>
                        <span>Clients: {metrics?.redis.connectedClients || 0}</span>
                    </div>
                </MetricCard>

                {/* MeiliSearch */}
                <MetricCard title="Search Engine" icon={Search} status={metrics?.search.status}>
                    <div className="grid grid-cols-2 gap-4">
                        <StatItem label="Documents" value={(metrics?.search.documentCount || 0).toLocaleString()} color="text-emerald-400" />
                        <div className="text-center">
                            <div className={`text-2xl font-bold ${metrics?.search.isIndexing ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {metrics?.search.isIndexing ? 'Indexing' : 'Ready'}
                            </div>
                            <div className="text-[10px] text-white/40 uppercase tracking-wider mt-1">Status</div>
                        </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/10 text-xs text-white/40">
                        Index: <span className="text-white/60 font-mono">{metrics?.search.indexName}</span>
                    </div>
                </MetricCard>

                {/* Providers */}
                <MetricCard title="Providers" icon={Server} className="md:col-span-2 lg:col-span-1">
                    <div className="grid grid-cols-4 gap-2 text-center">
                        <StatItem label="Total" value={metrics?.providers.total || 0} />
                        <StatItem label="Active" value={metrics?.providers.active || 0} color="text-emerald-400" />
                        <StatItem label="Syncing" value={metrics?.providers.syncing || 0} color="text-amber-400" />
                        <StatItem label="Failed" value={metrics?.providers.failed || 0} color="text-red-400" />
                    </div>
                    {(metrics?.providers.lowBalance || 0) > 0 && (
                        <div className="mt-4 p-2 bg-amber-500/10 rounded-lg flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-400" />
                            <span className="text-xs text-amber-400">{metrics?.providers.lowBalance} provider(s) with low balance</span>
                        </div>
                    )}
                </MetricCard>

                {/* Workers */}
                <MetricCard title="Background Jobs" icon={Layers} status={metrics?.workers.status}>
                    <div className="grid grid-cols-2 gap-4">
                        <StatItem label="Active" value={metrics?.workers.activeJobs || 0} color="text-cyan-400" />
                        <StatItem label="Queue" value={metrics?.workers.queueDepth || 0} color="text-purple-400" />
                        <StatItem label="Completed" value={metrics?.workers.completedToday || 0} color="text-emerald-400" />
                        <StatItem label="Failed" value={metrics?.workers.failedToday || 0} color="text-red-400" />
                    </div>
                </MetricCard>

                {/* Application */}
                <MetricCard title="Application" icon={Activity}>
                    <div className="grid grid-cols-2 gap-4">
                        <StatItem label="Uptime" value={formatUptime(metrics?.application.uptime || 0)} color="text-emerald-400" />
                        <StatItem label="Heap Used" value={formatBytes(metrics?.application.memoryUsage.heapUsed || 0)} color="text-cyan-400" />
                        <StatItem label="Heap Total" value={formatBytes(metrics?.application.memoryUsage.heapTotal || 0)} color="text-white/60" />
                        <StatItem label="RSS" value={formatBytes(metrics?.application.memoryUsage.rss || 0)} color="text-purple-400" />
                    </div>
                </MetricCard>
            </div>

            {/* Charts Section */}
            {history.length > 1 && (
                <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Connections History */}
                    <MetricCard title="Connection History" icon={TrendingUp}>
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={history}>
                                    <defs>
                                        <linearGradient id="colorConnections" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="time" tick={{ fill: '#ffffff40', fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#ffffff40', fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1a1a1c', border: '1px solid #ffffff20', borderRadius: '8px' }}
                                        labelStyle={{ color: '#ffffff80' }}
                                    />
                                    <Area type="monotone" dataKey="connections" stroke="#10b981" strokeWidth={2} fill="url(#colorConnections)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </MetricCard>

                    {/* Memory History */}
                    <MetricCard title="Memory Usage (MB)" icon={MemoryStick}>
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={history}>
                                    <XAxis dataKey="time" tick={{ fill: '#ffffff40', fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#ffffff40', fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1a1a1c', border: '1px solid #ffffff20', borderRadius: '8px' }}
                                        labelStyle={{ color: '#ffffff80' }}
                                    />
                                    <Bar dataKey="memory" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </MetricCard>
                </div>
            )}

            {/* Provider Details Table */}
            {metrics && metrics.providers.providers.length > 0 && (
                <div className="mt-6">
                    <MetricCard title="Provider Details" icon={Server}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-white/40 text-[10px] uppercase tracking-wider">
                                        <th className="text-left py-2">Provider</th>
                                        <th className="text-center py-2">Status</th>
                                        <th className="text-right py-2">Balance</th>
                                        <th className="text-right py-2 hidden sm:table-cell">Last Sync</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {metrics.providers.providers.slice(0, 10).map(p => (
                                        <tr key={p.name} className={`${!p.isActive ? 'opacity-50' : ''}`}>
                                            <td className="py-3">
                                                <div className="font-medium text-white">{p.displayName}</div>
                                                <div className="text-[10px] text-white/40 font-mono">{p.name}</div>
                                            </td>
                                            <td className="text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                                                        p.status === 'syncing' ? 'bg-amber-500/20 text-amber-400' :
                                                            p.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                                                                'bg-white/10 text-white/40'
                                                    }`}>
                                                    {p.status}
                                                </span>
                                            </td>
                                            <td className="text-right font-mono text-white">
                                                {p.balance.toFixed(2)} <span className="text-white/40">{p.currency}</span>
                                            </td>
                                            <td className="text-right text-white/40 hidden sm:table-cell">
                                                {p.lastSync ? new Date(p.lastSync).toLocaleString() : 'Never'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </MetricCard>
                </div>
            )}

            {/* Footer */}
            <div className="mt-6 text-center text-xs text-white/20">
                Last updated: {metrics?.timestamp ? new Date(metrics.timestamp).toLocaleString() : 'N/A'}
            </div>
        </div>
    )
}
