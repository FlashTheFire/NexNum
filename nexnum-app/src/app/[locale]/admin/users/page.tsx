"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Search, User, Shield, Ban, CheckCircle, Users, UserCheck, UserX, Crown,
    ChevronDown, ChevronRight, Wallet, Activity, Calendar, Filter,
    Download, X, ArrowUpDown, ArrowUp, ArrowDown, DollarSign, History,
    Eye, Check, Minus, Plus, Phone, Clock, Globe, Mail, Copy,
    TrendingUp, TrendingDown, Zap, RefreshCw, Hash
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { PremiumSkeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { formatDistanceToNow, format } from "date-fns"
import { useTranslations } from "next-intl"
import { useCurrency } from "@/providers/CurrencyProvider"
import { PriceDisplay } from "@/components/common/PriceDisplay"

// Types
interface AdminUser {
    id: string; email: string; name: string; role: "USER" | "ADMIN"; isBanned: boolean
    createdAt: string; updatedAt: string; numbersCount: number; activityCount: number
    walletBalance: number; hasWallet: boolean; walletId?: string
}

interface UserDetail extends AdminUser {
    transactions: Array<{ id: string; amount: number; type: string; description: string; createdAt: string }>
    numbers: Array<{ id: string; phoneNumber: string; countryName: string; serviceName: string; status: string; createdAt: string }>
    auditLogs: Array<{ id: string; action: string; resourceType: string; metadata: any; createdAt: string; ipAddress: string }>
}

interface Stats { total: number; admins: number; banned: number; active: number }
type RoleFilter = '' | 'ADMIN' | 'USER'
type StatusFilter = '' | 'active' | 'banned'
type SortField = 'createdAt' | 'name' | 'email' | 'walletBalance' | 'numbersCount'

// Premium Stat Card Component
const PremiumStatCard = ({ label, value, decimal, icon: Icon, color, status }: {
    label: string; value: string | number; decimal?: string; icon: any; color: string; status?: string
}) => (
    <div className={`relative overflow-hidden bg-gradient-to-br from-${color}-500/10 via-${color}-500/5 to-transparent border border-${color}-500/20 rounded-2xl p-4 h-[120px] flex flex-col justify-between`}>
        <div className="flex justify-between items-start">
            <div>
                <div className={`inline-flex items-center rounded-full border py-0.5 h-5 px-2 border-${color}-500/30 bg-${color}-500/10 text-${color}-400 text-[10px] uppercase tracking-wider font-bold`}>
                    {label}
                </div>
                <div className="h-10 flex items-center mt-2">
                    <span className="text-3xl font-mono font-bold text-white tracking-tight">{value}</span>
                    {decimal && <span className="text-lg text-gray-500 font-medium">{decimal}</span>}
                </div>
            </div>
            <div className={`w-10 h-10 rounded-xl bg-${color}-500/10 border border-${color}-500/30 flex items-center justify-center`} style={{ boxShadow: `0 0 15px -3px var(--tw-shadow-color)` }}>
                <Icon size={20} className={`text-${color}-400`} />
            </div>
        </div>
        {status && (
            <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-${color}-400 opacity-75`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 bg-${color}-400`}></span>
                </span>
                <span className={`text-[10px] font-medium tracking-wide uppercase text-${color}-400`}>{status}</span>
            </div>
        )}
    </div>
)

