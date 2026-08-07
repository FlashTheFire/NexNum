"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Smartphone, Server, Shield, Activity, RefreshCw, CheckCircle,
    XCircle, AlertCircle, Ban, Play, Terminal, Cpu, Battery, Wifi,
    Clock, Search, ArrowRight, Zap, Filter, ArrowUpDown, ChevronLeft,
    ChevronRight, ChevronsLeft, ChevronsRight, Check, Sparkles, Copy,
    X, MessageSquare, Calendar, Key, ExternalLink, Inbox
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils/utils"

/**
 * Format timestamp into detailed professional relative time:
 * - just now (< 1 min)
 * - 1min ago, 20min ago
 * - 1hour 30min ago, 2hour 15min ago
 * - 1 day 7 hour ago, 2 day 4 hour ago
 * - 1 week ago, 1 week 3 days ago, 10 days ago
 * - 1 month ago 1 week ago, 2 months ago
 * - No messages (if 0 or null)
 */
function formatDetailedRelativeTime(timestampMs: number | string | null | undefined): string {
    if (!timestampMs) return "No messages"
    const ts = typeof timestampMs === "string" ? parseFloat(timestampMs) : timestampMs
    if (isNaN(ts) || ts <= 0) return "No messages"

    const now = Date.now()
    // Handle seconds vs milliseconds
    const ms = ts < 10000000000 ? ts * 1000 : ts
    const diff = Math.max(0, now - ms)
    const seconds = Math.floor(diff / 1000)

    if (seconds < 60) {
        return "just now"
    }

    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) {
        return `${minutes}min ago`
    }

    const hours = Math.floor(minutes / 60)
    const remMinutes = minutes % 60
    if (hours < 24) {
        if (remMinutes === 0) return `${hours}hour ago`
        return `${hours}hour ${remMinutes}min ago`
    }

    const days = Math.floor(hours / 24)
    const remHours = hours % 24
    if (days < 7) {
        if (remHours === 0) return `${days} day ago`
        return `${days} day ${remHours} hour ago`
    }

    if (days >= 7 && days < 30) {
        const weeks = Math.floor(days / 7)
        const remDays = days % 7
        if (days === 10) return "10 days ago"
        if (remDays === 0) return `${weeks} week ago`
        return `${weeks} week ${remDays} days ago`
    }

    const months = Math.floor(days / 30)
    const remWeeks = Math.floor((days % 30) / 7)
    if (months < 12) {
        if (remWeeks === 0) return `${months} month ago`
        return `${months} month ${remWeeks} week ago`
    }

    const years = Math.floor(days / 365)
    return `${years} year ago`
}

interface GatewayStats {
    status: string
    timestamp: number
    sim_nodes: {
        total_allocatable: number
        online: number
        offline: number
        gateways_schema: number
        legacy_schema: number
    }
    activations: {
        active_in_redis: number
    }
    stream: {
        name: string
        backlog_length: number
        workers_configured: number
    }
}

interface DeviceNode {
    deviceId: string
    simSlot: number
    phoneNumber: string
    carrier: string
    schemaType: string
    isOnline: boolean
    battery: number
    lastSeenMs: number
    firebaseNodeId: string
    isBanned: boolean
}

interface DeviceSmsMessage {
    id: string
    sender: string
    message: string
    timestamp: number
    otp?: string | null
    service?: string
}

interface ActivationItem {
    id: string
    userId: string
    client_id: string
    number: string
    service: string
    status: string
    created: number
    elapsedSeconds: number
}

type DeviceSortField = 'phoneNumber' | 'deviceId' | 'simSlot' | 'carrier' | 'schemaType' | 'status' | 'battery' | 'isBanned' | 'lastSeenMs' | 'lastMessage'
type SortOrder = 'asc' | 'desc'

