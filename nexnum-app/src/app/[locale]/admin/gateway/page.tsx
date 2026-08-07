"use client"

import React, { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Smartphone, Server, Shield, Activity, RefreshCw, CheckCircle,
    XCircle, AlertCircle, Ban, Play, Terminal, Cpu, Battery, Wifi,
    Clock, Search, ArrowRight, Zap, Filter
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

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

export default function GatewayAdminPage() {
    const [activeTab, setActiveTab] = useState<'devices' | 'activations' | 'sandbox'>('devices')
    const [stats, setStats] = useState<GatewayStats | null>(null)
    const [devices, setDevices] = useState<DeviceNode[]>([])
    const [activations, setActivations] = useState<ActivationItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")

    // Sandbox state
    const [testService, setTestService] = useState("tg")
    const [testSender, setTestSender] = useState("Telegram")
    const [testBody, setTestBody] = useState("Your Telegram code is 84920")
    const [testResult, setTestResult] = useState<any>(null)
    const [isTesting, setIsTesting] = useState(false)

    const fetchGatewayData = useCallback(async () => {
        try {
            setIsLoading(true)
            // Fetch stats
            const statsRes = await fetch('/api/admin/gateway?endpoint=/api/v1/admin/stats')
            if (statsRes.ok) {
                const statsData = await statsRes.json()
                setStats(statsData)
            }

            // Fetch devices
            const devRes = await fetch('/api/admin/gateway?endpoint=/api/v1/admin/devices')
            if (devRes.ok) {
                const devData = await devRes.json()
                setDevices(devData.devices || [])
            }

            // Fetch activations
            const actRes = await fetch('/api/admin/gateway?endpoint=/api/v1/admin/activations')
            if (actRes.ok) {
                const actData = await actRes.json()
                setActivations(actData.activations || [])
            }
        } catch (err) {
            toast.error("Failed to load gateway data")
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchGatewayData()
        const interval = setInterval(fetchGatewayData, 15000)
        return () => clearInterval(interval)
    }, [fetchGatewayData])

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
                fetchGatewayData()
            } else {
                toast.error(`Failed to ${action} device`)
            }
        } catch {
            toast.error("Action failed")
        }
    }

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
            } else {
                toast.error("Pattern match test failed")
            }
        } catch {
            toast.error("Test execution failed")
        } finally {
            setIsTesting(false)
        }
    }

    const filteredDevices = devices
        .filter(d =>
            d.phoneNumber.includes(searchQuery) ||
            d.deviceId.toLowerCase().includes(searchQuery.toLowerCase()) ||
            d.carrier.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .sort((a, b) => {
            // 1. Resolved phone numbers first
            const aHasPhone = a.phoneNumber && a.phoneNumber !== "Pending" && a.phoneNumber !== "Unknown" ? 1 : 0
            const bHasPhone = b.phoneNumber && b.phoneNumber !== "Pending" && b.phoneNumber !== "Unknown" ? 1 : 0
            if (aHasPhone !== bHasPhone) return bHasPhone - aHasPhone

            // 2. Online devices next
            const aOnline = a.isOnline ? 1 : 0
            const bOnline = b.isOnline ? 1 : 0
            if (aOnline !== bOnline) return bOnline - aOnline

            // 3. Higher battery level
            return (b.battery || 0) - (a.battery || 0)
        })

    return (
        <main className="min-h-screen p-4 md:p-6 lg:p-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Smartphone className="w-7 h-7 text-[hsl(var(--neon-lime))]" />
                        Hardware Gateway Command Center
                    </h1>
                    <p className="text-sm text-white/50">
                        Real-time management for Android multi-SIM gateways, Firebase streams & worker pools
                    </p>
                </div>
                <Button
                    onClick={fetchGatewayData}
                    variant="outline"
                    className="border-white/10 text-white hover:bg-white/5 gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Metrics KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-[#0F1115] border border-white/5 rounded-xl p-5">
                    <div className="flex items-center justify-between text-white/40 mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider">Allocatable SIMs</span>
                        <Smartphone className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {stats?.sim_nodes.total_allocatable || 0}
                    </div>
                    <div className="text-xs text-emerald-400/80 mt-1 flex items-center gap-1">
                        <Wifi className="w-3 h-3" />
                        <span>{stats?.sim_nodes.online || 0} Online</span>
                        <span className="text-white/30">/</span>
                        <span className="text-white/40">{stats?.sim_nodes.offline || 0} Offline</span>
                    </div>
                </div>

                <div className="bg-[#0F1115] border border-white/5 rounded-xl p-5">
                    <div className="flex items-center justify-between text-white/40 mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider">Active Activations</span>
                        <Activity className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {stats?.activations.active_in_redis || 0}
                    </div>
                    <div className="text-xs text-white/40 mt-1">
                        Tracked via Redis SET index
                    </div>
                </div>

                <div className="bg-[#0F1115] border border-white/5 rounded-xl p-5">
                    <div className="flex items-center justify-between text-white/40 mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider">Stream Backlog</span>
                        <Zap className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {stats?.stream.backlog_length || 0}
                    </div>
                    <div className="text-xs text-amber-400/80 mt-1">
                        {stats?.stream.workers_configured || 5} Workers Processing
                    </div>
                </div>

                <div className="bg-[#0F1115] border border-white/5 rounded-xl p-5">
                    <div className="flex items-center justify-between text-white/40 mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider">Gateway Schema</span>
                        <Server className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="text-2xl font-bold text-white">
                        {stats?.sim_nodes.gateways_schema || 0}
                    </div>
                    <div className="text-xs text-white/40 mt-1">
                        SilentGate Schema ({stats?.sim_nodes.legacy_schema || 0} Legacy)
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
                <button
                    onClick={() => setActiveTab('devices')}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'devices'
                        ? 'bg-[hsl(var(--neon-lime))]/10 text-[hsl(var(--neon-lime))] border border-[hsl(var(--neon-lime))]/20'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                >
                    Device SIM Fleet ({devices.length})
                </button>
                <button
                    onClick={() => setActiveTab('activations')}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'activations'
                        ? 'bg-[hsl(var(--neon-lime))]/10 text-[hsl(var(--neon-lime))] border border-[hsl(var(--neon-lime))]/20'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                >
                    Live Activations ({activations.length})
                </button>
                <button
                    onClick={() => setActiveTab('sandbox')}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'sandbox'
                        ? 'bg-[hsl(var(--neon-lime))]/10 text-[hsl(var(--neon-lime))] border border-[hsl(var(--neon-lime))]/20'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                >
                    Pattern Sandbox
                </button>
            </div>

            {/* Tab 1: Device SIM Fleet */}
            {activeTab === 'devices' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                            <Input
                                placeholder="Search by phone number, device ID, carrier..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 bg-[#0F1115] border-white/10 text-white placeholder:text-white/30"
                            />
                        </div>
                    </div>

                    <div className="bg-[#0F1115] border border-white/5 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-white/80">
                                <thead className="bg-white/5 text-xs text-white/40 uppercase font-semibold border-b border-white/5">
                                    <tr>
                                        <th className="px-4 py-3">Phone Number</th>
                                        <th className="px-4 py-3">Device ID</th>
                                        <th className="px-4 py-3">SIM Slot</th>
                                        <th className="px-4 py-3">Carrier</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Battery</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredDevices.map((dev, idx) => (
                                        <tr key={`${dev.deviceId}-${dev.simSlot}-${idx}`} className="hover:bg-white/[0.02]">
                                            <td className="px-4 py-3 font-mono font-semibold text-white">
                                                {dev.phoneNumber}
                                            </td>
                                            <td className="px-4 py-3 text-white/60 font-mono text-xs">
                                                {dev.deviceId}
                                            </td>
                                            <td className="px-4 py-3 text-white/60">
                                                Slot {dev.simSlot}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 text-xs border border-blue-500/20">
                                                    {dev.carrier || 'Unknown'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {dev.isOnline ? (
                                                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                                        Online
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-xs text-white/40">
                                                        <span className="w-2 h-2 rounded-full bg-white/20" />
                                                        Offline
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-white/60">
                                                <div className="flex items-center gap-1.5">
                                                    <Battery className="w-4 h-4 text-emerald-400" />
                                                    <span>{dev.battery}%</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleBanToggle(dev.deviceId, dev.isBanned)}
                                                    className={`text-xs gap-1 ${dev.isBanned
                                                        ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
                                                        : 'text-red-400 hover:text-red-300 hover:bg-red-500/10'
                                                        }`}
                                                >
                                                    <Ban className="w-3.5 h-3.5" />
                                                    {dev.isBanned ? 'Unban' : 'Ban'}
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredDevices.length === 0 && (
                                        <tr>
                                            <td colSpan={7} className="px-4 py-8 text-center text-white/40 text-sm">
                                                No hardware devices found matching your criteria.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 2: Live Activations */}
            {activeTab === 'activations' && (
                <div className="bg-[#0F1115] border border-white/5 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-white/80">
                            <thead className="bg-white/5 text-xs text-white/40 uppercase font-semibold border-b border-white/5">
                                <tr>
                                    <th className="px-4 py-3">Activation ID</th>
                                    <th className="px-4 py-3">Phone Number</th>
                                    <th className="px-4 py-3">Service</th>
                                    <th className="px-4 py-3">Device ID</th>
                                    <th className="px-4 py-3">Elapsed Time</th>
                                    <th className="px-4 py-3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {activations.map((act) => (
                                    <tr key={act.id} className="hover:bg-white/[0.02]">
                                        <td className="px-4 py-3 font-mono font-semibold text-white">
                                            {act.id}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-white/80">
                                            {act.number}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="uppercase font-mono text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                                {act.service}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-white/50">
                                            {act.client_id}
                                        </td>
                                        <td className="px-4 py-3 text-white/60">
                                            {act.elapsedSeconds || 0}s
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                {act.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {activations.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-white/40 text-sm">
                                            No active SMS activations in Redis right now.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Tab 3: Pattern Match Sandbox */}
            {activeTab === 'sandbox' && (
                <div className="bg-[#0F1115] border border-white/5 rounded-xl p-6 space-y-4 max-w-2xl">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-[hsl(var(--neon-lime))]" />
                        Real-Time Pattern Sandbox
                    </h3>
                    <p className="text-xs text-white/50">
                        Test how incoming SMS body & sender ID match against dynamic service regex patterns.
                    </p>

                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-white/60 block mb-1">Service Code</label>
                            <Input
                                value={testService}
                                onChange={(e) => setTestService(e.target.value)}
                                placeholder="e.g. tg, wa, go"
                                className="bg-black/40 border-white/10 text-white font-mono text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-white/60 block mb-1">Sender ID</label>
                            <Input
                                value={testSender}
                                onChange={(e) => setTestSender(e.target.value)}
                                placeholder="e.g. Telegram, Google, +91..."
                                className="bg-black/40 border-white/10 text-white text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-white/60 block mb-1">SMS Body Text</label>
                            <textarea
                                value={testBody}
                                onChange={(e) => setTestBody(e.target.value)}
                                rows={3}
                                className="w-full p-3 rounded-lg bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:border-[hsl(var(--neon-lime))]"
                            />
                        </div>
                        <Button
                            onClick={handleTestMatch}
                            disabled={isTesting}
                            className="bg-[hsl(var(--neon-lime))] text-black font-semibold hover:bg-[hsl(var(--neon-lime))]/90 gap-2"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            {isTesting ? 'Testing...' : 'Test Match'}
                        </Button>
                    </div>

                    {testResult && (
                        <div className="mt-4 p-4 rounded-xl bg-black/60 border border-white/10 font-mono text-xs space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-white/50">Matched:</span>
                                {testResult.isMatched ? (
                                    <span className="text-emerald-400 font-bold">YES ✅</span>
                                ) : (
                                    <span className="text-red-400 font-bold">NO ❌</span>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-white/50">Extracted OTP:</span>
                                <span className="text-[hsl(var(--neon-lime))] font-bold text-sm">
                                    {testResult.extractedCode || 'None'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </main>
    )
}