// Premium User Detail Sheet
const UserDetailSheet = ({ userId, onClose, onAction }: { userId: string; onClose: () => void; onAction: () => void }) => {
    const { formatBalance } = useCurrency()
    const [user, setUser] = useState<UserDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'activity' | 'numbers'>('overview')
    const [adjustAmount, setAdjustAmount] = useState('')
    const [adjustReason, setAdjustReason] = useState('')
    const [adjusting, setAdjusting] = useState(false)
    const [actionLoading, setActionLoading] = useState<string | null>(null)
    const [activeMetric, setActiveMetric] = useState(0)
    const [txPeriod, setTxPeriod] = useState(0) // 0: All, 1: Today, 2: Last Week, 3: Last Month
    const [txExpanded, setTxExpanded] = useState(false)

    useEffect(() => { fetchUser() }, [userId])

    const fetchUser = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/users?userId=${userId}`)
            const data = await res.json()
            if (data.user) setUser(data.user)
        } catch { toast.error("Failed to load") }
        finally { setLoading(false) }
    }

    const handleWalletAdjust = async (isCredit: boolean) => {
        const amount = parseFloat(adjustAmount)
        if (isNaN(amount) || amount <= 0) return toast.error("Enter valid amount")
        setAdjusting(true)
        try {
            const res = await fetch('/api/admin/users', {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, walletAdjustment: isCredit ? amount : -amount, adjustmentReason: adjustReason || `Admin ${isCredit ? 'credit' : 'debit'}` })
            })
            if (res.ok) {
                const data = await res.json()
                toast.success(data.message || `${isCredit ? 'Credited' : 'Debited'} successfully`)
                setAdjustAmount('')
                setAdjustReason('')
                fetchUser()
                onAction()
            } else {
                const data = await res.json()
                toast.error(data.error || "Action failed")
            }
        } catch { toast.error("Failed") }
        finally { setAdjusting(false) }
    }

    const handleQuickAction = async (action: string) => {
        if (!user) return
        setActionLoading(action)
        try {
            const body: any = { userId }
            if (action === 'ban') body.isBanned = true
            if (action === 'unban') body.isBanned = false
            if (action === 'promote') body.role = 'ADMIN'
            if (action === 'demote') body.role = 'USER'
            const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
            if (res.ok) { toast.success(`User ${action} successful`); fetchUser(); onAction() }
            else toast.error((await res.json()).error)
        } catch { toast.error("Failed") }
        finally { setActionLoading(null) }
    }

    const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); toast.success("Copied!") }

    const tabs = [
        { id: 'overview', label: 'Profile', icon: User },
        { id: 'transactions', label: 'Wallet', icon: Wallet },
        { id: 'numbers', label: 'Numbers', icon: Phone },
        { id: 'activity', label: 'Log', icon: Activity },
    ] as const

    // Split balance for display
    const balanceWhole = user ? Math.floor(user.walletBalance) : 0
    const balanceDecimal = user ? (user.walletBalance % 1).toFixed(2).substring(1) : '.00'

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md" onClick={onClose}>
            <motion.div
                initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                onClick={e => e.stopPropagation()}
                className="absolute bottom-0 left-0 right-0 h-[90vh] md:h-full md:w-[480px] md:left-auto md:right-0 bg-[#0a0b0d] border-t md:border-l border-white/10 rounded-t-3xl md:rounded-none shadow-2xl overflow-hidden flex flex-col"
            >
                {/* Header */}
                <div className="relative p-4 md:p-5 border-b border-white/5">
                    {/* Close Handle - Mobile */}
                    <div className="md:hidden w-12 h-1 bg-white/20 rounded-full mx-auto mb-4" />
                    <Button variant="ghost" size="sm" onClick={onClose} className="absolute right-3 top-3 md:top-4 h-8 w-8 p-0 rounded-full bg-white/5 hover:bg-white/10 z-10">
                        <X size={16} />
                    </Button>

                    {user && (
                        <div className="flex items-center gap-3">
                            <div className={`relative w-14 h-14 rounded-2xl flex items-center justify-center border ${user.isBanned ? 'bg-gradient-to-br from-red-500/20 to-red-600/5 border-red-500/30' : user.role === 'ADMIN' ? 'bg-gradient-to-br from-purple-500/20 to-purple-600/5 border-purple-500/30' : 'bg-gradient-to-br from-white/10 to-white/5 border-white/10'}`}>
                                {user.role === 'ADMIN' ? <Crown size={24} className="text-purple-400" /> : <User size={24} className={user.isBanned ? 'text-red-400' : 'text-gray-400'} />}
                                {user.isBanned && <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center"><Ban size={8} className="text-white" /></div>}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h2 className="text-lg font-bold text-white">{user.name || 'Unnamed'}</h2>
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${user.role === 'ADMIN' ? 'bg-purple-500/20 text-purple-300' : 'bg-white/10 text-gray-400'}`}>{user.role}</span>
                                    {user.isBanned && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-red-500/20 text-red-300">Banned</span>}
                                </div>
                                <button onClick={() => copyToClipboard(user.email)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 mt-0.5">
                                    <Mail size={10} /><span className="truncate max-w-[180px]">{user.email}</span><Copy size={8} className="opacity-50" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Quick Actions */}
                {user && (
                    <div className="px-4 py-2.5 border-b border-white/5 flex gap-2 overflow-x-auto scrollbar-hide">
                        {user.isBanned ? (
                            <Button size="sm" onClick={() => handleQuickAction('unban')} disabled={!!actionLoading} className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 h-8 text-xs rounded-lg">
                                {actionLoading === 'unban' ? <RefreshCw size={12} className="animate-spin mr-1.5" /> : <CheckCircle size={12} className="mr-1.5" />}Unban
                            </Button>
                        ) : (
                            <Button size="sm" onClick={() => handleQuickAction('ban')} disabled={!!actionLoading} className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 h-8 text-xs rounded-lg">
                                {actionLoading === 'ban' ? <RefreshCw size={12} className="animate-spin mr-1.5" /> : <Ban size={12} className="mr-1.5" />}Ban
                            </Button>
                        )}
                        {user.role === 'USER' ? (
                            <Button size="sm" onClick={() => handleQuickAction('promote')} disabled={!!actionLoading} className="bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20 h-8 text-xs rounded-lg">
                                {actionLoading === 'promote' ? <RefreshCw size={12} className="animate-spin mr-1.5" /> : <Shield size={12} className="mr-1.5" />}Promote
                            </Button>
                        ) : (
                            <Button size="sm" onClick={() => handleQuickAction('demote')} disabled={!!actionLoading} className="bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10 h-8 text-xs rounded-lg">
                                {actionLoading === 'demote' ? <RefreshCw size={12} className="animate-spin mr-1.5" /> : <TrendingDown size={12} className="mr-1.5" />}Demote
                            </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={fetchUser} className="h-8 text-xs rounded-lg ml-auto"><RefreshCw size={12} /></Button>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex border-b border-white/5">
                    {tabs.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium border-b-2 transition-all ${activeTab === tab.id ? 'border-[hsl(var(--neon-lime))] text-white bg-white/[0.02]' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
                            <tab.icon size={14} />{tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loading ? (
                        <div className="space-y-3">{[1, 2].map(i => <PremiumSkeleton key={i} className="h-28 w-full rounded-2xl" />)}</div>
                    ) : user && (
                        <AnimatePresence mode="wait">
                            {activeTab === 'overview' && (
                                <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                                    {/* Interactive Hero Card - Cycles through metrics on tap */}
                                    {(() => {
                                        const metrics = [
                                            { label: "Balance", value: formatBalance(user.walletBalance), decimal: "", icon: Wallet, color: "#10b981", bgFrom: "from-emerald-500/10", status: "Active Wallet" },
                                            { label: "Numbers", value: String(user.numbersCount || 0), decimal: "", icon: Phone, color: "#3b82f6", bgFrom: "from-blue-500/10", status: "Total Purchased" },
                                            { label: "Activity", value: String(user.activityCount || 0), decimal: "", icon: Zap, color: "#a855f7", bgFrom: "from-purple-500/10", status: "Actions Logged" },
                                            { label: "Joined", value: format(new Date(user.createdAt), 'MMM d'), decimal: `, ${format(new Date(user.createdAt), 'yyyy')}`, icon: Calendar, color: "#f97316", bgFrom: "from-orange-500/10", status: "Member Since" },
                                        ]
                                        const ActiveIcon = metrics[activeMetric].icon
                                        return (
                                            <motion.div
                                                whileTap={{ scale: 0.98 }}
                                                onClick={() => setActiveMetric((prev) => (prev + 1) % metrics.length)}
                                                className="relative w-full aspect-[1.6/1] rounded-2xl p-[1px] overflow-hidden cursor-pointer"
                                            >
                                                {/* Border Gradient */}
                                                <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-white/10" style={{ opacity: 0.5 }} />

                                                {/* Main Card Body */}
                                                <div className="relative h-full w-full bg-[#0f1115] rounded-[15px] overflow-hidden">
                                                    {/* Dynamic Background */}
                                                    <motion.div
                                                        animate={{ opacity: 1, background: `linear-gradient(135deg, ${metrics[activeMetric].color}15 0%, transparent 60%)` }}
                                                        transition={{ duration: 0.4 }}
                                                        className="absolute inset-0"
                                                    />

                                                    {/* Ambient Glow */}
                                                    <motion.div
                                                        animate={{ background: metrics[activeMetric].color, opacity: 0.15 }}
                                                        className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-[60px]"
                                                    />

                                                    {/* Content */}
                                                    <div className="relative z-10 h-full p-5 flex flex-col justify-between">
                                                        {/* Top Row */}
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <motion.div
                                                                    key={activeMetric}
                                                                    initial={{ opacity: 0, y: -5 }}
                                                                    animate={{ opacity: 1, y: 0 }}
                                                                    className="inline-flex items-center rounded-full border py-0.5 h-5 px-2 text-[10px] uppercase tracking-wider font-bold"
                                                                    style={{ borderColor: `${metrics[activeMetric].color}40`, backgroundColor: `${metrics[activeMetric].color}15`, color: metrics[activeMetric].color }}
                                                                >
                                                                    {metrics[activeMetric].label}
                                                                </motion.div>
                                                                <div className="h-14 flex items-center mt-2 overflow-hidden">
                                                                    <AnimatePresence mode="wait">
                                                                        <motion.span
                                                                            key={activeMetric}
                                                                            initial={{ y: 30, opacity: 0 }}
                                                                            animate={{ y: 0, opacity: 1 }}
                                                                            exit={{ y: -30, opacity: 0 }}
                                                                            transition={{ duration: 0.25 }}
                                                                            className="text-4xl font-mono font-bold text-white tracking-tight"
                                                                        >
                                                                            {metrics[activeMetric].value}
                                                                            <span className="text-lg text-gray-500 font-medium">{metrics[activeMetric].decimal}</span>
                                                                        </motion.span>
                                                                    </AnimatePresence>
                                                                </div>
                                                            </div>

                                                            {/* Dynamic Icon Box */}
                                                            <motion.div
                                                                animate={{ borderColor: metrics[activeMetric].color, boxShadow: `0 0 25px -5px ${metrics[activeMetric].color}50` }}
                                                                className="w-12 h-12 rounded-xl bg-white/[0.03] border flex items-center justify-center backdrop-blur-md"
                                                            >
                                                                <ActiveIcon size={22} style={{ color: metrics[activeMetric].color }} />
                                                            </motion.div>
                                                        </div>

                                                        {/* Bottom Row */}
                                                        <div className="flex items-end justify-between">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="relative flex h-2 w-2">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: metrics[activeMetric].color }}></span>
                                                                    <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: metrics[activeMetric].color }}></span>
                                                                </span>
                                                                <motion.span
                                                                    key={activeMetric}
                                                                    initial={{ opacity: 0 }}
                                                                    animate={{ opacity: 1 }}
                                                                    className="text-[10px] font-medium tracking-wide uppercase"
                                                                    style={{ color: metrics[activeMetric].color }}
                                                                >
                                                                    {metrics[activeMetric].status}
                                                                </motion.span>
                                                            </div>

                                                            {/* Navigation Dots */}
                                                            <div className="flex gap-1.5 p-1.5 rounded-full bg-white/[0.03] border border-white/[0.05]">
                                                                {[0, 1, 2, 3].map((idx) => (
                                                                    <button
                                                                        key={idx}
                                                                        onClick={(e) => { e.stopPropagation(); setActiveMetric(idx); }}
                                                                        className={`rounded-full transition-all duration-300 ${activeMetric === idx ? 'w-5 h-2' : 'w-2 h-2 hover:scale-125'}`}
                                                                        style={{ backgroundColor: activeMetric === idx ? metrics[idx].color : 'rgba(255,255,255,0.2)' }}
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )
                                    })()}

                                    {/* Transaction Metrics Matrix - Clickable Cycling */}
                                    {user.transactions && user.transactions.length > 0 && (() => {
                                        const periods = [
                                            { label: "All Time", filter: () => true, color: "#a855f7" },
                                            { label: "Today", filter: (d: Date) => { const now = new Date(); return d.toDateString() === now.toDateString() }, color: "#10b981" },
                                            { label: "Last Week", filter: (d: Date) => { const week = new Date(); week.setDate(week.getDate() - 7); return d >= week }, color: "#3b82f6" },
                                            { label: "Last Month", filter: (d: Date) => { const month = new Date(); month.setMonth(month.getMonth() - 1); return d >= month }, color: "#f97316" },
                                        ]
                                        const currentPeriod = periods[txPeriod]
                                        const filteredTx = user.transactions.filter(t => currentPeriod.filter(new Date(t.createdAt)))
                                        const deposits = filteredTx.filter(t => Number(t.amount) > 0)
                                        const withdrawals = filteredTx.filter(t => Number(t.amount) < 0)
                                        const totalDeposits = deposits.reduce((sum, t) => sum + Number(t.amount), 0)
                                        const totalSpent = Math.abs(withdrawals.reduce((sum, t) => sum + Number(t.amount), 0))
                                        const avgTransaction = filteredTx.length > 0
                                            ? Math.abs(filteredTx.reduce((sum, t) => sum + Number(t.amount), 0) / filteredTx.length)
                                            : 0
                                        const maxValue = Math.max(totalDeposits, totalSpent, 1)

                                        return (
                                            <motion.div
                                                className="bg-white/[0.02] border border-white/10 rounded-2xl overflow-hidden relative"
                                            >
                                                {/* Dynamic Glow */}
                                                <motion.div
                                                    animate={{ background: currentPeriod.color, opacity: 0.08 }}
                                                    className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[40px]"
                                                />

                                                {/* Header - Fold/Unfold */}
                                                <div className="relative p-4 flex items-center justify-between border-b border-white/5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                                                            <TrendingUp size={14} style={{ color: currentPeriod.color }} />
                                                        </div>
                                                        <div>
                                                            <span className="text-sm font-medium text-white">Transaction Matrix</span>
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <motion.span
                                                                    key={`period-${txPeriod}`}
                                                                    initial={{ opacity: 0, x: -5 }}
                                                                    animate={{ opacity: 1, x: 0 }}
                                                                    className="text-[10px] font-medium"
                                                                    style={{ color: currentPeriod.color }}
                                                                >
                                                                    {currentPeriod.label}
                                                                </motion.span>
                                                                <span className="text-[10px] text-gray-600">•</span>
                                                                <span className="text-[10px] text-gray-500 font-mono">{filteredTx.length} transactions</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Fold/Unfold Button */}
                                                    <button
                                                        onClick={() => setTxExpanded(!txExpanded)}
                                                        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
                                                    >
                                                        <motion.div animate={{ rotate: txExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                                                            <ChevronDown size={16} className="text-gray-400" />
                                                        </motion.div>
                                                    </button>
                                                </div>

                                                {/* Expandable Content */}
                                                <AnimatePresence>
                                                    {txExpanded && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: 'auto', opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.25 }}
                                                            className="overflow-hidden"
                                                        >
                                                            {/* Period Tabs */}
                                                            <div className="flex border-b border-white/5">
                                                                {periods.map((p, idx) => (
                                                                    <button
                                                                        key={idx}
                                                                        onClick={() => setTxPeriod(idx)}
                                                                        className={`flex-1 py-2.5 text-[10px] font-medium uppercase tracking-wider transition-all border-b-2 ${txPeriod === idx ? 'text-white border-current' : 'text-gray-500 border-transparent hover:text-gray-300'}`}
                                                                        style={txPeriod === idx ? { color: p.color, borderColor: p.color } : {}}
                                                                    >
                                                                        {p.label}
                                                                    </button>
                                                                ))}
                                                            </div>

                                                            {/* Clickable Matrix - Cycles on tap */}
                                                            <motion.div
                                                                whileTap={{ scale: 0.99 }}
                                                                onClick={() => setTxPeriod((prev) => (prev + 1) % periods.length)}
                                                                className="p-4 space-y-4 cursor-pointer"
                                                            >
                                                                {/* Matrix Grid */}
                                                                <div className="grid grid-cols-2 gap-3">
                                                                    {/* Total Deposits */}
                                                                    <div className="bg-black/20 rounded-xl p-3 space-y-2">
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Deposits</span>
                                                                            <span className="text-[10px] text-emerald-400 font-mono">{deposits.length}</span>
                                                                        </div>
                                                                        <AnimatePresence mode="wait">
                                                                            <motion.div key={`dep-${txPeriod}`} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-lg font-mono font-bold text-emerald-400">+${totalDeposits.toFixed(2)}</motion.div>
                                                                        </AnimatePresence>
                                                                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                                            <motion.div key={`dep-bar-${txPeriod}`} initial={{ width: 0 }} animate={{ width: `${(totalDeposits / maxValue) * 100}%` }} className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full" />
                                                                        </div>
                                                                    </div>

                                                                    {/* Total Spent */}
                                                                    <div className="bg-black/20 rounded-xl p-3 space-y-2">
                                                                        <div className="flex items-center justify-between">
                                                                            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Spent</span>
                                                                            <span className="text-[10px] text-red-400 font-mono">{withdrawals.length}</span>
                                                                        </div>
                                                                        <AnimatePresence mode="wait">
                                                                            <motion.div key={`spent-${txPeriod}`} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-lg font-mono font-bold text-red-400">-${totalSpent.toFixed(2)}</motion.div>
                                                                        </AnimatePresence>
                                                                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                                            <motion.div key={`spent-bar-${txPeriod}`} initial={{ width: 0 }} animate={{ width: `${(totalSpent / maxValue) * 100}%` }} className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full" />
                                                                        </div>
                                                                    </div>

                                                                    {/* Purchases */}
                                                                    <div className="bg-black/20 rounded-xl p-3 space-y-1">
                                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Purchases</span>
                                                                        <div className={`text-lg font-mono font-bold ${withdrawals.length > 0 ? 'text-purple-400' : 'text-gray-500'}`}>{withdrawals.length}</div>
                                                                    </div>

                                                                    {/* Revenue */}
                                                                    <div className="bg-black/20 rounded-xl p-3 space-y-1">
                                                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Revenue</span>
                                                                        <div className="text-lg font-mono font-bold text-white">${totalSpent.toFixed(2)}</div>
                                                                    </div>
                                                                </div>

                                                                {/* Recent Activity Sparkline */}
                                                                <div className="flex items-end gap-0.5 h-8 pt-2 border-t border-white/5">
                                                                    {filteredTx.slice(0, 12).reverse().map((tx, i) => (
                                                                        <motion.div key={`${txPeriod}-${i}`} initial={{ height: 0 }} animate={{ height: `${Math.min(Math.abs(Number(tx.amount)) / 10, 100)}%` }} transition={{ delay: i * 0.03 }} className={`flex-1 rounded-t ${Number(tx.amount) > 0 ? 'bg-emerald-500/50' : 'bg-red-500/50'}`} style={{ minHeight: '4px' }} />
                                                                    ))}
                                                                    {filteredTx.length === 0 && (
                                                                        <div className="w-full text-center text-[10px] text-gray-600">No transactions in this period</div>
                                                                    )}
                                                                </div>
                                                            </motion.div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </motion.div>
                                        )
                                    })()}

                                    {/* Wallet Adjustment */}
                                    <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-4 space-y-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-[hsl(var(--neon-lime))]/10 border border-[hsl(var(--neon-lime))]/30 flex items-center justify-center">
                                                <DollarSign size={16} style={{ color: 'hsl(var(--neon-lime))' }} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-medium text-white">Wallet Adjustment</h3>
                                                <p className="text-[10px] text-gray-500">Add or remove funds</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="relative col-span-2">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg font-mono">$</span>
                                                <Input type="number" placeholder="0.00" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} className="pl-7 bg-black/30 border-white/10 h-12 text-xl font-mono" />
                                            </div>
                                            <Input placeholder="Reason" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} className="col-span-2 bg-black/30 border-white/10 h-10 text-sm" />
                                            <Button onClick={() => handleWalletAdjust(true)} disabled={adjusting || !adjustAmount} className="h-11 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl">
                                                <Plus size={16} className="mr-1.5" /> Credit
                                            </Button>
                                            <Button onClick={() => handleWalletAdjust(false)} disabled={adjusting || !adjustAmount} className="h-11 bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 rounded-xl">
                                                <Minus size={16} className="mr-1.5" /> Debit
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Bottom Spacer */}
                                    <div className="h-6" />
                                </motion.div>
                            )}

                            {activeTab === 'transactions' && (
                                <motion.div key="transactions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                                    {user.transactions?.length > 0 ? user.transactions.map((tx, i) => (
                                        <motion.div key={tx.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${Number(tx.amount) > 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                                                {Number(tx.amount) > 0 ? <TrendingUp size={16} className="text-emerald-400" /> : <TrendingDown size={16} className="text-red-400" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm text-white truncate">{tx.description || tx.type}</div>
                                                <div className="text-[10px] text-gray-500">{format(new Date(tx.createdAt), 'MMM d, HH:mm')}</div>
                                            </div>
                                            <div className={`font-mono font-semibold ${Number(tx.amount) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {Number(tx.amount) > 0 ? '+' : ''}<PriceDisplay amountInPoints={Math.abs(Number(tx.amount))} />
                                            </div>
                                        </motion.div>
                                    )) : <div className="text-center py-12 text-gray-500 text-sm">No transactions</div>}
                                </motion.div>
                            )}

                            {activeTab === 'numbers' && (
                                <motion.div key="numbers" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                                    {user.numbers?.length > 0 ? user.numbers.map((num, i) => (
                                        <motion.div key={num.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="font-mono text-white text-sm">{num.phoneNumber}</span>
                                                <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase font-bold ${num.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : num.status === 'received' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-400'}`}>{num.status}</span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-500">
                                                <span>{num.serviceName}</span><span>•</span><span>{num.countryName}</span>
                                            </div>
                                        </motion.div>
                                    )) : <div className="text-center py-12 text-gray-500 text-sm">No numbers</div>}
                                </motion.div>
                            )}

                            {activeTab === 'activity' && (
                                <motion.div key="activity" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                                    {user.auditLogs?.length > 0 ? user.auditLogs.map((log, i) => (
                                        <motion.div key={log.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }} className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="font-medium text-white text-sm">{log.action}</div>
                                                <span className="text-[9px] px-2 py-0.5 rounded bg-white/5 text-gray-400 flex-shrink-0">{log.resourceType}</span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-500">
                                                <span className="flex items-center gap-1"><Clock size={10} />{format(new Date(log.createdAt), 'MMM d, HH:mm')}</span>
                                                <span className="flex items-center gap-1"><Globe size={10} />{log.ipAddress}</span>
                                            </div>
                                        </motion.div>
                                    )) : <div className="text-center py-12 text-gray-500 text-sm">No activity</div>}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    )
                    }
                </div >
            </motion.div >
        </motion.div >
    )
}

// Main Page
export default function UsersPage() {
    const t = useTranslations("admin.users")
    const [users, setUsers] = useState<AdminUser[]>([])

    const [stats, setStats] = useState<Stats>({ total: 0, admins: 0, banned: 0, active: 0 })
    const [isLoading, setIsLoading] = useState(true)
    const [search, setSearch] = useState("")
    const [page, setPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const [total, setTotal] = useState(0)
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
    const [showFilters, setShowFilters] = useState(false)
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
    const [sortField, setSortField] = useState<SortField>('createdAt')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
    const [detailUserId, setDetailUserId] = useState<string | null>(null)
    const [exporting, setExporting] = useState(false)
    const statsScrollRef = useRef<HTMLDivElement>(null)
    const [statsScrollProgress, setStatsScrollProgress] = useState(0)

    const fetchUsers = useCallback(async () => {
        setIsLoading(true)
        try {
            const params = new URLSearchParams({ q: search, page: String(page), limit: '15', sortBy: sortField, sortOrder, ...(roleFilter && { role: roleFilter }), ...(statusFilter && { status: statusFilter }) })
            const res = await fetch(`/api/admin/users?${params}`)
            const data = await res.json()
            if (data.users) { setUsers(data.users); setTotalPages(data.pages); setTotal(data.total) }
            if (data.stats) setStats(data.stats)
        } catch { toast.error("Failed") }
        finally { setIsLoading(false) }
    }, [search, page, roleFilter, statusFilter, sortField, sortOrder])

    useEffect(() => { const t = setTimeout(fetchUsers, 300); return () => clearTimeout(t) }, [fetchUsers])

    const handleAction = async (userId: string, action: string) => {
        const body: any = { userId }
        if (action === 'ban') body.isBanned = true
        if (action === 'unban') body.isBanned = false
        if (action === 'promote') body.role = 'ADMIN'
        if (action === 'demote') body.role = 'USER'
        const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        if (res.ok) { toast.success(`User ${action} successful`); fetchUsers() }
    }

    const handleBulkAction = async (action: string) => {
        if (selectedUsers.size === 0) return
        const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, userIds: Array.from(selectedUsers) }) })
        if (res.ok) { toast.success((await res.json()).message); setSelectedUsers(new Set()); fetchUsers() }
    }

    const handleExport = async () => {
        setExporting(true)
        try {
            const res = await fetch(`/api/admin/users?export=csv&q=${search}`)
            const data = await res.json()
            if (data.csvData) {
                const csv = ['ID,Email,Name,Role,Status,Balance,Numbers,Joined', ...data.csvData.map((u: any) => `${u.id},${u.email},${u.name},${u.role},${u.status},${u.balance},${u.numbers},${u.joinedAt}`)].join('\n')
                const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `users-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click()
                toast.success(`Exported ${data.csvData.length} users`)
            }
        } catch { toast.error("Export failed") }
        finally { setExporting(false) }
    }

    const toggleRow = (id: string) => setExpandedRows(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
    const toggleSelect = (id: string) => setSelectedUsers(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
    const toggleSelectAll = () => setSelectedUsers(p => p.size === users.length ? new Set() : new Set(users.map(u => u.id)))
    const handleSort = (f: SortField) => { setSortField(f); setSortOrder(p => sortField === f ? (p === 'asc' ? 'desc' : 'asc') : 'desc') }
    const hasActiveFilters = roleFilter || statusFilter || search
    const SortIcon = ({ field }: { field: SortField }) => sortField !== field ? <ArrowUpDown size={12} className="text-gray-600" /> : sortOrder === 'asc' ? <ArrowUp size={12} className="text-[hsl(var(--neon-lime))]" /> : <ArrowDown size={12} className="text-[hsl(var(--neon-lime))]" />

    return (
        <div className="min-h-screen p-4 md:p-8 pb-28 md:pb-8 max-w-7xl mx-auto space-y-4">
            <AnimatePresence>{detailUserId && <UserDetailSheet userId={detailUserId} onClose={() => setDetailUserId(null)} onAction={fetchUsers} />}</AnimatePresence>

            {/* Header */}
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                        <span className="w-1.5 h-6 md:h-8 bg-[hsl(var(--neon-lime))] rounded-full" style={{ boxShadow: '0 0 15px hsl(var(--neon-lime))' }} />
                        {t('title')}
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">{t('subtitle')}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={handleExport} disabled={exporting} className="h-8 text-xs"><Download size={14} className={`md:mr-1.5 ${exporting ? 'animate-pulse' : ''}`} /><span className="hidden md:inline">{t('actions.export')}</span></Button>
                    {/* Desktop Filter Button */}
                    <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)} className={`hidden md:flex h-8 text-xs ${showFilters ? 'bg-white/10' : ''}`}><Filter size={14} className="mr-1.5" />{t('actions.filter')}{hasActiveFilters && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-lime))]" />}</Button>
                </div>
            </div>

            {/* Bulk Actions */}
            <AnimatePresence>
                {selectedUsers.size > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="bg-[hsl(var(--neon-lime))]/10 border border-[hsl(var(--neon-lime))]/30 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm text-white"><strong>{selectedUsers.size}</strong> selected</span>
                            <div className="flex gap-1.5">
                                <Button size="sm" variant="ghost" onClick={() => handleBulkAction('ban')} className="h-7 text-xs text-red-400"><Ban size={12} className="mr-1" />Ban</Button>
                                <Button size="sm" variant="ghost" onClick={() => handleBulkAction('unban')} className="h-7 text-xs text-emerald-400"><CheckCircle size={12} className="mr-1" />Unban</Button>
                                <Button size="sm" variant="ghost" onClick={() => setSelectedUsers(new Set())} className="h-7 text-xs"><X size={12} /></Button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Stats */}
            <div className="relative">
                <div ref={statsScrollRef} onScroll={e => { const el = e.currentTarget; setStatsScrollProgress(el.scrollWidth > el.clientWidth ? el.scrollLeft / (el.scrollWidth - el.clientWidth) : 0) }} className="flex overflow-x-auto snap-x gap-3 pb-4 md:pb-0 md:grid md:grid-cols-4 scrollbar-hide">
                    {[{ v: stats.total, l: t('stats.total'), icon: Users, c: 'blue', f: () => { setRoleFilter(''); setStatusFilter('') } }, { v: stats.active, l: t('stats.active'), icon: UserCheck, c: 'emerald', f: () => { setStatusFilter('active'); setRoleFilter('') } }, { v: stats.admins, l: t('stats.admins'), icon: Crown, c: 'purple', f: () => { setRoleFilter('ADMIN'); setStatusFilter('') } }, { v: stats.banned, l: t('stats.banned'), icon: UserX, c: 'red', f: () => { setStatusFilter('banned'); setRoleFilter('') } }].map((s, i) => (
                        <motion.div key={s.l} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} onClick={() => { s.f(); setPage(1) }}
                            className={`min-w-[120px] flex-shrink-0 md:min-w-0 snap-start bg-white/[0.02] border rounded-xl p-3 cursor-pointer transition-all ${(s.l === t('stats.total') && !roleFilter && !statusFilter) || (s.l === t('stats.active') && statusFilter === 'active') || (s.l === t('stats.admins') && roleFilter === 'ADMIN') || (s.l === t('stats.banned') && statusFilter === 'banned') ? 'border-[hsl(var(--neon-lime))]' : 'border-white/5 hover:border-white/10'}`}
                        >
                            <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-lg bg-${s.c}-500/10 flex items-center justify-center`}><s.icon size={16} className={`text-${s.c}-400`} /></div>
                                <div><div className="text-lg font-bold text-white">{s.v}</div><div className="text-[10px] text-gray-500 uppercase">{s.l}</div></div>
                            </div>
                        </motion.div>
                    ))}
                </div>
                <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-1 md:hidden">
                    {[0, 1, 2, 3].map(i => <motion.div key={i} layout animate={{ width: (i === 0 && statsScrollProgress < 0.25) || (i === 1 && statsScrollProgress >= 0.25 && statsScrollProgress < 0.5) || (i === 2 && statsScrollProgress >= 0.5 && statsScrollProgress < 0.75) || (i === 3 && statsScrollProgress >= 0.75) ? 10 : 4 }} className="h-1 rounded-full bg-[hsl(var(--neon-lime))]" style={{ opacity: (i === 0 && statsScrollProgress < 0.25) || (i === 1 && statsScrollProgress >= 0.25 && statsScrollProgress < 0.5) || (i === 2 && statsScrollProgress >= 0.5 && statsScrollProgress < 0.75) || (i === 3 && statsScrollProgress >= 0.75) ? 1 : 0.3 }} />)}
                </div>
            </div>

            {/* Filters */}
            <AnimatePresence>{showFilters && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><div className="bg-white/[0.02] border border-white/10 rounded-xl p-3 flex flex-wrap gap-2 items-center text-xs"><span className="text-gray-400">Role:</span>{(['', 'USER', 'ADMIN'] as RoleFilter[]).map(r => <Button key={r || 'all'} size="sm" onClick={() => setRoleFilter(r)} className={`h-6 text-[10px] px-2.5 font-medium ${roleFilter === r ? 'bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(var(--neon-lime))]/90' : 'bg-white/5 text-white hover:bg-white/10'}`}>{r || 'All'}</Button>)}<span className="text-gray-400 ml-3">Status:</span>{(['', 'active', 'banned'] as StatusFilter[]).map(s => <Button key={s || 'all'} size="sm" onClick={() => setStatusFilter(s)} className={`h-6 text-[10px] px-2.5 font-medium ${statusFilter === s ? 'bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(var(--neon-lime))]/90' : 'bg-white/5 text-white hover:bg-white/10'}`}>{s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}</Button>)}{hasActiveFilters && <Button size="sm" variant="ghost" onClick={() => { setRoleFilter(''); setStatusFilter(''); setSearch('') }} className="h-6 text-[10px] text-gray-400 hover:text-white">Clear</Button>}</div></motion.div>)}</AnimatePresence>

            {/* Search + Mobile Filter */}
            <div className="flex items-center gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                    <Input placeholder={t('actions.search')} className="pl-9 bg-white/[0.02] border-white/10 h-10" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
                </div>
                {/* Mobile Filter Button */}
                <Button variant="ghost" size="sm" onClick={() => setShowFilters(!showFilters)} className={`md:hidden h-10 w-10 p-0 ${showFilters ? 'bg-white/10' : ''}`}>
                    <Filter size={16} className="text-gray-400" />
                    {hasActiveFilters && <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-lime))]" />}
                </Button>
                <span className="hidden md:inline text-xs text-gray-500 whitespace-nowrap">{total}</span>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden">
                <table className="w-full text-sm"><thead className="bg-white/[0.02] text-gray-400"><tr><th className="px-3 py-2.5 w-10"><button onClick={toggleSelectAll} className={`w-4 h-4 rounded border flex items-center justify-center ${selectedUsers.size === users.length && users.length > 0 ? 'bg-[hsl(var(--neon-lime))] border-[hsl(var(--neon-lime))]' : 'border-white/20'}`}>{selectedUsers.size === users.length && users.length > 0 && <Check size={10} className="text-black" />}</button></th><th className="px-3 py-2.5 text-left cursor-pointer hover:text-white text-xs" onClick={() => handleSort('name')}><span className="flex items-center gap-1.5">{t('table.user')}<SortIcon field="name" /></span></th><th className="px-3 py-2.5 text-left text-xs">{t('table.role')}</th><th className="px-3 py-2.5 text-left cursor-pointer hover:text-white text-xs" onClick={() => handleSort('walletBalance')}><span className="flex items-center gap-1.5">{t('table.balance')}<SortIcon field="walletBalance" /></span></th><th className="px-3 py-2.5 text-left cursor-pointer hover:text-white text-xs" onClick={() => handleSort('createdAt')}><span className="flex items-center gap-1.5">{t('table.joined')}<SortIcon field="createdAt" /></span></th><th className="px-3 py-2.5 text-right text-xs">{t('table.actions')}</th></tr></thead><tbody className="divide-y divide-white/5">{isLoading ? [...Array(5)].map((_, i) => <tr key={i}><td colSpan={6} className="p-2"><PremiumSkeleton className="h-10 w-full" /></td></tr>) : users.length === 0 ? <tr><td colSpan={6} className="py-10 text-center text-gray-500 text-sm">No users</td></tr> : users.map((u, i) => (<motion.tr key={u.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }} className="hover:bg-white/[0.02] group"><td className="px-3 py-2"><button onClick={() => toggleSelect(u.id)} className={`w-4 h-4 rounded border flex items-center justify-center ${selectedUsers.has(u.id) ? 'bg-[hsl(var(--neon-lime))] border-[hsl(var(--neon-lime))]' : 'border-white/20'}`}>{selectedUsers.has(u.id) && <Check size={10} className="text-black" />}</button></td><td className="px-3 py-2"><div className="flex items-center gap-2.5"><div className={`w-8 h-8 rounded-lg flex items-center justify-center ${u.isBanned ? 'bg-red-500/10' : u.role === 'ADMIN' ? 'bg-purple-500/10' : 'bg-white/5'}`}>{u.role === 'ADMIN' ? <Crown size={14} className="text-purple-400" /> : <User size={14} className={u.isBanned ? 'text-red-400' : 'text-gray-400'} />}</div><div><div className="text-white text-sm flex items-center gap-1.5">{u.name || 'Unnamed'}{u.isBanned && <span className="bg-red-500/10 text-red-400 text-[8px] px-1 rounded">BAN</span>}</div><div className="text-[10px] text-gray-500 truncate max-w-[150px]">{u.email}</div></div></div></td><td className="px-3 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${u.role === 'ADMIN' ? 'bg-purple-500/10 text-purple-400' : 'bg-white/5 text-gray-400'}`}>{u.role}</span></td><td className="px-3 py-2"><span className={`font-mono text-sm ${u.walletBalance > 0 ? 'text-emerald-400' : 'text-gray-500'}`}><PriceDisplay amountInPoints={u.walletBalance} /></span></td><td className="px-3 py-2 text-gray-500 text-xs">{formatDistanceToNow(new Date(u.createdAt))} ago</td><td className="px-3 py-2"><div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"><Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDetailUserId(u.id)}><Eye size={14} /></Button><Button size="sm" variant="ghost" className={`h-7 w-7 p-0 ${u.isBanned ? 'text-emerald-400' : 'text-red-400'}`} onClick={() => handleAction(u.id, u.isBanned ? 'unban' : 'ban')}>{u.isBanned ? <CheckCircle size={14} /> : <Ban size={14} />}</Button></div></td></motion.tr>))}</tbody></table>
                <div className="p-3 border-t border-white/5 flex justify-center gap-2"><Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="h-8 text-xs">Prev</Button><span className="px-3 py-1.5 text-xs text-gray-500">{page}/{totalPages}</span><Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-8 text-xs">Next</Button></div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
                {isLoading ? [...Array(3)].map((_, i) => <PremiumSkeleton key={i} className="h-16 w-full rounded-xl" />) : users.length === 0 ? <div className="text-center py-10 text-gray-500 bg-white/[0.02] rounded-xl text-sm">No users</div> : users.map((u, i) => (
                    <motion.div key={u.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className={`bg-white/[0.02] border rounded-xl overflow-hidden ${selectedUsers.has(u.id) ? 'border-[hsl(var(--neon-lime))]' : 'border-white/5'}`}>
                        <div className="p-3 flex items-center gap-2.5">
                            <button onClick={() => toggleSelect(u.id)} className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${selectedUsers.has(u.id) ? 'bg-[hsl(var(--neon-lime))] border-[hsl(var(--neon-lime))]' : 'border-white/20'}`}>{selectedUsers.has(u.id) && <Check size={12} className="text-black" />}</button>
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${u.isBanned ? 'bg-red-500/10' : u.role === 'ADMIN' ? 'bg-purple-500/10' : 'bg-white/5'}`}>{u.role === 'ADMIN' ? <Crown size={16} className="text-purple-400" /> : <User size={16} className={u.isBanned ? 'text-red-400' : 'text-gray-400'} />}</div>
                            <div className="flex-1 min-w-0" onClick={() => toggleRow(u.id)}>
                                <div className="flex items-center gap-1.5"><span className="text-white text-sm font-medium truncate">{u.name || 'Unnamed'}</span>{u.role === 'ADMIN' && <span className="bg-purple-500/10 text-purple-400 text-[8px] px-1 rounded">ADM</span>}{u.isBanned && <span className="bg-red-500/10 text-red-400 text-[8px] px-1 rounded">BAN</span>}</div>
                                <div className="text-[10px] text-gray-500 truncate">{u.email}</div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`font-mono text-sm ${u.walletBalance > 0 ? 'text-emerald-400' : 'text-gray-500'}`}><PriceDisplay amountInPoints={u.walletBalance} /></span>
                                <button onClick={() => toggleRow(u.id)}>{expandedRows.has(u.id) ? <ChevronDown size={16} className="text-gray-500" /> : <ChevronRight size={16} className="text-gray-500" />}</button>
                            </div>
                        </div>
                        <AnimatePresence>{expandedRows.has(u.id) && (<motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-white/5 overflow-hidden"><div className="p-3 flex gap-2"><Button size="sm" className="flex-1 h-9 bg-white/5 text-white border border-white/10 text-xs rounded-lg" onClick={() => setDetailUserId(u.id)}><Eye size={14} className="mr-1.5" />Details</Button><Button size="sm" className={`flex-1 h-9 text-xs rounded-lg ${u.isBanned ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'} border`} onClick={() => handleAction(u.id, u.isBanned ? 'unban' : 'ban')}>{u.isBanned ? <><CheckCircle size={14} className="mr-1.5" />Unban</> : <><Ban size={14} className="mr-1.5" />Ban</>}</Button></div></motion.div>)}</AnimatePresence>
                    </motion.div>
                ))}
                {users.length > 0 && <div className="flex justify-center items-center gap-2 pt-2"><Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="h-9 text-xs">Prev</Button><span className="text-xs text-gray-500">{page}/{totalPages}</span><Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-9 text-xs">Next</Button></div>}
            </div>
        </div>
    )
}