export default function GatewayAdminPage() {
    const [activeTab, setActiveTab] = useState<'devices' | 'activations' | 'sandbox'>('devices')
    const [stats, setStats] = useState<GatewayStats | null>(null)
    const [devices, setDevices] = useState<DeviceNode[]>([])
    const [activations, setActivations] = useState<ActivationItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")

    // Pagination & Sorting State for Device SIM Fleet
    const [devicePage, setDevicePage] = useState(1)
    const [deviceLimit, setDeviceLimit] = useState(25)
    const [deviceTotal, setDeviceTotal] = useState(0)
    const [deviceTotalPages, setDeviceTotalPages] = useState(1)
    const [deviceSortBy, setDeviceSortBy] = useState<DeviceSortField>('status')
    const [deviceSortOrder, setDeviceSortOrder] = useState<SortOrder>('desc')

    // Device SMS Inspector State (Modal for last 150 messages)
    const [selectedDevice, setSelectedDevice] = useState<DeviceNode | null>(null)
    const [deviceMessages, setDeviceMessages] = useState<DeviceSmsMessage[]>([])
    const [isLoadingMessages, setIsLoadingMessages] = useState(false)
    const [msgSearchQuery, setMsgSearchQuery] = useState("")
    const [msgPage, setMsgPage] = useState(1)
    const [msgLimit, setMsgLimit] = useState(10)

    // Pagination & Sorting State for Live Activations
    const [actPage, setActPage] = useState(1)
    const [actLimit, setActLimit] = useState(25)
    const [actTotal, setActTotal] = useState(0)
    const [actTotalPages, setActTotalPages] = useState(1)
    const [actSortBy, setActSortBy] = useState<string>('created')
    const [actSortOrder, setActSortOrder] = useState<SortOrder>('desc')

    // Live Pattern Sandbox State
    const [testService, setTestService] = useState("auto")
    const [testSender, setTestSender] = useState("Telegram")
    const [testBody, setTestBody] = useState("HTTPS:SWIGGY.COM/LOGIN/83G348 is your verification code for Swiggy.")
    const [testResult, setTestResult] = useState<any>(null)
    const [isTesting, setIsTesting] = useState(false)

    // Fetch Stats
    const fetchStats = useCallback(async () => {
        try {
            const statsRes = await fetch('/api/admin/gateway?endpoint=/api/v1/admin/stats')
            if (statsRes.ok) {
                const statsData = await statsRes.json()
                setStats(statsData)
            }
        } catch {
            // silent fail for stats auto-refresh
        }
    }, [])

    // Fetch Devices with Server-Side Pagination & Sorting
    const fetchDevices = useCallback(async () => {
        try {
            setIsLoading(true)
            const endpoint = `/api/v1/admin/devices?page=${devicePage}&limit=${deviceLimit}&sort_by=${deviceSortBy}&sort_order=${deviceSortOrder}&search=${encodeURIComponent(searchQuery)}`
            const res = await fetch(`/api/admin/gateway?endpoint=${encodeURIComponent(endpoint)}`)
            if (res.ok) {
                const data = await res.json()
                setDevices(data.devices || [])
                setDeviceTotal(data.total || data.count || 0)
                setDeviceTotalPages(data.totalPages || 1)
            }
        } catch (err) {
            toast.error("Failed to load device SIM fleet")
        } finally {
            setIsLoading(false)
        }
    }, [devicePage, deviceLimit, deviceSortBy, deviceSortOrder, searchQuery])

    // Fetch Activations with Server-Side Pagination & Sorting
    const fetchActivations = useCallback(async () => {
        try {
            const endpoint = `/api/v1/admin/activations?page=${actPage}&limit=${actLimit}&sort_by=${actSortBy}&sort_order=${actSortOrder}&search=${encodeURIComponent(searchQuery)}`
            const res = await fetch(`/api/admin/gateway?endpoint=${encodeURIComponent(endpoint)}`)
            if (res.ok) {
                const data = await res.json()
                setActivations(data.activations || [])
                setActTotal(data.total || data.count || 0)
                setActTotalPages(data.totalPages || 1)
            }
        } catch {
            // silent fail for activations refresh
        }
    }, [actPage, actLimit, actSortBy, actSortOrder, searchQuery])

    // Main Gateway Data Fetcher
    const fetchAllData = useCallback(async () => {
        await Promise.all([fetchStats(), fetchDevices(), fetchActivations()])
    }, [fetchStats, fetchDevices, fetchActivations])

    useEffect(() => {
        fetchAllData()
        const interval = setInterval(fetchAllData, 12000)
        return () => clearInterval(interval)
    }, [fetchAllData])

    // Handle Header Column Click Sorting for Devices
    const handleDeviceHeaderSort = (field: DeviceSortField) => {
        if (deviceSortBy === field) {
            setDeviceSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
        } else {
            setDeviceSortBy(field)
            setDeviceSortOrder('desc')
        }
        setDevicePage(1) // Reset to page 1 on sort change
    }

    // Handle Header Column Click Sorting for Activations
    const handleActHeaderSort = (field: string) => {
        if (actSortBy === field) {
            setActSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
        } else {
            setActSortBy(field)
            setActSortOrder('desc')
        }
        setActPage(1)
    }

    // Toggle Ban Status
    const handleBanToggle = async (deviceId: string, isBanned: boolean) => {
        try {
            const action = isBanned ? 'unban' : 'ban'
            const res = await fetch('/api/admin/gateway', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: `/api/v1/admin/devices/${deviceId}/${action}`,
                    payload: {}
                })
            })
            if (res.ok) {
                toast.success(`Device ${deviceId} ${action}ned successfully`)
                fetchDevices()
            } else {
                toast.error(`Failed to ${action} device`)
            }
        } catch {
            toast.error("Action failed")
        }
    }
    // Open and load device SMS messages (up to 150)
    const handleOpenDeviceSms = async (device: DeviceNode) => {
        setSelectedDevice(device)
        setIsLoadingMessages(true)
        setMsgPage(1)
        setMsgSearchQuery("")
        try {
            const res = await fetch(`/api/admin/gateway?endpoint=${encodeURIComponent(`/api/v1/admin/devices/${device.deviceId}/messages?limit=150`)}`)
            if (res.ok) {
                const data = await res.json()
                setDeviceMessages(data.messages || [])
            } else {
                setDeviceMessages([])
            }
        } catch {
            toast.error("Failed to load device SMS messages")
            setDeviceMessages([])
        } finally {
            setIsLoadingMessages(false)
        }
    }

    // Filter & Paginate Device SMS Messages
    const filteredDeviceMessages = useMemo(() => {
        if (!msgSearchQuery.trim()) return deviceMessages
        const q = msgSearchQuery.toLowerCase()
        return deviceMessages.filter(m => 
            (m.sender || "").toLowerCase().includes(q) ||
            (m.message || "").toLowerCase().includes(q) ||
            (m.otp || "").toLowerCase().includes(q) ||
            (m.service || "").toLowerCase().includes(q)
        )
    }, [deviceMessages, msgSearchQuery])

    const totalMsgPages = Math.max(1, Math.ceil(filteredDeviceMessages.length / msgLimit))
    const paginatedDeviceMessages = useMemo(() => {
        const start = (msgPage - 1) * msgLimit
        return filteredDeviceMessages.slice(start, start + msgLimit)
    }, [filteredDeviceMessages, msgPage, msgLimit])

    // Live Real-World Pattern Match Tester
    const handleTestMatch = async () => {
        try {
            setIsTesting(true)
            const res = await fetch('/api/admin/gateway', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: '/api/v1/admin/test-match',
                    payload: {
                        serviceCode: testService,
                        sender: testSender,
                        body: testBody
                    }
                })
            })
            if (res.ok) {
                const data = await res.json()
                setTestResult(data)
                if (data.isMatched) {
                    toast.success(`Matched ${data.serviceCode.toUpperCase()} Pattern! OTP: ${data.extractedCode || 'Found'}`)
                } else {
                    toast.warning("No pattern match found for this sample SMS")
                }
            } else {
                toast.error("Pattern match test failed")
            }
        } catch {
            toast.error("Test execution failed")
        } finally {
            setIsTesting(false)
        }
    }

    return (
        <main className="min-h-screen p-4 md:p-6 lg:p-8 space-y-6 bg-[#07080a] text-zinc-100 font-sans select-none">
            {/* ── 1. Top Neo-Brutalist Header Banner ── */}
            <div className="relative w-full rounded-xl border-2 border-[hsl(var(--neon-lime))] bg-[#0d0e12] p-5 shadow-[4px_4px_0px_0px_hsl(var(--neon-lime))] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg border-2 border-black bg-[hsl(var(--neon-lime))] text-black font-black shadow-[3px_3px_0px_0px_#000] shrink-0">
                        <Smartphone className="w-7 h-7 stroke-[2.5]" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h1 className="text-2xl font-black tracking-tight text-white uppercase">
                                Hardware Gateway Command Center
                            </h1>
                            <span className="bg-[hsl(var(--neon-lime))] text-black font-black uppercase text-[10px] tracking-wider px-2 py-0.5 rounded-md border border-black shadow-[2px_2px_0px_0px_#000]">
                                NEO-INDUSTRIAL
                            </span>
                        </div>
                        <p className="text-xs text-zinc-400 font-medium">
                            Real-time management for Android multi-SIM gateways, Firebase streams & worker pools
                        </p>
                    </div>
                </div>

                <button
                    onClick={fetchAllData}
                    disabled={isLoading}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-black bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs uppercase tracking-wider shadow-[3px_3px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all shrink-0"
                >
                    <RefreshCw className={cn("w-4 h-4 stroke-[2.5]", isLoading && "animate-spin")} />
                    Refresh Gateway
                </button>
            </div>

            {/* ── 2. Neobrutalist Metric KPI Cards ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Allocatable SIMs */}
                <div className="relative rounded-xl border-2 border-zinc-800 bg-[#0d0e12] p-5 shadow-[4px_4px_0px_0px_#000] transition-all hover:border-[hsl(var(--neon-lime))]">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Allocatable SIMs</span>
                        <div className="p-2 rounded-md border-2 border-black bg-emerald-400 text-black shadow-[2px_2px_0px_0px_#000]">
                            <Smartphone className="w-4 h-4 stroke-[2.5]" />
                        </div>
                    </div>
                    <div className="text-3xl font-black text-white tracking-tight">
                        {stats?.sim_nodes.total_allocatable || 0}
                    </div>
                    <div className="text-xs font-bold text-emerald-400 mt-2 flex items-center gap-1.5">
                        <Wifi className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>{stats?.sim_nodes.online || 0} Online</span>
                        <span className="text-zinc-600">/</span>
                        <span className="text-zinc-400">{stats?.sim_nodes.offline || 0} Offline</span>
                    </div>
                </div>

                {/* Active Activations */}
                <div className="relative rounded-xl border-2 border-zinc-800 bg-[#0d0e12] p-5 shadow-[4px_4px_0px_0px_#000] transition-all hover:border-cyan-400">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Active Activations</span>
                        <div className="p-2 rounded-md border-2 border-black bg-cyan-400 text-black shadow-[2px_2px_0px_0px_#000]">
                            <Activity className="w-4 h-4 stroke-[2.5]" />
                        </div>
                    </div>
                    <div className="text-3xl font-black text-white tracking-tight">
                        {stats?.activations.active_in_redis || 0}
                    </div>
                    <div className="text-xs font-bold text-zinc-400 mt-2">
                        Tracked via Redis SET Index
                    </div>
                </div>

                {/* Stream Backlog */}
                <div className="relative rounded-xl border-2 border-zinc-800 bg-[#0d0e12] p-5 shadow-[4px_4px_0px_0px_#000] transition-all hover:border-amber-400">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Stream Backlog</span>
                        <div className="p-2 rounded-md border-2 border-black bg-amber-400 text-black shadow-[2px_2px_0px_0px_#000]">
                            <Cpu className="w-4 h-4 stroke-[2.5]" />
                        </div>
                    </div>
                    <div className="text-3xl font-black text-white tracking-tight">
                        {stats?.stream.backlog_length || 0}
                    </div>
                    <div className="text-xs font-bold text-amber-400 mt-2 flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>{stats?.stream.workers_configured || 5} Workers Processing</span>
                    </div>
                </div>

                {/* Gateway Schema */}
                <div className="relative rounded-xl border-2 border-zinc-800 bg-[#0d0e12] p-5 shadow-[4px_4px_0px_0px_#000] transition-all hover:border-purple-400">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Gateway Schema</span>
                        <div className="p-2 rounded-md border-2 border-black bg-purple-400 text-black shadow-[2px_2px_0px_0px_#000]">
                            <Server className="w-4 h-4 stroke-[2.5]" />
                        </div>
                    </div>
                    <div className="text-3xl font-black text-white tracking-tight">
                        {stats?.sim_nodes.gateways_schema || 0}
                    </div>
                    <div className="text-xs font-bold text-purple-400 mt-2">
                        SilentGate Schema ({stats?.sim_nodes.legacy_schema || 0} Legacy)
                    </div>
                </div>
            </div>

            {/* ── 3. Neobrutalist Navigation Tabs ── */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b-2 border-zinc-800 pb-4">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setActiveTab('devices')}
                        className={cn(
                            "px-4 py-2 rounded-lg border-2 font-black text-xs uppercase tracking-wider transition-all",
                            activeTab === 'devices'
                                ? "border-black bg-[hsl(var(--neon-lime))] text-black shadow-[3px_3px_0px_0px_#000]"
                                : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                        )}
                    >
                        Device SIM Fleet ({deviceTotal})
                    </button>

                    <button
                        onClick={() => setActiveTab('activations')}
                        className={cn(
                            "px-4 py-2 rounded-lg border-2 font-black text-xs uppercase tracking-wider transition-all",
                            activeTab === 'activations'
                                ? "border-black bg-cyan-400 text-black shadow-[3px_3px_0px_0px_#000]"
                                : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                        )}
                    >
                        Live Activations ({actTotal})
                    </button>

                    <button
                        onClick={() => setActiveTab('sandbox')}
                        className={cn(
                            "px-4 py-2 rounded-lg border-2 font-black text-xs uppercase tracking-wider transition-all",
                            activeTab === 'sandbox'
                                ? "border-black bg-amber-400 text-black shadow-[3px_3px_0px_0px_#000]"
                                : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                        )}
                    >
                        Pattern Sandbox
                    </button>
                </div>

                {/* Global Search Bar */}
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 stroke-[2.5]" />
                    <input
                        type="text"
                        placeholder="Search phone, device ID, carrier..."
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value)
                            setDevicePage(1)
                            setActPage(1)
                        }}
                        className="w-full pl-9 pr-4 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-white text-xs font-bold placeholder:text-zinc-500 focus:outline-none focus:border-[hsl(var(--neon-lime))] shadow-[2px_2px_0px_0px_#000] transition-colors"
                    />
                </div>
            </div>

            {/* ── 4. TAB CONTENT: DEVICE SIM FLEET ── */}
            {activeTab === 'devices' && (
                <div className="space-y-4">
                    {/* Neobrutalist Table Card Shell */}
                    <div className="rounded-xl border-2 border-zinc-800 bg-[#0d0e12] p-4 shadow-[4px_4px_0px_0px_#000] overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-zinc-800 text-[11px] font-black uppercase text-zinc-400 tracking-wider">
                                        <th
                                            onClick={() => handleDeviceHeaderSort('phoneNumber')}
                                            className="pb-3 pr-4 cursor-pointer hover:text-[hsl(var(--neon-lime))] transition-colors"
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <span>Phone Number</span>
                                                {deviceSortBy === 'phoneNumber' && (
                                                    <span className="text-[hsl(var(--neon-lime))] font-bold">{deviceSortOrder === 'asc' ? '▲' : '▼'}</span>
                                                )}
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => handleDeviceHeaderSort('deviceId')}
                                            className="pb-3 px-4 cursor-pointer hover:text-[hsl(var(--neon-lime))] transition-colors"
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <span>Device ID</span>
                                                {deviceSortBy === 'deviceId' && (
                                                    <span className="text-[hsl(var(--neon-lime))] font-bold">{deviceSortOrder === 'asc' ? '▲' : '▼'}</span>
                                                )}
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => handleDeviceHeaderSort('simSlot')}
                                            className="pb-3 px-4 cursor-pointer hover:text-[hsl(var(--neon-lime))] transition-colors"
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <span>SIM Slot</span>
                                                {deviceSortBy === 'simSlot' && (
                                                    <span className="text-[hsl(var(--neon-lime))] font-bold">{deviceSortOrder === 'asc' ? '▲' : '▼'}</span>
                                                )}
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => handleDeviceHeaderSort('carrier')}
                                            className="pb-3 px-4 cursor-pointer hover:text-[hsl(var(--neon-lime))] transition-colors"
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <span>Carrier</span>
                                                {deviceSortBy === 'carrier' && (
                                                    <span className="text-[hsl(var(--neon-lime))] font-bold">{deviceSortOrder === 'asc' ? '▲' : '▼'}</span>
                                                )}
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => handleDeviceHeaderSort('status')}
                                            className="pb-3 px-4 cursor-pointer hover:text-[hsl(var(--neon-lime))] transition-colors"
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <span>Status</span>
                                                {deviceSortBy === 'status' && (
                                                    <span className="text-[hsl(var(--neon-lime))] font-bold">{deviceSortOrder === 'asc' ? '▲' : '▼'}</span>
                                                )}
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => handleDeviceHeaderSort('battery')}
                                            className="pb-3 px-4 cursor-pointer hover:text-[hsl(var(--neon-lime))] transition-colors"
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <span>Battery</span>
                                                {deviceSortBy === 'battery' && (
                                                    <span className="text-[hsl(var(--neon-lime))] font-bold">{deviceSortOrder === 'asc' ? '▲' : '▼'}</span>
                                                )}
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => handleDeviceHeaderSort('lastSeenMs')}
                                            className="pb-3 px-4 cursor-pointer hover:text-[hsl(var(--neon-lime))] transition-colors"
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <span>Last Message</span>
                                                {(deviceSortBy === 'lastSeenMs' || deviceSortBy === 'lastMessage') && (
                                                    <span className="text-[hsl(var(--neon-lime))] font-bold">{deviceSortOrder === 'asc' ? '▲' : '▼'}</span>
                                                )}
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => handleDeviceHeaderSort('isBanned')}
                                            className="pb-3 pl-4 text-right cursor-pointer hover:text-[hsl(var(--neon-lime))] transition-colors"
                                        >
                                            <div className="flex items-center justify-end gap-1.5">
                                                <span>Actions</span>
                                                {deviceSortBy === 'isBanned' && (
                                                    <span className="text-[hsl(var(--neon-lime))] font-bold">{deviceSortOrder === 'asc' ? '▲' : '▼'}</span>
                                                )}
                                            </div>
                                        </th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-zinc-800/60 text-xs font-bold">
                                    {devices.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="py-8 text-center text-zinc-500 font-bold uppercase tracking-wider">
                                                No hardware device SIM nodes found matching your criteria.
                                            </td>
                                        </tr>
                                    ) : (
                                        devices.map((d) => (
                                            <tr 
                                                key={`${d.deviceId}_${d.simSlot}`} 
                                                onClick={() => handleOpenDeviceSms(d)}
                                                className="hover:bg-zinc-800/40 cursor-pointer transition-colors group"
                                            >
                                                {/* Phone Number */}
                                                <td className="py-3.5 pr-4">
                                                    {d.phoneNumber && d.phoneNumber !== "Pending" ? (
                                                        <span className="inline-flex items-center gap-1.5 text-white font-mono font-black group-hover:text-[hsl(var(--neon-lime))] transition-colors">
                                                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                                            {d.phoneNumber}
                                                        </span>
                                                    ) : (
                                                        <span className="bg-zinc-800 text-zinc-400 font-bold uppercase text-[10px] px-2 py-0.5 rounded border border-zinc-700">
                                                            Pending
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Device ID */}
                                                <td className="py-3.5 px-4 font-mono text-zinc-300 text-[11px]">
                                                    {d.deviceId}
                                                </td>

                                                {/* SIM Slot */}
                                                <td className="py-3.5 px-4 text-zinc-400">
                                                    Slot {d.simSlot}
                                                </td>

                                                {/* Carrier */}
                                                <td className="py-3.5 px-4">
                                                    <span className="px-2 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-300 uppercase text-[10px] font-black">
                                                        {d.carrier}
                                                    </span>
                                                </td>

                                                {/* Status */}
                                                <td className="py-3.5 px-4">
                                                    {d.isOnline ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border-2 border-black bg-emerald-400 text-black font-black uppercase text-[10px] shadow-[2px_2px_0px_0px_#000]">
                                                            <Wifi className="w-3 h-3 stroke-[3]" />
                                                            Online
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-zinc-700 bg-zinc-800 text-zinc-400 font-black uppercase text-[10px]">
                                                            Offline
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Battery */}
                                                <td className="py-3.5 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-16 h-2 rounded-full bg-zinc-800 overflow-hidden border border-zinc-700">
                                                            <div
                                                                className={cn(
                                                                    "h-full transition-all",
                                                                    d.battery > 50 ? "bg-emerald-400" : d.battery > 20 ? "bg-amber-400" : "bg-rose-500"
                                                                )}
                                                                style={{ width: `${Math.min(100, Math.max(0, d.battery))}%` }}
                                                            />
                                                        </div>
                                                        <span className="font-mono text-xs font-black text-zinc-300">
                                                            {d.battery}%
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Last Message Column */}
                                                <td className="py-3.5 px-4">
                                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900/90 text-zinc-300 font-mono text-[11px] group-hover:border-[hsl(var(--neon-lime))] group-hover:text-[hsl(var(--neon-lime))] transition-colors">
                                                        <Clock className="w-3 h-3 text-zinc-500 group-hover:text-[hsl(var(--neon-lime))]" />
                                                        {formatDetailedRelativeTime(d.lastSeenMs)}
                                                    </span>
                                                </td>

                                                {/* Actions */}
                                                <td className="py-3.5 pl-4 text-right">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            handleBanToggle(d.deviceId, d.isBanned)
                                                        }}
                                                        className={cn(
                                                            "px-3 py-1 rounded-md border-2 border-black font-black text-[10px] uppercase tracking-wider shadow-[2px_2px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all",
                                                            d.isBanned
                                                                ? "bg-emerald-400 text-black hover:bg-emerald-300"
                                                                : "bg-rose-500 text-white hover:bg-rose-600"
                                                        )}
                                                    >
                                                        {d.isBanned ? "Unban" : "Ban"}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* ── High-Scale Pagination Controls ── */}
                        <div className="mt-4 pt-4 border-t-2 border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs font-bold text-zinc-400">
                            <div className="flex items-center gap-2">
                                <span>Show</span>
                                <select
                                    value={deviceLimit}
                                    onChange={(e) => {
                                        setDeviceLimit(Number(e.target.value))
                                        setDevicePage(1)
                                    }}
                                    className="px-2 py-1 rounded border-2 border-zinc-800 bg-zinc-900 text-white font-bold text-xs focus:outline-none focus:border-[hsl(var(--neon-lime))]"
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                                <span>entries per page (Total {deviceTotal})</span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setDevicePage(1)}
                                    disabled={devicePage === 1}
                                    className="p-1.5 rounded border-2 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-white disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <ChevronsLeft className="w-4 h-4 stroke-[2.5]" />
                                </button>
                                <button
                                    onClick={() => setDevicePage(prev => Math.max(1, prev - 1))}
                                    disabled={devicePage === 1}
                                    className="p-1.5 rounded border-2 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-white disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
                                </button>

                                <span className="px-3 py-1 rounded border-2 border-black bg-[hsl(var(--neon-lime))] text-black font-black text-xs shadow-[2px_2px_0px_0px_#000]">
                                    Page {devicePage} of {deviceTotalPages}
                                </span>

                                <button
                                    onClick={() => setDevicePage(prev => Math.min(deviceTotalPages, prev + 1))}
                                    disabled={devicePage >= deviceTotalPages}
                                    className="p-1.5 rounded border-2 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-white disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                                </button>
                                <button
                                    onClick={() => setDevicePage(deviceTotalPages)}
                                    disabled={devicePage >= deviceTotalPages}
                                    className="p-1.5 rounded border-2 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-white disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <ChevronsRight className="w-4 h-4 stroke-[2.5]" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 5. TAB CONTENT: LIVE ACTIVATIONS ── */}
            {activeTab === 'activations' && (
                <div className="space-y-4">
                    <div className="rounded-xl border-2 border-zinc-800 bg-[#0d0e12] p-4 shadow-[4px_4px_0px_0px_#000] overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-zinc-800 text-[11px] font-black uppercase text-zinc-400 tracking-wider">
                                        <th onClick={() => handleActHeaderSort('id')} className="pb-3 pr-4 cursor-pointer hover:text-cyan-400">
                                            Activation ID
                                        </th>
                                        <th onClick={() => handleActHeaderSort('number')} className="pb-3 px-4 cursor-pointer hover:text-cyan-400">
                                            Phone Number
                                        </th>
                                        <th onClick={() => handleActHeaderSort('service')} className="pb-3 px-4 cursor-pointer hover:text-cyan-400">
                                            Service
                                        </th>
                                        <th onClick={() => handleActHeaderSort('client_id')} className="pb-3 px-4 cursor-pointer hover:text-cyan-400">
                                            Device ID
                                        </th>
                                        <th onClick={() => handleActHeaderSort('elapsedSeconds')} className="pb-3 px-4 cursor-pointer hover:text-cyan-400">
                                            Elapsed Time
                                        </th>
                                        <th onClick={() => handleActHeaderSort('status')} className="pb-3 pl-4 text-right cursor-pointer hover:text-cyan-400">
                                            Status
                                        </th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-zinc-800/60 text-xs font-bold">
                                    {activations.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="py-8 text-center text-zinc-500 font-bold uppercase tracking-wider">
                                                No active SMS activations in Redis right now.
                                            </td>
                                        </tr>
                                    ) : (
                                        activations.map((a) => (
                                            <tr key={a.id} className="hover:bg-zinc-800/30 transition-colors">
                                                <td className="py-3.5 pr-4 font-mono text-cyan-400 font-black">
                                                    {a.id}
                                                </td>
                                                <td className="py-3.5 px-4 font-mono text-white font-black">
                                                    {a.number}
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <span className="px-2 py-0.5 rounded border border-black bg-cyan-400 text-black font-black uppercase text-[10px]">
                                                        {a.service}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4 font-mono text-zinc-400 text-[11px]">
                                                    {a.client_id}
                                                </td>
                                                <td className="py-3.5 px-4 text-amber-400 font-mono">
                                                    {a.elapsedSeconds}s
                                                </td>
                                                <td className="py-3.5 pl-4 text-right">
                                                    <span className="px-2 py-0.5 rounded border-2 border-black bg-emerald-400 text-black font-black uppercase text-[10px] shadow-[2px_2px_0px_0px_#000]">
                                                        {a.status || 'Active'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Activations Pagination */}
                        <div className="mt-4 pt-4 border-t-2 border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs font-bold text-zinc-400">
                            <div>Total {actTotal} active activations</div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setActPage(prev => Math.max(1, prev - 1))}
                                    disabled={actPage === 1}
                                    className="p-1.5 rounded border-2 border-zinc-800 bg-zinc-900 text-white disabled:opacity-30"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="px-3 py-1 rounded border-2 border-black bg-cyan-400 text-black font-black text-xs shadow-[2px_2px_0px_0px_#000]">
                                    Page {actPage} of {actTotalPages}
                                </span>
                                <button
                                    onClick={() => setActPage(prev => Math.min(actTotalPages, prev + 1))}
                                    disabled={actPage >= actTotalPages}
                                    className="p-1.5 rounded border-2 border-zinc-800 bg-zinc-900 text-white disabled:opacity-30"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 6. TAB CONTENT: REAL-WORLD PATTERN SANDBOX ── */}
            {activeTab === 'sandbox' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Sandbox Controls Card */}
                    <div className="rounded-xl border-2 border-black bg-[#0d0e12] p-5 shadow-[4px_4px_0px_0px_hsl(var(--neon-lime))] space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="p-2 rounded-md border-2 border-black bg-amber-400 text-black shadow-[2px_2px_0px_0px_#000]">
                                <Terminal className="w-5 h-5 stroke-[2.5]" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white uppercase">Real-Time Pattern Sandbox</h3>
                                <p className="text-xs text-zinc-400 font-medium">Test incoming SMS text against live server regex rules</p>
                            </div>
                        </div>

                        {/* Service Selection */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black uppercase text-zinc-400">Target Service Code</label>
                            <select
                                value={testService}
                                onChange={(e) => setTestService(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-white font-bold text-xs focus:outline-none focus:border-[hsl(var(--neon-lime))]"
                            >
                                <option value="auto">✨ Auto-Detect All Services (auto)</option>
                                <option value="tg">Telegram (tg)</option>
                                <option value="wa">WhatsApp (wa)</option>
                                <option value="go">Google / YouTube (go)</option>
                                <option value="ig">Instagram (ig)</option>
                                <option value="fb">Facebook (fb)</option>
                                <option value="tw">Twitter / X (tw)</option>
                                <option value="oi">Tinder (oi)</option>
                                <option value="ub">Uber (ub)</option>
                                <option value="am">Amazon (am)</option>
                                <option value="mm">Microsoft / Outlook (mm)</option>
                                <option value="wx">Apple / iCloud (wx)</option>
                                <option value="lf">TikTok (lf)</option>
                                <option value="fk">Flipkart (fk)</option>
                                <option value="sw">Swiggy (sw)</option>
                                <option value="zo">Zomato (zo)</option>
                                <option value="me">Meesho (me)</option>
                                <option value="pm">Paytm (pm)</option>
                                <option value="pp">PhonePe (pp)</option>
                                <option value="d1">Dream11 (d1)</option>
                                <option value="tc">Truecaller (tc)</option>
                                <option value="ds">Discord (ds)</option>
                                <option value="vi">Viber (vi)</option>
                                <option value="sn">Snapchat (sn)</option>
                                <option value="ya">Yahoo (ya)</option>
                                <option value="ot">Other / Universal Fallback (ot)</option>
                            </select>
                        </div>

                        {/* Sender ID */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black uppercase text-zinc-400">Sender ID / Phone</label>
                            <input
                                type="text"
                                value={testSender}
                                onChange={(e) => setTestSender(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-white font-bold text-xs focus:outline-none focus:border-[hsl(var(--neon-lime))]"
                            />
                        </div>

                        {/* SMS Body Text */}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black uppercase text-zinc-400">SMS Body Text</label>
                            <textarea
                                rows={3}
                                value={testBody}
                                onChange={(e) => setTestBody(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-white font-bold text-xs focus:outline-none focus:border-[hsl(var(--neon-lime))]"
                            />
                        </div>

                        <button
                            onClick={handleTestMatch}
                            disabled={isTesting}
                            className="w-full py-3 rounded-lg border-2 border-black bg-[hsl(var(--neon-lime))] text-black font-black text-xs uppercase tracking-wider shadow-[3px_3px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none hover:bg-[hsl(var(--neon-lime))/90] transition-all flex items-center justify-center gap-2"
                        >
                            <Play className="w-4 h-4 stroke-[3]" />
                            {isTesting ? "Executing Live Match..." : "Execute Real Pattern Test"}
                        </button>
                    </div>

                    {/* Sandbox Result Output */}
                    <div className="rounded-xl border-2 border-zinc-800 bg-[#0d0e12] p-5 shadow-[4px_4px_0px_0px_#000] space-y-4 flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between border-b-2 border-zinc-800 pb-3 mb-4">
                                <span className="text-xs font-black uppercase tracking-wider text-zinc-400">Live Execution Result</span>
                                {testResult && (
                                    <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 font-bold">
                                        Latency: {testResult.executionTimeMs} ms
                                    </span>
                                )}
                            </div>

                            {testResult ? (
                                <div className="space-y-4">
                                    {/* Match Status Badge */}
                                    <div className="flex items-center gap-3">
                                        {testResult.isMatched ? (
                                            <div className="px-3 py-1.5 rounded-lg border-2 border-black bg-emerald-400 text-black font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_0px_#000] flex items-center gap-1.5">
                                                <CheckCircle className="w-4 h-4 stroke-[2.5]" />
                                                MATCH SUCCESSFUL
                                            </div>
                                        ) : (
                                            <div className="px-3 py-1.5 rounded-lg border-2 border-black bg-rose-500 text-white font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_0px_#000] flex items-center gap-1.5">
                                                <XCircle className="w-4 h-4 stroke-[2.5]" />
                                                NO MATCH FOUND
                                            </div>
                                        )}
                                    </div>

                                    {/* Extracted OTP Callout Box */}
                                    {testResult.extractedCode ? (
                                        <div className="rounded-xl border-2 border-black bg-[hsl(var(--neon-lime))] p-4 shadow-[3px_3px_0px_0px_#000] text-black">
                                            <div className="text-[10px] font-black uppercase tracking-wider opacity-80 mb-1">
                                                EXTRACTED VERIFICATION CODE
                                            </div>
                                            <div className="text-3xl font-black font-mono tracking-widest flex items-center justify-between">
                                                <span>{testResult.extractedCode}</span>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(testResult.extractedCode)
                                                        toast.success("Code copied to clipboard!")
                                                    }}
                                                    className="p-2 rounded border border-black bg-black text-white hover:bg-zinc-800 shadow-[1px_1px_0px_0px_#000]"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ) : testResult.isMatched ? (
                                        <div className="rounded-xl border-2 border-amber-400 bg-amber-950/40 p-3 text-amber-300 text-xs font-bold flex items-center gap-2">
                                            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                                            <span>Service pattern matched, but no verification code digits were present in the SMS text.</span>
                                        </div>
                                    ) : null}

                                    {/* Payload & Regex Pattern Breakdown Grid */}
                                    <div className="rounded-lg border-2 border-zinc-800 bg-zinc-900 p-4 font-mono text-xs space-y-2 text-zinc-300">
                                        <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                                            <span className="text-zinc-500 font-bold uppercase text-[10px]">Service:</span>
                                            <span className="text-white font-bold">{testResult.serviceName || (testResult.matchedServiceCode || testResult.serviceCode)?.toUpperCase()} ({testResult.matchedServiceCode || testResult.serviceCode})</span>
                                        </div>
                                        <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                                            <span className="text-zinc-500 font-bold uppercase text-[10px]">Sender Tested:</span>
                                            <span className="text-white font-bold">{testResult.sender || '—'}</span>
                                        </div>
                                        <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                                            <span className="text-zinc-500 font-bold uppercase text-[10px]">Matched Sender Pattern:</span>
                                            <span className="text-emerald-400 font-bold">{testResult.matchedSenderPattern || '—'}</span>
                                        </div>
                                        <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                                            <span className="text-zinc-500 font-bold uppercase text-[10px]">Matched Body Pattern:</span>
                                            <span className="text-emerald-400 font-bold">{testResult.matchedBodyPattern || '—'}</span>
                                        </div>
                                        <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5">
                                            <span className="text-zinc-500 font-bold uppercase text-[10px]">OTP Regex Rule:</span>
                                            <span className="text-cyan-400 font-bold">{testResult.otpRegex || '\\b(\\d{4,8})\\b'}</span>
                                        </div>
                                        <div className="flex items-center justify-between pt-1">
                                            <span className="text-zinc-500 font-bold uppercase text-[10px]">Execution Latency:</span>
                                            <span className="text-amber-400 font-bold">{testResult.executionTimeMs} ms</span>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="py-12 text-center text-zinc-500 font-bold uppercase tracking-wider text-xs">
                                    Run a pattern match test to inspect live regex parsing.
                                </div>
                            )}
                        </div>

                        <div className="text-[11px] text-zinc-500 font-medium border-t border-zinc-800 pt-3 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                            <span>Matches directly against live FastAPI regex engine in nexnum-bot</span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 5. DEVICE SMS INSPECTOR MODAL (LAST 150 SMS) ── */}
            <AnimatePresence>
                {selectedDevice && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 md:p-10 bg-black/80 backdrop-blur-md">
                        {/* Backdrop Click Dismiss */}
                        <div 
                            className="absolute inset-0"
                            onClick={() => setSelectedDevice(null)}
                        />

                        {/* Modal Container */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border-2 border-zinc-800 bg-[#0d0e12] shadow-[8px_8px_0px_0px_#000] overflow-hidden z-10"
                        >
                            {/* Modal Header */}
                            <div className="p-5 sm:p-6 border-b-2 border-zinc-800 bg-zinc-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <div className="p-2 rounded-lg border-2 border-black bg-[hsl(var(--neon-lime))] text-black shadow-[2px_2px_0px_0px_#000]">
                                            <Inbox className="w-5 h-5 stroke-[2.5]" />
                                        </div>
                                        <h2 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2">
                                            {selectedDevice.phoneNumber && selectedDevice.phoneNumber !== "Pending" ? (
                                                <span className="font-mono text-[hsl(var(--neon-lime))]">
                                                    {selectedDevice.phoneNumber}
                                                </span>
                                            ) : (
                                                <span className="text-zinc-400">Device {selectedDevice.deviceId}</span>
                                            )}
                                        </h2>

                                        {/* Copy Phone Button */}
                                        {selectedDevice.phoneNumber && selectedDevice.phoneNumber !== "Pending" && (
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(selectedDevice.phoneNumber)
                                                    toast.success("Phone number copied to clipboard")
                                                }}
                                                className="p-1.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white hover:border-[hsl(var(--neon-lime))] transition-colors"
                                                title="Copy Phone Number"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                            </button>
                                        )}

                                        {/* Badges */}
                                        <span className="px-2 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-300 font-mono text-[10px] font-bold">
                                            Slot {selectedDevice.simSlot}
                                        </span>
                                        <span className="px-2 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-300 text-[10px] font-black uppercase">
                                            {selectedDevice.carrier}
                                        </span>
                                        {selectedDevice.isOnline ? (
                                            <span className="px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-bold uppercase text-[10px] flex items-center gap-1">
                                                <Wifi className="w-3 h-3 stroke-[2.5]" />
                                                Online
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-400 font-bold uppercase text-[10px]">
                                                Offline
                                            </span>
                                        )}
                                        <span className="px-2 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-300 font-mono text-[10px] font-bold flex items-center gap-1">
                                            <Battery className="w-3 h-3 text-zinc-400" />
                                            {selectedDevice.battery}%
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-400 font-medium">
                                        Device ID: <span className="font-mono text-zinc-300 font-bold">{selectedDevice.deviceId}</span> • Node: <span className="font-mono text-zinc-300">{selectedDevice.firebaseNodeId}</span> • Last Activity: <span className="text-[hsl(var(--neon-lime))] font-bold">{formatDetailedRelativeTime(selectedDevice.lastSeenMs)}</span>
                                    </p>
                                </div>

                                {/* Close Button */}
                                <button
                                    onClick={() => setSelectedDevice(null)}
                                    className="self-start sm:self-center p-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-[hsl(var(--neon-lime))] hover:bg-zinc-800 shadow-[2px_2px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all"
                                >
                                    <X className="w-5 h-5 stroke-[2.5]" />
                                </button>
                            </div>

                            {/* Modal Subheader / Search & Controls */}
                            <div className="p-4 border-b-2 border-zinc-800 bg-[#0d0e12] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 stroke-[2.5]" />
                                    <input
                                        type="text"
                                        placeholder="Search message text, sender, OTP code..."
                                        value={msgSearchQuery}
                                        onChange={(e) => {
                                            setMsgSearchQuery(e.target.value)
                                            setMsgPage(1)
                                        }}
                                        className="w-full pl-9 pr-4 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-white text-xs font-bold placeholder:text-zinc-500 focus:outline-none focus:border-[hsl(var(--neon-lime))] shadow-[2px_2px_0px_0px_#000] transition-colors"
                                    />
                                </div>

                                <div className="flex items-center gap-3 self-end sm:self-center">
                                    <div className="text-[11px] font-bold text-zinc-400">
                                        Showing <span className="text-white">{filteredDeviceMessages.length}</span> of <span className="text-[hsl(var(--neon-lime))] font-mono font-black">{deviceMessages.length}</span> SMS (Max 150)
                                    </div>
                                    <select
                                        value={msgLimit}
                                        onChange={(e) => {
                                            setMsgLimit(Number(e.target.value))
                                            setMsgPage(1)
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-white font-bold text-xs focus:outline-none focus:border-[hsl(var(--neon-lime))]"
                                    >
                                        <option value={10}>10 / page</option>
                                        <option value={25}>25 / page</option>
                                        <option value={50}>50 / page</option>
                                    </select>
                                </div>
                            </div>

                            {/* Modal Body / Message List */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 min-h-[300px]">
                                {isLoadingMessages ? (
                                    <div className="py-16 flex flex-col items-center justify-center gap-3 text-zinc-400">
                                        <RefreshCw className="w-8 h-8 animate-spin text-[hsl(var(--neon-lime))]" />
                                        <span className="text-xs font-black uppercase tracking-wider">Loading device SMS stream...</span>
                                    </div>
                                ) : paginatedDeviceMessages.length === 0 ? (
                                    <div className="py-16 text-center text-zinc-500 font-bold uppercase tracking-wider text-xs border-2 border-dashed border-zinc-800 rounded-xl p-8">
                                        {msgSearchQuery ? "No SMS messages matching search query." : "No incoming SMS messages logged for this device yet."}
                                    </div>
                                ) : (
                                    paginatedDeviceMessages.map((msg, idx) => (
                                        <div 
                                            key={msg.id || idx}
                                            className="rounded-xl border-2 border-zinc-800 bg-zinc-950 p-4 shadow-[3px_3px_0px_0px_#000] hover:border-zinc-700 transition-colors flex flex-col gap-2.5"
                                        >
                                            {/* Message Meta Row */}
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                                <div className="flex items-center gap-2">
                                                    <span className="px-2.5 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-white font-black text-xs uppercase tracking-wider">
                                                        {msg.sender || "UNKNOWN"}
                                                    </span>
                                                    {msg.otp && (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border-2 border-black bg-[hsl(var(--neon-lime))] text-black font-mono font-black text-xs shadow-[1px_1px_0px_0px_#000]">
                                                            <Key className="w-3 h-3 stroke-[2.5]" />
                                                            OTP: {msg.otp}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1">
                                                        <Clock className="w-3 h-3 text-zinc-500" />
                                                        {formatDetailedRelativeTime(msg.timestamp)}
                                                    </span>
                                                    {msg.timestamp > 0 && (
                                                        <span className="text-[10px] text-zinc-600 font-mono hidden md:inline">
                                                            ({new Date(msg.timestamp < 10000000000 ? msg.timestamp * 1000 : msg.timestamp).toLocaleString()})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Message Text Body */}
                                            <div className="rounded-lg bg-zinc-900/80 border border-zinc-800/80 p-3 text-xs font-mono text-zinc-200 leading-relaxed break-words whitespace-pre-wrap select-text">
                                                {msg.message || "—"}
                                            </div>

                                            {/* Actions Row */}
                                            <div className="flex items-center justify-end gap-2 pt-1">
                                                {msg.otp && (
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(msg.otp!)
                                                            toast.success(`OTP ${msg.otp} copied to clipboard`)
                                                        }}
                                                        className="px-2.5 py-1 rounded border border-zinc-700 bg-zinc-900 text-xs font-bold text-[hsl(var(--neon-lime))] hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
                                                    >
                                                        <Copy className="w-3 h-3" />
                                                        Copy OTP
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(msg.message)
                                                        toast.success("SMS body copied to clipboard")
                                                    }}
                                                    className="px-2.5 py-1 rounded border border-zinc-700 bg-zinc-900 text-xs font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5"
                                                >
                                                    <Copy className="w-3 h-3" />
                                                    Copy Text
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Modal Footer / Pagination */}
                            <div className="p-4 border-t-2 border-zinc-800 bg-zinc-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs font-bold text-zinc-400">
                                <div>
                                    Page <span className="text-white font-black">{msgPage}</span> of <span className="text-white font-black">{totalMsgPages}</span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                    <button
                                        onClick={() => setMsgPage(1)}
                                        disabled={msgPage === 1}
                                        className="p-2 rounded border-2 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-[1px_1px_0px_0px_#000]"
                                        title="First Page"
                                    >
                                        <ChevronsLeft className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setMsgPage(prev => Math.max(1, prev - 1))}
                                        disabled={msgPage === 1}
                                        className="p-2 rounded border-2 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-[1px_1px_0px_0px_#000]"
                                        title="Previous Page"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>

                                    <span className="px-3 py-1 text-white font-mono font-black">
                                        {msgPage} / {totalMsgPages}
                                    </span>

                                    <button
                                        onClick={() => setMsgPage(prev => Math.min(totalMsgPages, prev + 1))}
                                        disabled={msgPage === totalMsgPages}
                                        className="p-2 rounded border-2 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-[1px_1px_0px_0px_#000]"
                                        title="Next Page"
                                    >
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setMsgPage(totalMsgPages)}
                                        disabled={msgPage === totalMsgPages}
                                        className="p-2 rounded border-2 border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-[1px_1px_0px_0px_#000]"
                                        title="Last Page"
                                    >
                                        <ChevronsRight className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </main>
    )
}
