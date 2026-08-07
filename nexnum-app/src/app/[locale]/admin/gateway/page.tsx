"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Smartphone, Server, Shield, Activity, RefreshCw, CheckCircle,
    XCircle, AlertCircle, Ban, Play, Terminal, Cpu, Battery, Wifi,
    Clock, Search, ArrowRight, Zap, Filter, ArrowUpDown, ChevronLeft,
    ChevronRight, ChevronsLeft, ChevronsRight, Check, Sparkles, Copy,
    X, MessageSquare, Calendar, Key, ExternalLink, Inbox, Plus, Edit3,
    Trash2, Tag, DollarSign, Layers
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
function parseAnyTimestampToMs(val: number | string | null | undefined): number {
    if (!val) return 0
    if (typeof val === 'number') {
        if (val <= 0) return 0
        if (val < 1e11) return val * 1000
        return val
    }
    const s = String(val).trim()
    if (!s) return 0

    // Pure numeric string
    if (/^\d+(\.\d+)?$/.test(s)) {
        const num = parseFloat(s)
        if (num <= 0) return 0
        if (num < 1e11) return num * 1000
        return num
    }

    // Clean delimiters e.g. "08-08-2026 | 04:05 am" -> "08-08-2026 04:05 AM"
    const cleaned = s.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()

    // 1. Direct native parser
    const direct = Date.parse(cleaned)
    if (!isNaN(direct) && direct > 946684800000) {
        return direct
    }

    // 2. Parse DD-MM-YYYY or MM-DD-YYYY or YYYY-MM-DD with 12h/24h time
    const dmyMatch = cleaned.match(/^(\d{1,4})[-/](\d{1,2})[-/](\d{1,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i)
    if (dmyMatch) {
        const [, p1, p2, p3, hStr, minStr, secStr, ampm] = dmyMatch
        let year: number, month: number, day: number
        if (p1.length === 4) {
            year = parseInt(p1, 10)
            month = parseInt(p2, 10) - 1
            day = parseInt(p3, 10)
        } else {
            day = parseInt(p1, 10)
            month = parseInt(p2, 10) - 1
            year = parseInt(p3, 10)
            if (year < 100) year += 2000
        }
        let hour = parseInt(hStr, 10)
        const minute = parseInt(minStr, 10)
        const second = secStr ? parseInt(secStr, 10) : 0
        if (ampm) {
            const isPm = ampm.toLowerCase() === 'pm'
            if (isPm && hour < 12) hour += 12
            if (!isPm && hour === 12) hour = 0
        }
        const dt = new Date(year, month, day, hour, minute, second)
        if (!isNaN(dt.getTime())) {
            return dt.getTime()
        }
    }
    return 0
}

function formatDetailedRelativeTime(timestampMs: number | string | null | undefined, fallbackStr?: string): string {
    const ms = parseAnyTimestampToMs(timestampMs)
    if (ms <= 0) return fallbackStr || "No messages"

    const now = Date.now()
    const diff = now - ms

    // Clock skew / fresh incoming within 45 seconds
    if (diff < 0 && Math.abs(diff) < 60000) {
        return "just now"
    }

    const seconds = Math.floor(Math.max(0, diff) / 1000)

    if (seconds < 45) {
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
    dateTime?: string
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

interface ServicePatternItem {
    code: string
    name: string
    price?: number
    stock?: number
    senders?: string[]
    sender_patterns?: string[]
    body_patterns?: string[]
    otp_regex?: string
}

type DeviceSortField = 'phoneNumber' | 'deviceId' | 'simSlot' | 'carrier' | 'schemaType' | 'status' | 'battery' | 'isBanned' | 'lastSeenMs' | 'lastMessage'
type SortOrder = 'asc' | 'desc'

export default function GatewayAdminPage() {
    const [activeTab, setActiveTab] = useState<'devices' | 'activations' | 'services' | 'sandbox' | 'scorer'>('devices')
    const [stats, setStats] = useState<GatewayStats | null>(null)
    const [devices, setDevices] = useState<DeviceNode[]>([])
    const [activations, setActivations] = useState<ActivationItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")

    // Services Catalog State
    const [patterns, setPatterns] = useState<Record<string, ServicePatternItem>>({})
    const [isLoadingPatterns, setIsLoadingPatterns] = useState(false)
    const [serviceSearchQuery, setServiceSearchQuery] = useState("")
    const [isAddServiceOpen, setIsAddServiceOpen] = useState(false)
    const [isEditServiceOpen, setIsEditServiceOpen] = useState(false)
    const [editingServiceCode, setEditingServiceCode] = useState("")

    // Service Form State
    const [formCode, setFormCode] = useState("")
    const [formName, setFormName] = useState("")
    const [formPrice, setFormPrice] = useState<number>(15.0)
    const [formStock, setFormStock] = useState<number>(100)
    const [formSenderPats, setFormSenderPats] = useState("")
    const [formBodyPats, setFormBodyPats] = useState("")
    const [formOtpRegex, setFormOtpRegex] = useState("")

    // Scorer Leaderboard State
    const [scorerService, setScorerService] = useState('tg')
    const [scorerData, setScorerData] = useState<any>(null)
    const [isScorerLoading, setIsScorerLoading] = useState(false)
    const [scorerAutoRefresh, setScorerAutoRefresh] = useState(true)

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
    const [totalMsgCount, setTotalMsgCount] = useState(0)
    const [totalMsgPages, setTotalMsgPages] = useState(1)

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
    // Search Input Debouncing (300ms)
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

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

    // Fetch Service Patterns
    const fetchPatterns = useCallback(async () => {
        try {
            setIsLoadingPatterns(true)
            const res = await fetch('/api/admin/gateway?endpoint=/api/v1/admin/patterns')
            if (res.ok) {
                const data = await res.json()
                setPatterns(data.patterns || {})
            }
        } catch {
            toast.error("Failed to load service patterns catalog")
        } finally {
            setIsLoadingPatterns(false)
        }
    }, [])

    // Fetch Scorer Leaderboard
    const fetchScorerLeaderboard = useCallback(async () => {
        try {
            setIsScorerLoading(true)
            const endpoint = `/api/v1/admin/scorer/leaderboard?service=${scorerService}&limit=50`
            const res = await fetch(`/api/admin/gateway?endpoint=${encodeURIComponent(endpoint)}`)
            if (res.ok) {
                const data = await res.json()
                setScorerData(data)
            }
        } catch {
            // silent fail for scorer refresh
        } finally {
            setIsScorerLoading(false)
        }
    }, [scorerService])

    // Fetch Devices with Server-Side Pagination & Sorting
    const fetchDevices = useCallback(async () => {
        try {
            setIsLoading(true)
            const endpoint = `/api/v1/admin/devices?page=${devicePage}&limit=${deviceLimit}&sort_by=${deviceSortBy}&sort_order=${deviceSortOrder}&search=${encodeURIComponent(debouncedSearchQuery)}`
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
    }, [devicePage, deviceLimit, deviceSortBy, deviceSortOrder, debouncedSearchQuery])

    // Fetch Activations with Server-Side Pagination & Sorting
    const fetchActivations = useCallback(async () => {
        try {
            const endpoint = `/api/v1/admin/activations?page=${actPage}&limit=${actLimit}&sort_by=${actSortBy}&sort_order=${actSortOrder}&search=${encodeURIComponent(debouncedSearchQuery)}`
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
    }, [actPage, actLimit, actSortBy, actSortOrder, debouncedSearchQuery])

    // Main Gateway Data Fetcher
    const fetchAllData = useCallback(async () => {
        await Promise.all([fetchStats(), fetchDevices(), fetchActivations(), fetchPatterns()])
    }, [fetchStats, fetchDevices, fetchActivations])

    useEffect(() => {
        fetchAllData()
        const interval = setInterval(fetchAllData, 12000)
        return () => clearInterval(interval)
    }, [fetchAllData])

    // Scorer Leaderboard auto-refresh
    useEffect(() => {
        if (activeTab === 'scorer') {
            fetchScorerLeaderboard()
            if (scorerAutoRefresh) {
                const interval = setInterval(fetchScorerLeaderboard, 6000)
                return () => clearInterval(interval)
            }
        }
    }, [activeTab, scorerService, scorerAutoRefresh, fetchScorerLeaderboard])

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
    // Open and load device SMS messages on demand with pagination & search
    const handleOpenDeviceSms = useCallback(async (device: DeviceNode, page = 1, showLoading = true) => {
        if (showLoading) setIsLoadingMessages(true)
        setMsgPage(page)
        try {
            const targetKey = device.deviceId || device.phoneNumber || device.firebaseNodeId
            const endpoint = `/api/v1/admin/devices/${targetKey}/messages?page=${page}&limit=${msgLimit}&search=${encodeURIComponent(msgSearchQuery)}`
            const res = await fetch(`/api/admin/gateway?endpoint=${encodeURIComponent(endpoint)}`)
            if (res.ok) {
                const data = await res.json()
                setDeviceMessages(data.messages || [])
                setTotalMsgCount(data.total || (data.messages ? data.messages.length : 0))
                setTotalMsgPages(data.totalPages || 1)
            } else {
                setDeviceMessages([])
            }
        } catch {
            if (showLoading) toast.error("Failed to load device SMS messages")
            setDeviceMessages([])
        } finally {
            if (showLoading) setIsLoadingMessages(false)
        }
    }, [msgLimit, msgSearchQuery])

    // Fetch live SMS every 5 seconds directly from Firebase/API when message modal is open
    useEffect(() => {
        if (!selectedDevice) return

        const interval = setInterval(() => {
            handleOpenDeviceSms(selectedDevice, msgPage, false)
        }, 5000)

        return () => clearInterval(interval)
    }, [selectedDevice, msgPage, handleOpenDeviceSms])

    const openAddServiceModal = () => {
        setFormCode("")
        setFormName("")
        setFormPrice(15.0)
        setFormStock(100)
        setFormSenderPats("")
        setFormBodyPats("")
        setFormOtpRegex("")
        setIsAddServiceOpen(true)
    }

    const openEditServiceModal = (code: string, item: ServicePatternItem) => {
        setEditingServiceCode(code)
        setFormCode(code)
        setFormName(item.name || code.toUpperCase())
        setFormPrice(item.price || 15.0)
        setFormStock(item.stock || 100)
        const senders = item.sender_patterns || item.senders || []
        setFormSenderPats(senders.join("\n"))
        const bodies = item.body_patterns || []
        setFormBodyPats(bodies.join("\n"))
        setFormOtpRegex(item.otp_regex || "")
        setIsEditServiceOpen(true)
    }

    const handleSaveService = async (isNew: boolean) => {
        const code = (formCode || "").trim().toLowerCase()
        if (!code) {
            toast.error("Service code is required (e.g. tg, wa, go)")
            return
        }
        try {
            const payload = {
                name: formName || code.toUpperCase(),
                price: Number(formPrice) || 15.0,
                stock: Number(formStock) || 100,
                sender_patterns: formSenderPats.split('\n').map(s => s.trim()).filter(Boolean),
                body_patterns: formBodyPats.split('\n').map(s => s.trim()).filter(Boolean),
                otp_regex: formOtpRegex.trim() || undefined
            }

            const res = await fetch('/api/admin/gateway', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: `/api/v1/admin/patterns/${code}`,
                    payload
                })
            })

            if (res.ok) {
                toast.success(`Service '${code}' saved successfully!`)
                setIsAddServiceOpen(false)
                setIsEditServiceOpen(false)
                fetchPatterns()
            } else {
                toast.error("Failed to save service pattern")
            }
        } catch {
            toast.error("Network error saving service")
        }
    }

    const handleDeleteService = async (code: string) => {
        if (code === 'ot') {
            toast.error("Cannot delete fallback service 'ot'")
            return
        }
        if (!confirm(`Are you sure you want to delete service pattern '${code}'?`)) return
        try {
            const res = await fetch(`/api/admin/gateway?endpoint=/api/v1/admin/patterns/${code}`, {
                method: 'DELETE'
            })
            if (res.ok) {
                toast.success(`Service '${code}' deleted successfully`)
                fetchPatterns()
            } else {
                toast.error("Failed to delete service")
            }
        } catch {
            toast.error("Network error deleting service")
        }
    }

    // Filter patterns by search
    const filteredPatterns = useMemo(() => {
        const list = Object.entries(patterns).map(([code, item]) => ({
            ...item,
            code
        }))
        if (!serviceSearchQuery.trim()) return list
        const q = serviceSearchQuery.toLowerCase()
        return list.filter(p =>
            p.code.toLowerCase().includes(q) ||
            (p.name || "").toLowerCase().includes(q) ||
            (p.sender_patterns || []).some(s => s.toLowerCase().includes(q))
        )
    }, [patterns, serviceSearchQuery])

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
                        onClick={() => {
                            setActiveTab('services')
                            fetchPatterns()
                        }}
                        className={cn(
                            "px-4 py-2 rounded-lg border-2 font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5",
                            activeTab === 'services'
                                ? "border-black bg-purple-400 text-black shadow-[3px_3px_0px_0px_#000]"
                                : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                        )}
                    >
                        <Server className="w-3.5 h-3.5" />
                        Services Catalog ({Object.keys(patterns).length})
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

                    <button
                        onClick={() => setActiveTab('scorer')}
                        className={cn(
                            "px-4 py-2 rounded-lg border-2 font-black text-xs uppercase tracking-wider transition-all flex items-center gap-1.5",
                            activeTab === 'scorer'
                                ? "border-black bg-[hsl(var(--neon-lime))] text-black shadow-[3px_3px_0px_0px_#000]"
                                : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                        )}
                    >
                        <Zap className="w-3.5 h-3.5" />
                        Scorer Leaderboard ({scorerData?.totalNodes || deviceTotal})
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

            {/* ── 5. TAB CONTENT: SCORER LEADERBOARD & QUEUE ── */}
            {activeTab === 'scorer' && (
                <div className="space-y-6">
                    {/* Header Controls & Service Selector */}
                    <div className="rounded-xl border-2 border-zinc-800 bg-[#0d0e12] p-4 sm:p-5 shadow-[4px_4px_0px_0px_#000] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <Zap className="w-5 h-5 text-[hsl(var(--neon-lime))] stroke-[2.5]" />
                                <h3 className="text-base font-black uppercase tracking-wider text-white">
                                    Live SIM Allocation Queue & Point Scorer
                                </h3>
                            </div>
                            <p className="text-xs text-zinc-400 font-medium">
                                Real-time deterministic leaderboard ranking. Numbers at <strong className="text-[hsl(var(--neon-lime))]">Rank #1</strong> are occupied first during purchases.
                            </p>
                        </div>

                        {/* Controls */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Service Pills */}
                            <div className="flex flex-wrap items-center gap-1.5 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                                {[
                                    { code: 'tg', label: 'Telegram' },
                                    { code: 'wa', label: 'WhatsApp' },
                                    { code: 'go', label: 'Google' },
                                    { code: 'ig', label: 'Instagram' },
                                    { code: 'oa', label: 'OpenAI' },
                                    { code: 'ot', label: 'Any / Other' },
                                ].map((s) => (
                                    <button
                                        key={s.code}
                                        onClick={() => setScorerService(s.code)}
                                        className={cn(
                                            "px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider transition-all",
                                            scorerService === s.code
                                                ? "bg-[hsl(var(--neon-lime))] text-black shadow-[1px_1px_0px_0px_#000]"
                                                : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                                        )}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>

                            {/* Auto-Refresh Toggle */}
                            <button
                                onClick={() => setScorerAutoRefresh(prev => !prev)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all shadow-[1px_1px_0px_0px_#000]",
                                    scorerAutoRefresh
                                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                                        : "border-zinc-800 bg-zinc-900 text-zinc-400"
                                )}
                            >
                                <span className={cn("w-2 h-2 rounded-full", scorerAutoRefresh ? "bg-emerald-400 animate-pulse" : "bg-zinc-600")} />
                                Auto-Refresh {scorerAutoRefresh ? "ON (6s)" : "OFF"}
                            </button>

                            {/* Manual Refresh Button */}
                            <button
                                onClick={fetchScorerLeaderboard}
                                disabled={isScorerLoading}
                                className="p-2 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors shadow-[1px_1px_0px_0px_#000]"
                                title="Refresh Leaderboard"
                            >
                                <RefreshCw className={cn("w-4 h-4", isScorerLoading && "animate-spin text-[hsl(var(--neon-lime))]")} />
                            </button>
                        </div>
                    </div>

                    {/* Top Pick Feature Banner */}
                    {scorerData?.topPick && (
                        <div className="rounded-xl border-2 border-black bg-[hsl(var(--neon-lime))] p-5 shadow-[4px_4px_0px_0px_#000] text-black">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2.5 py-0.5 rounded bg-black text-white text-[10px] font-black uppercase tracking-wider">
                                            Rank #1 Top Pick
                                        </span>
                                        <span className="text-xs font-black uppercase tracking-wider opacity-90">
                                            Next Allocated SIM for {scorerData.serviceName}
                                        </span>
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight flex items-center gap-3">
                                        <span>{scorerData.topPick.phoneNumber}</span>
                                        <span className="text-sm px-2.5 py-0.5 rounded border border-black bg-black/10 font-sans font-bold">
                                            Slot {scorerData.topPick.simSlot} • {scorerData.topPick.carrier}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="text-right">
                                        <div className="text-[10px] font-black uppercase tracking-wider opacity-80">Total Point Score</div>
                                        <div className="text-3xl font-black font-mono">+{scorerData.topPick.score} PTS</div>
                                    </div>

                                    <button
                                        onClick={() => {
                                            const dev = devices.find(d => d.deviceId === scorerData.topPick.deviceId) || {
                                                deviceId: scorerData.topPick.deviceId,
                                                simSlot: scorerData.topPick.simSlot,
                                                phoneNumber: scorerData.topPick.phoneNumber,
                                                carrier: scorerData.topPick.carrier,
                                                schemaType: scorerData.topPick.schemaType,
                                                isOnline: scorerData.topPick.isOnline,
                                                battery: scorerData.topPick.battery,
                                                lastSeenMs: scorerData.topPick.lastSeenMs,
                                                firebaseNodeId: scorerData.topPick.firebaseNodeId,
                                                isBanned: false
                                            }
                                            handleOpenDeviceSms(dev)
                                        }}
                                        className="px-4 py-2 rounded-lg border-2 border-black bg-black text-white font-black text-xs uppercase tracking-wider hover:bg-zinc-900 shadow-[2px_2px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all"
                                    >
                                        Inspect SMS Stream
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Point Scoring Formula Quick Guide Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-lg border border-zinc-800 bg-[#0d0e12] p-3 shadow-[2px_2px_0px_0px_#000]">
                            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Fresh Number Bonus</div>
                            <div className="text-sm font-black text-emerald-400 mt-0.5">+100 PTS</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">0 prior SMS for service (-25/SMS reuse)</div>
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-[#0d0e12] p-3 shadow-[2px_2px_0px_0px_#000]">
                            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">12h Activity Recency</div>
                            <div className="text-sm font-black text-cyan-400 mt-0.5">+60 / +40 / +20 / +10 PTS</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">&lt;1h (+60), &lt;3h (+40), &lt;6h (+20), &lt;12h (+10)</div>
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-[#0d0e12] p-3 shadow-[2px_2px_0px_0px_#000]">
                            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Online Bonus</div>
                            <div className="text-sm font-black text-[hsl(var(--neon-lime))] mt-0.5">+30 PTS</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">Live heartbeat connection bonus</div>
                        </div>

                        <div className="rounded-lg border border-zinc-800 bg-[#0d0e12] p-3 shadow-[2px_2px_0px_0px_#000]">
                            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Battery Health</div>
                            <div className="text-sm font-black text-amber-400 mt-0.5">+10 / -20 PTS</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5">&ge;70% power (+10), &lt;15% power (-20)</div>
                        </div>
                    </div>

                    {/* Leaderboard Table Card */}
                    <div className="rounded-xl border-2 border-zinc-800 bg-[#0d0e12] p-4 shadow-[4px_4px_0px_0px_#000] overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-zinc-800 text-[11px] font-black uppercase text-zinc-400 tracking-wider">
                                        <th className="pb-3 pr-4">Rank / Order</th>
                                        <th className="pb-3 px-4">Phone Number</th>
                                        <th className="pb-3 px-4">SIM Slot</th>
                                        <th className="pb-3 px-4">Carrier</th>
                                        <th className="pb-3 px-4">Total Score</th>
                                        <th className="pb-3 px-4">Freshness Points</th>
                                        <th className="pb-3 px-4">12h Recency</th>
                                        <th className="pb-3 px-4">Online Status</th>
                                        <th className="pb-3 px-4">Battery</th>
                                        <th className="pb-3 px-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/60 text-xs font-medium">
                                    {isScorerLoading && !scorerData ? (
                                        <tr>
                                            <td colSpan={10} className="py-12 text-center text-zinc-400 font-bold">
                                                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[hsl(var(--neon-lime))]" />
                                                Calculating multi-factor point scores across all SIM nodes...
                                            </td>
                                        </tr>
                                    ) : !scorerData?.leaderboard?.length ? (
                                        <tr>
                                            <td colSpan={10} className="py-12 text-center text-zinc-500 font-bold uppercase tracking-wider">
                                                No SIM candidates currently available for scoring.
                                            </td>
                                        </tr>
                                    ) : (
                                        scorerData.leaderboard.map((item: any) => (
                                            <tr
                                                key={`${item.deviceId}-${item.simSlot}`}
                                                className={cn(
                                                    "hover:bg-zinc-900/60 transition-colors",
                                                    item.rank === 1 && "bg-[hsl(var(--neon-lime))]/5"
                                                )}
                                            >
                                                {/* Rank Badge */}
                                                <td className="py-3 pr-4 font-black">
                                                    {item.rank === 1 ? (
                                                        <span className="px-2.5 py-1 rounded border-2 border-black bg-[hsl(var(--neon-lime))] text-black font-black text-[10px] tracking-wider uppercase shadow-[2px_2px_0px_0px_#000]">
                                                            #1 NEXT PICK
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-300 font-mono text-xs font-bold">
                                                            #{item.rank}
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Phone Number */}
                                                <td className="py-3 px-4 font-mono font-bold text-white flex items-center gap-2">
                                                    <span className={cn("w-2 h-2 rounded-full", item.isOnline ? "bg-emerald-400" : "bg-zinc-600")} />
                                                    <span>{item.phoneNumber || "Pending"}</span>
                                                </td>

                                                {/* SIM Slot */}
                                                <td className="py-3 px-4 font-mono text-zinc-400">
                                                    <span className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-300 text-[10px] font-bold">
                                                        Slot {item.simSlot}
                                                    </span>
                                                </td>

                                                {/* Carrier */}
                                                <td className="py-3 px-4 font-bold text-zinc-300 uppercase">
                                                    <span className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-[10px]">
                                                        {item.carrier}
                                                    </span>
                                                </td>

                                                {/* Total Score Badge */}
                                                <td className="py-3 px-4">
                                                    <span className={cn(
                                                        "px-2.5 py-1 rounded font-black font-mono text-xs tracking-wider",
                                                        item.isCooldown
                                                            ? "border border-rose-500/40 bg-rose-500/10 text-rose-400"
                                                            : item.score >= 150
                                                                ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                                                                : item.score >= 100
                                                                    ? "border border-cyan-500/40 bg-cyan-500/15 text-cyan-400"
                                                                    : "border border-zinc-700 bg-zinc-800 text-zinc-300"
                                                    )}>
                                                        {item.isCooldown ? "COOLDOWN (-9999)" : `+${item.score} PTS`}
                                                    </span>
                                                </td>

                                                {/* Freshness Points */}
                                                <td className="py-3 px-4 font-mono text-xs">
                                                    {item.serviceSmsCount === 0 ? (
                                                        <span className="text-emerald-400 font-bold">
                                                            Fresh (+100)
                                                        </span>
                                                    ) : (
                                                        <span className="text-amber-400 font-bold">
                                                            {item.serviceSmsCount}x SMS (-{item.serviceSmsCount * 25})
                                                        </span>
                                                    )}
                                                </td>

                                                {/* 12h Recency / Last SMS (Main Page Ago Timings) */}
                                                <td className="py-3 px-4 font-mono text-xs text-zinc-300">
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1.5",
                                                        item.isCooldown || (item.lastSmsHours && item.lastSmsHours > 12.0)
                                                            ? "text-rose-400 bg-rose-950/40 border border-rose-800"
                                                            : "text-emerald-400 bg-emerald-950/40 border border-emerald-800"
                                                    )}>
                                                        <Clock className="w-3 h-3 text-zinc-400" />
                                                        {formatDetailedRelativeTime(item.lastSmsMs)}
                                                    </span>
                                                </td>

                                                {/* Online Status */}
                                                <td className="py-3 px-4">
                                                    {item.isOnline ? (
                                                        <span className="px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-bold uppercase text-[10px] inline-flex items-center gap-1">
                                                            <Wifi className="w-2.5 h-2.5 stroke-[2.5]" />
                                                            +30
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-500 font-bold uppercase text-[10px]">
                                                            +0 (Off)
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Battery */}
                                                <td className="py-3 px-4 font-mono text-zinc-300 text-xs">
                                                    <span className={cn(
                                                        "font-bold",
                                                        item.battery >= 70 ? "text-emerald-400" : (item.battery < 20 ? "text-rose-400" : "text-zinc-300")
                                                    )}>
                                                        {item.battery}% ({item.breakdown?.batteryBonus >= 0 ? `+${item.breakdown?.batteryBonus}` : item.breakdown?.batteryBonus})
                                                    </span>
                                                </td>

                                                {/* Inspect Action */}
                                                <td className="py-3 px-4 text-right">
                                                    <button
                                                        onClick={() => {
                                                            const dev = devices.find(d => d.deviceId === item.deviceId) || {
                                                                deviceId: item.deviceId,
                                                                simSlot: item.simSlot,
                                                                phoneNumber: item.phoneNumber,
                                                                carrier: item.carrier,
                                                                schemaType: item.schemaType,
                                                                isOnline: item.isOnline,
                                                                battery: item.battery,
                                                                lastSeenMs: item.lastSeenMs,
                                                                firebaseNodeId: item.firebaseNodeId,
                                                                isBanned: false
                                                            }
                                                            setSelectedDevice(dev)
                                                        }}
                                                        className="px-2.5 py-1 rounded border border-zinc-700 bg-zinc-900 text-[11px] font-bold text-zinc-300 hover:text-white hover:border-[hsl(var(--neon-lime))] transition-colors shadow-[1px_1px_0px_0px_#000]"
                                                    >
                                                        Inspect SMS
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 5. TAB CONTENT: SERVICES CATALOG ── */}
            {activeTab === 'services' && (
                <div className="space-y-4">
                    {/* Header Controls */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl border-2 border-zinc-800 bg-[#0d0e12] p-4 shadow-[4px_4px_0px_0px_#000]">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-lg border-2 border-black bg-purple-400 text-black shadow-[2px_2px_0px_0px_#000]">
                                <Layers className="w-5 h-5 stroke-[2.5]" />
                            </div>
                            <div>
                                <h2 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                                    Service Patterns & Dynamic Pricing Registry
                                </h2>
                                <p className="text-xs text-zinc-400 font-medium">
                                    Manage regex matchers, India pricing (₹), and SIM stock for all 25+ gateway services
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2.5 flex-wrap">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder="Filter by service name or code..."
                                    value={serviceSearchQuery}
                                    onChange={(e) => setServiceSearchQuery(e.target.value)}
                                    className="pl-8 pr-3 py-1.5 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-white text-xs font-bold placeholder:text-zinc-500 focus:outline-none focus:border-purple-400"
                                />
                            </div>

                            <button
                                onClick={openAddServiceModal}
                                className="px-3 py-1.5 rounded-lg border-2 border-black bg-[hsl(var(--neon-lime))] text-black font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-[2px_2px_0px_0px_#000] hover:bg-[hsl(var(--neon-lime))]/90 active:translate-x-[1px] active:translate-y-[1px] transition-all"
                            >
                                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                                Add Service
                            </button>

                            <button
                                onClick={fetchPatterns}
                                disabled={isLoadingPatterns}
                                className="p-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-700 shadow-[2px_2px_0px_0px_#000]"
                                title="Refresh Services"
                            >
                                <RefreshCw className={cn("w-3.5 h-3.5", isLoadingPatterns && "animate-spin")} />
                            </button>
                        </div>
                    </div>

                    {/* Services Table Card */}
                    <div className="rounded-xl border-2 border-zinc-800 bg-[#0d0e12] p-4 shadow-[4px_4px_0px_0px_#000] overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b-2 border-zinc-800 text-[11px] font-black uppercase text-zinc-400 tracking-wider">
                                        <th className="pb-3 pr-4">Service</th>
                                        <th className="pb-3 px-4">Code</th>
                                        <th className="pb-3 px-4">Price (₹)</th>
                                        <th className="pb-3 px-4">Stock</th>
                                        <th className="pb-3 px-4">Sender Patterns</th>
                                        <th className="pb-3 px-4">Body Patterns</th>
                                        <th className="pb-3 px-4">OTP Regex</th>
                                        <th className="pb-3 pl-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-800/60 text-xs font-bold">
                                    {isLoadingPatterns && Object.keys(patterns).length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="py-12 text-center text-zinc-400">
                                                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400" />
                                                Loading service patterns and live catalog...
                                            </td>
                                        </tr>
                                    ) : filteredPatterns.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="py-12 text-center text-zinc-500 font-bold uppercase tracking-wider">
                                                No service patterns found matching filter.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredPatterns.map((p) => (
                                            <tr key={p.code} className="hover:bg-zinc-800/40 transition-colors group">
                                                {/* Service Name */}
                                                <td className="py-3.5 pr-4">
                                                    <span className="text-white font-black text-sm flex items-center gap-2">
                                                        <Tag className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                                        {p.name || p.code.toUpperCase()}
                                                    </span>
                                                </td>

                                                {/* Service Code */}
                                                <td className="py-3.5 px-4">
                                                    <span className="px-2 py-0.5 rounded border-2 border-black bg-purple-400 text-black font-mono font-black text-xs shadow-[1px_1px_0px_0px_#000]">
                                                        {p.code}
                                                    </span>
                                                </td>

                                                {/* Price */}
                                                <td className="py-3.5 px-4">
                                                    <span className="px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-mono font-black text-xs">
                                                        ₹{(p.price ?? 15.0).toFixed(2)}
                                                    </span>
                                                </td>

                                                {/* Stock */}
                                                <td className="py-3.5 px-4 font-mono text-zinc-300">
                                                    <span className="px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-[11px] font-bold">
                                                        {p.stock ?? 100} SIMs
                                                    </span>
                                                </td>

                                                {/* Sender Patterns */}
                                                <td className="py-3.5 px-4">
                                                    <div className="flex flex-wrap gap-1 max-w-xs">
                                                        {(p.sender_patterns || p.senders || []).slice(0, 3).map((sp, idx) => (
                                                            <span key={idx} className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono border border-zinc-700">
                                                                {sp}
                                                            </span>
                                                        ))}
                                                        {(p.sender_patterns || p.senders || []).length > 3 && (
                                                            <span className="text-[10px] text-zinc-500 font-mono">
                                                                +{(p.sender_patterns || p.senders || []).length - 3} more
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Body Patterns */}
                                                <td className="py-3.5 px-4">
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-zinc-400 text-[11px] font-mono">
                                                            {(p.body_patterns || []).length} patterns
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* OTP Regex */}
                                                <td className="py-3.5 px-4">
                                                    <span className="text-zinc-400 font-mono text-[11px] bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                                                        {p.otp_regex || "\\b\\d{4,6}\\b"}
                                                    </span>
                                                </td>

                                                {/* Actions */}
                                                <td className="py-3.5 pl-4 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            onClick={() => openEditServiceModal(p.code, p)}
                                                            className="p-1.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:border-purple-400 transition-colors shadow-[1px_1px_0px_0px_#000]"
                                                            title="Edit Service"
                                                        >
                                                            <Edit3 className="w-3.5 h-3.5" />
                                                        </button>

                                                        <button
                                                            onClick={() => {
                                                                setTestService(p.code)
                                                                setTestSender(p.name || p.code.toUpperCase())
                                                                setActiveTab('sandbox')
                                                            }}
                                                            className="p-1.5 rounded border border-zinc-700 bg-zinc-900 text-amber-400 hover:bg-zinc-800 transition-colors shadow-[1px_1px_0px_0px_#000]"
                                                            title="Test in Sandbox"
                                                        >
                                                            <Terminal className="w-3.5 h-3.5" />
                                                        </button>

                                                        {p.code !== 'ot' && (
                                                            <button
                                                                onClick={() => handleDeleteService(p.code)}
                                                                className="p-1.5 rounded border border-rose-900/60 bg-rose-950/40 text-rose-400 hover:bg-rose-900/60 transition-colors shadow-[1px_1px_0px_0px_#000]"
                                                                title="Delete Service"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 6. DEVICE SMS INSPECTOR MODAL (LAST 150 SMS) ── */}
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
                                        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-mono text-[10px] font-bold">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                            LIVE (5s)
                                        </span>
                                    </div>
                                    <p className="text-xs text-zinc-400 font-medium">
                                        Device ID: <span className="font-mono text-zinc-300 font-bold">{selectedDevice.deviceId}</span> • Node: <span className="font-mono text-zinc-300">{selectedDevice.firebaseNodeId}</span> • Last Activity: <span className="text-[hsl(var(--neon-lime))] font-bold">{formatDetailedRelativeTime(deviceMessages.length > 0 ? (deviceMessages[0].timestamp > 0 ? deviceMessages[0].timestamp : deviceMessages[0].dateTime) : selectedDevice.lastSeenMs, "just now")}</span>
                                    </p>
                                </div>

                                {/* Controls: Refresh & Close Button */}
                                <div className="flex items-center gap-2 self-start sm:self-center">
                                    <button
                                        onClick={() => handleOpenDeviceSms(selectedDevice, msgPage, true)}
                                        className="p-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-[hsl(var(--neon-lime))] hover:bg-zinc-800 shadow-[2px_2px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center gap-1.5 text-xs font-bold"
                                        title="Fetch live SMS immediately from Firebase"
                                    >
                                        <RefreshCw className={`w-4 h-4 stroke-[2.5] ${isLoadingMessages ? 'animate-spin text-[hsl(var(--neon-lime))]' : ''}`} />
                                        <span className="hidden sm:inline">Refresh</span>
                                    </button>
                                    <button
                                        onClick={() => setSelectedDevice(null)}
                                        className="p-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-[hsl(var(--neon-lime))] hover:bg-zinc-800 shadow-[2px_2px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] transition-all"
                                        title="Close"
                                    >
                                        <X className="w-5 h-5 stroke-[2.5]" />
                                    </button>
                                </div>
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
                                                        {formatDetailedRelativeTime(msg.timestamp > 0 ? msg.timestamp : msg.dateTime, msg.dateTime || "Recent")}
                                                    </span>
                                                    {msg.dateTime ? (
                                                        <span className="text-[10px] text-zinc-500 font-mono hidden md:inline">
                                                            ({msg.dateTime})
                                                        </span>
                                                    ) : msg.timestamp > 946684800000 ? (
                                                        <span className="text-[10px] text-zinc-600 font-mono hidden md:inline">
                                                            ({new Date(msg.timestamp).toLocaleString()})
                                                        </span>
                                                    ) : null}
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

            {/* ── 7. ADD SERVICE MODAL ── */}
            <AnimatePresence>
                {isAddServiceOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
                        <div className="absolute inset-0" onClick={() => setIsAddServiceOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-xl rounded-2xl border-2 border-black bg-[#0d0e12] shadow-[8px_8px_0px_0px_#000] overflow-hidden z-10"
                        >
                            <div className="p-5 border-b-2 border-zinc-800 bg-zinc-950 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-lg border-2 border-black bg-[hsl(var(--neon-lime))] text-black shadow-[2px_2px_0px_0px_#000]">
                                        <Plus className="w-5 h-5 stroke-[3]" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-white uppercase tracking-tight">Add New Service</h3>
                                        <p className="text-xs text-zinc-400">Configure service code, India pricing, stock & regex rules</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsAddServiceOpen(false)}
                                    className="p-1.5 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-[hsl(var(--neon-lime))]"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-black uppercase text-zinc-400 mb-1">Service Code *</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. tg, wa, nf, sw"
                                            value={formCode}
                                            onChange={(e) => setFormCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                                            className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-white font-mono font-bold text-xs focus:outline-none focus:border-[hsl(var(--neon-lime))]"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black uppercase text-zinc-400 mb-1">Display Name *</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Telegram, Netflix"
                                            value={formName}
                                            onChange={(e) => setFormName(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-white font-bold text-xs focus:outline-none focus:border-[hsl(var(--neon-lime))]"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-black uppercase text-zinc-400 mb-1">Base Price (₹) *</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formPrice}
                                            onChange={(e) => setFormPrice(parseFloat(e.target.value) || 0)}
                                            className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-emerald-400 font-mono font-black text-xs focus:outline-none focus:border-emerald-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black uppercase text-zinc-400 mb-1">Allocatable Stock *</label>
                                        <input
                                            type="number"
                                            value={formStock}
                                            onChange={(e) => setFormStock(parseInt(e.target.value) || 0)}
                                            className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-white font-mono font-bold text-xs focus:outline-none focus:border-[hsl(var(--neon-lime))]"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-black uppercase text-zinc-400 mb-1">Sender Patterns (1 regex per line)</label>
                                    <textarea
                                        rows={3}
                                        placeholder={"telegram\\b\ntelegr\nTG"}
                                        value={formSenderPats}
                                        onChange={(e) => setFormSenderPats(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-zinc-200 font-mono text-xs focus:outline-none focus:border-[hsl(var(--neon-lime))]"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-black uppercase text-zinc-400 mb-1">Body Patterns (1 regex per line)</label>
                                    <textarea
                                        rows={3}
                                        placeholder={"telegram code\nlogin code"}
                                        value={formBodyPats}
                                        onChange={(e) => setFormBodyPats(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-zinc-200 font-mono text-xs focus:outline-none focus:border-[hsl(var(--neon-lime))]"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-black uppercase text-zinc-400 mb-1">Custom OTP Regex (Optional)</label>
                                    <input
                                        type="text"
                                        placeholder={"\\b\\d{4,6}\\b"}
                                        value={formOtpRegex}
                                        onChange={(e) => setFormOtpRegex(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-amber-400 font-mono text-xs focus:outline-none focus:border-amber-400"
                                    />
                                </div>
                            </div>

                            <div className="p-4 border-t-2 border-zinc-800 bg-zinc-950 flex items-center justify-end gap-3">
                                <button
                                    onClick={() => setIsAddServiceOpen(false)}
                                    className="px-4 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-zinc-300 font-bold text-xs hover:bg-zinc-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleSaveService(true)}
                                    className="px-4 py-2 rounded-lg border-2 border-black bg-[hsl(var(--neon-lime))] text-black font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_0px_#000] hover:bg-[hsl(var(--neon-lime))]/90"
                                >
                                    Save Service
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── 8. EDIT SERVICE MODAL ── */}
            <AnimatePresence>
                {isEditServiceOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
                        <div className="absolute inset-0" onClick={() => setIsEditServiceOpen(false)} />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-xl rounded-2xl border-2 border-black bg-[#0d0e12] shadow-[8px_8px_0px_0px_#000] overflow-hidden z-10"
                        >
                            <div className="p-5 border-b-2 border-zinc-800 bg-zinc-950 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-lg border-2 border-black bg-purple-400 text-black shadow-[2px_2px_0px_0px_#000]">
                                        <Edit3 className="w-5 h-5 stroke-[2.5]" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-black text-white uppercase tracking-tight">Edit Service: {editingServiceCode}</h3>
                                        <p className="text-xs text-zinc-400">Modify live patterns, India pricing & SIM allocation</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setIsEditServiceOpen(false)}
                                    className="p-1.5 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-purple-400"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-black uppercase text-zinc-400 mb-1">Service Code</label>
                                        <input
                                            type="text"
                                            disabled
                                            value={formCode}
                                            className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-950 text-zinc-400 font-mono font-bold text-xs cursor-not-allowed opacity-70"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black uppercase text-zinc-400 mb-1">Display Name *</label>
                                        <input
                                            type="text"
                                            value={formName}
                                            onChange={(e) => setFormName(e.target.value)}
                                            className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-white font-bold text-xs focus:outline-none focus:border-purple-400"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-black uppercase text-zinc-400 mb-1">Base Price (₹) *</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={formPrice}
                                            onChange={(e) => setFormPrice(parseFloat(e.target.value) || 0)}
                                            className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-emerald-400 font-mono font-black text-xs focus:outline-none focus:border-emerald-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black uppercase text-zinc-400 mb-1">Allocatable Stock *</label>
                                        <input
                                            type="number"
                                            value={formStock}
                                            onChange={(e) => setFormStock(parseInt(e.target.value) || 0)}
                                            className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-white font-mono font-bold text-xs focus:outline-none focus:border-purple-400"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-black uppercase text-zinc-400 mb-1">Sender Patterns (1 regex per line)</label>
                                    <textarea
                                        rows={3}
                                        value={formSenderPats}
                                        onChange={(e) => setFormSenderPats(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-zinc-200 font-mono text-xs focus:outline-none focus:border-purple-400"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-black uppercase text-zinc-400 mb-1">Body Patterns (1 regex per line)</label>
                                    <textarea
                                        rows={3}
                                        value={formBodyPats}
                                        onChange={(e) => setFormBodyPats(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-zinc-200 font-mono text-xs focus:outline-none focus:border-purple-400"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-black uppercase text-zinc-400 mb-1">Custom OTP Regex (Optional)</label>
                                    <input
                                        type="text"
                                        value={formOtpRegex}
                                        onChange={(e) => setFormOtpRegex(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-amber-400 font-mono text-xs focus:outline-none focus:border-amber-400"
                                    />
                                </div>
                            </div>

                            <div className="p-4 border-t-2 border-zinc-800 bg-zinc-950 flex items-center justify-end gap-3">
                                <button
                                    onClick={() => setIsEditServiceOpen(false)}
                                    className="px-4 py-2 rounded-lg border-2 border-zinc-800 bg-zinc-900 text-zinc-300 font-bold text-xs hover:bg-zinc-800"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleSaveService(false)}
                                    className="px-4 py-2 rounded-lg border-2 border-black bg-purple-400 text-black font-black text-xs uppercase tracking-wider shadow-[2px_2px_0px_0px_#000] hover:bg-purple-300"
                                >
                                    Update Service
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </main>
    )
}
