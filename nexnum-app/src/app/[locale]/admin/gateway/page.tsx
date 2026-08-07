"use client"

import React, { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Smartphone, Server, Shield, Activity, RefreshCw, CheckCircle,
    XCircle, AlertCircle, Ban, Play, Terminal, Cpu, Battery, Wifi,
    Clock, Search, ArrowRight, Zap, Filter, ArrowUpDown, ChevronLeft,
    ChevronRight, ChevronsLeft, ChevronsRight, Check, Sparkles, Copy
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils/utils"

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

type DeviceSortField = 'phoneNumber' | 'deviceId' | 'simSlot' | 'carrier' | 'schemaType' | 'status' | 'battery' | 'isBanned'
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

    // Pagination & Sorting State for Live Activations
    const [actPage, setActPage] = useState(1)
    const [actLimit, setActLimit] = useState(25)
    const [actTotal, setActTotal] = useState(0)
    const [actTotalPages, setActTotalPages] = useState(1)
    const [actSortBy, setActSortBy] = useState<string>('created')
    const [actSortOrder, setActSortOrder] = useState<SortOrder>('desc')

    // Live Pattern Sandbox State
    const [testService, setTestService] = useState("tg")
    const [testSender, setTestSender] = useState("Telegram")
    const [testBody, setTestBody] = useState("Your Telegram login code is: 84920")
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
                                            <td colSpan={7} className="py-8 text-center text-zinc-500 font-bold uppercase tracking-wider">
                                                No hardware device SIM nodes found matching your criteria.
                                            </td>
                                        </tr>
                                    ) : (
                                        devices.map((d) => (
                                            <tr key={`${d.deviceId}_${d.simSlot}`} className="hover:bg-zinc-800/30 transition-colors">
                                                {/* Phone Number */}
                                                <td className="py-3.5 pr-4">
                                                    {d.phoneNumber && d.phoneNumber !== "Pending" ? (
                                                        <span className="inline-flex items-center gap-1.5 text-white font-mono font-black">
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

                                                {/* Actions */}
                                                <td className="py-3.5 pl-4 text-right">
                                                    <button
                                                        onClick={() => handleBanToggle(d.deviceId, d.isBanned)}
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
                                <option value="tg">Telegram (tg)</option>
                                <option value="wa">WhatsApp (wa)</option>
                                <option value="go">Google (go)</option>
                                <option value="ig">Instagram (ig)</option>
                                <option value="fb">Facebook (fb)</option>
                                <option value="tw">Twitter (tw)</option>
                                <option value="ub">Uber (ub)</option>
                                <option value="ot">Other / Universal (ot)</option>
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
                                    <span className="text-[10px] font-mono text-zinc-500">
                                        Latency: {testResult.executionTimeMs}ms
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
                                    {testResult.extractedCode && (
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
                                    )}

                                    {/* Payload Detail Breakdown */}
                                    <div className="rounded-lg border-2 border-zinc-800 bg-zinc-900 p-3 font-mono text-xs space-y-1 text-zinc-300">
                                        <div><span className="text-zinc-500">Service:</span> {testResult.serviceCode}</div>
                                        <div><span className="text-zinc-500">Sender:</span> {testResult.sender || '—'}</div>
                                        <div><span className="text-zinc-500">Execution Time:</span> {testResult.executionTimeMs} ms</div>
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
        </main>
    )
}
