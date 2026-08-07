"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { motion, AnimatePresence, Variants } from "framer-motion"
import {
    Wallet,
    Plus,
    Shield,
    ArrowUpRight,
    ArrowDownRight,
    History,
    Sparkles,
    Download,
    Search,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Clock,
    AlertCircle,
    RotateCcw,
    ChevronLeft,
    ChevronRight,
    Ban
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useGlobalStore } from "@/stores/appStore"
import { useAuthStore } from "@/stores/authStore"
import { cn } from "@/lib/utils/utils"
import { BalanceDisplay, PriceDisplay } from "@/components/common/PriceDisplay"
import { useCurrency } from "@/providers/CurrencyProvider"
import { DepositDialog } from "@/components/wallet/deposit-dialog"

// Animation Variants
const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
}

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
}

const cardTilt: Variants = {
    rest: { rotateX: 0, rotateY: 0, scale: 1 },
    hover: {
        rotateX: 2,
        rotateY: 2,
        scale: 1.02,
        transition: { duration: 0.4, type: "spring" }
    }
}

const ITEMS_PER_PAGE = 6

export default function WalletPage() {
    const { user } = useAuthStore()
    const { userProfile, transactions, fetchTransactions, fetchBalance, isLoadingTransactions } = useGlobalStore()
    const [amount, setAmount] = useState<string>("")
    const [customFocused, setCustomFocused] = useState(false)
    const { currencies, preferredCurrency, formatPrice } = useCurrency()
    
    // Deposit Dialog State
    const [depositDialogOpen, setDepositDialogOpen] = useState(false)
    const [selectedDepositAmount, setSelectedDepositAmount] = useState<number | string>("")

    // Scroll ref for Add Funds section
    const addFundsRef = useRef<HTMLDivElement>(null)
    const customInputRef = useRef<HTMLInputElement>(null)

    // Filters & Pagination
    const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit' | 'other'>('all')
    const [currentPage, setCurrentPage] = useState(1)

    useEffect(() => {
        fetchTransactions()
    }, [fetchTransactions])

    const activeCurrencyObj = currencies[preferredCurrency]
    const currencySym = activeCurrencyObj?.symbol || '$'
    const currencyRate = activeCurrencyObj?.rate || 1

    // Server-synced Dynamic Presets based on active currency
    const dynamicPresets = useMemo(() => {
        if (preferredCurrency === 'INR') {
            return [
                { value: 100, label: '₹100' },
                { value: 500, label: '₹500' },
                { value: 1000, label: '₹1,000' },
                { value: 2500, label: '₹2,500' }
            ]
        }
        if (preferredCurrency === 'USD' || preferredCurrency === 'EUR' || preferredCurrency === 'GBP') {
            return [
                { value: 10, label: `${currencySym}10` },
                { value: 25, label: `${currencySym}25` },
                { value: 50, label: `${currencySym}50` },
                { value: 100, label: `${currencySym}100` }
            ]
        }
        if (preferredCurrency === 'RUB') {
            return [
                { value: 500, label: '₽500' },
                { value: 1000, label: '₽1,000' },
                { value: 2500, label: '₽2,500' },
                { value: 5000, label: '₽5,000' }
            ]
        }

        // Generic calculation for any server-fetched currency
        const baseValues = [10, 25, 50, 100]
        return baseValues.map(base => {
            const raw = base * currencyRate
            let rounded = raw
            if (raw >= 10000) rounded = Math.round(raw / 5000) * 5000
            else if (raw >= 1000) rounded = Math.round(raw / 500) * 500
            else if (raw >= 100) rounded = Math.round(raw / 50) * 50
            else if (raw >= 10) rounded = Math.round(raw / 5) * 5
            else rounded = Math.round(raw)
            
            const val = Math.max(1, rounded)
            return {
                value: val,
                label: `${currencySym}${val.toLocaleString()}`
            }
        })
    }, [preferredCurrency, currencySym, currencyRate])

    // User Card Last 4 Digits
    const userCardLast4 = user?.id ? user.id.slice(-4).toUpperCase() : "8888"

    // Filter Logic
    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            const type = t.type ? t.type.toLowerCase() : ''
            const status = t.status ? t.status.toLowerCase() : ''

            if (filterType === 'all') return true
            if (filterType === 'credit') {
                return ['topup', 'manual_credit', 'referral_bonus', 'refund'].includes(type)
            }
            if (filterType === 'debit') {
                return ['purchase', 'manual_debit'].includes(type)
            }
            if (filterType === 'other') {
                return ['cancelled', 'timeout', 'expired', 'failed'].includes(status) || ['cancelled', 'timeout'].includes(type)
            }
            return true
        })
    }, [transactions, filterType])

    // Reset pagination when filter changes
    useEffect(() => {
        setCurrentPage(1)
    }, [filterType])

    // Pagination Calculations
    const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE) || 1
    const paginatedTransactions = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE
        return filteredTransactions.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredTransactions, currentPage])

    // Handlers
    const handleDepositClick = () => {
        if (addFundsRef.current) {
            addFundsRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
            setTimeout(() => {
                customInputRef.current?.focus()
            }, 300)
        }
    }

    const handleWithdrawClick = () => {
        toast.info("Withdrawal functionality is currently not available. Please contact support for assistance.", {
            description: "Bank transfers and crypto withdrawals will be enabled in an upcoming release."
        })
    }

    const handleOpenDepositDialog = () => {
        const val = parseFloat(amount)
        if (isNaN(val) || val <= 0) {
            toast.error("Please enter a valid amount to deposit")
            return
        }
        setSelectedDepositAmount(val)
        setDepositDialogOpen(true)
    }

    const downloadReport = () => {
        const headers = ["ID", "Date", "Type", "Amount", "Description", "Status"]
        const rows = filteredTransactions.map(t => [
            t.id,
            new Date(t.date).toLocaleString(),
            t.type,
            formatPrice(t.amount),
            t.description,
            t.status
        ])

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n")

        const encodedUri = encodeURI(csvContent)
        const link = document.createElement("a")
        link.setAttribute("href", encodedUri)
        link.setAttribute("download", `wallet_report_${new Date().toISOString()}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        toast.success("Report downloaded successfully")
    }

    // Helper function for transaction status rendering
    const renderStatusBadge = (status?: string, type?: string) => {
        const s = (status || '').toLowerCase()
        const t = (type || '').toLowerCase()

        if (s === 'completed' || s === 'success') {
            return (
                <Badge variant="outline" className="text-[10px] h-5 border-emerald-500/50 text-emerald-400 bg-emerald-500/10 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Completed
                </Badge>
            )
        }
        if (s === 'pending' || s === 'submitted') {
            return (
                <Badge variant="outline" className="text-[10px] h-5 border-amber-500/50 text-amber-400 bg-amber-500/10 flex items-center gap-1">
                    <Clock className="w-3 h-3 animate-spin" /> Pending Verification
                </Badge>
            )
        }
        if (s === 'cancelled' || t === 'cancelled') {
            return (
                <Badge variant="outline" className="text-[10px] h-5 border-rose-500/50 text-rose-400 bg-rose-500/10 flex items-center gap-1">
                    <XCircle className="w-3 h-3" /> Cancelled
                </Badge>
            )
        }
        if (t === 'refund' || s === 'refunded') {
            return (
                <Badge variant="outline" className="text-[10px] h-5 border-purple-500/50 text-purple-400 bg-purple-500/10 flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Refunded
                </Badge>
            )
        }
        if (s === 'timeout' || s === 'expired' || s === 'failed') {
            return (
                <Badge variant="outline" className="text-[10px] h-5 border-slate-500/50 text-slate-400 bg-slate-500/10 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {s === 'timeout' ? 'Timeout' : 'Expired'}
                </Badge>
            )
        }

        return (
            <Badge variant="outline" className="text-[10px] h-5 border-gray-500/50 text-gray-400 bg-gray-500/10">
                {status || 'Success'}
            </Badge>
        )
    }

    // Helper for transaction icon
    const renderTransactionIcon = (type?: string, status?: string) => {
        const t = (type || '').toLowerCase()
        const s = (status || '').toLowerCase()

        if (t === 'refund' || s === 'refunded') {
            return <RotateCcw className="h-5 w-5 text-purple-400" />
        }
        if (s === 'cancelled' || t === 'cancelled') {
            return <Ban className="h-5 w-5 text-rose-400" />
        }
        if (s === 'timeout' || s === 'expired' || s === 'failed') {
            return <AlertCircle className="h-5 w-5 text-slate-400" />
        }
        if (['topup', 'manual_credit'].includes(t)) {
            return <ArrowDownRight className="h-5 w-5 text-emerald-400" />
        }
        if (['purchase', 'manual_debit'].includes(t)) {
            return <ArrowUpRight className="h-5 w-5 text-rose-400" />
        }
        if (t === 'referral_bonus') {
            return <Sparkles className="h-5 w-5 text-amber-400" />
        }

        return <ArrowDownRight className="h-5 w-5 text-emerald-400" />
    }

    return (
        <div className="min-h-full p-4 md:p-6 lg:p-8 relative overflow-hidden">
            {/* Background Ambience */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-20 right-20 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-20 left-20 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px]" />
            </div>

            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="relative z-10 max-w-7xl mx-auto space-y-8"
            >
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                                My Wallet
                            </h1>
                            <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/10">PRO</Badge>
                        </div>
                        <p className="text-muted-foreground">Manage funds, track expenses, and control your financial data.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            className="bg-card/50 backdrop-blur-xl border-white/10 hidden md:flex hover:bg-white/10"
                            onClick={() => {
                                fetchTransactions()
                                fetchBalance()
                            }}
                        >
                            <RefreshCw className={cn("mr-2 h-4 w-4", isLoadingTransactions && "animate-spin")} />
                            Refresh
                        </Button>
                        <Button
                            variant="outline"
                            className="bg-card/50 backdrop-blur-xl border-white/10 hidden md:flex hover:bg-white/10"
                            onClick={downloadReport}
                        >
                            <Download className="mr-2 h-4 w-4" />
                            Download CSV
                        </Button>
                    </div>
                </div>

                <div className="grid lg:grid-cols-12 gap-6 md:gap-8">
                    {/* Left Column: Digital Card & Showcase Quick Actions (5/12) */}
                    <div className="lg:col-span-12 xl:col-span-5 space-y-6">
                        {/* 3D Digital Card */}
                        <motion.div
                            variants={fadeInUp}
                            initial="rest"
                            whileHover="hover"
                            animate="rest"
                            className="perspective-1000"
                        >
                            <motion.div
                                variants={cardTilt}
                                className="relative w-full aspect-[1.586/1] rounded-3xl overflow-hidden shadow-2xl shadow-indigo-500/20 group select-none"
                            >
                                {/* Card Background */}
                                <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81]" />
                                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />

                                {/* Geometric Shapes */}
                                <div className="absolute top-0 right-0 w-[80%] h-[80%] bg-gradient-to-b from-indigo-500/20 to-transparent rounded-bl-full blur-2xl transform translate-x-1/4 -translate-y-1/4" />
                                <div className="absolute bottom-0 left-0 w-[60%] h-[60%] bg-gradient-to-t from-purple-500/20 to-transparent rounded-tr-full blur-3xl transform -translate-x-1/4 translate-y-1/4" />

                                {/* Glass Overlay */}
                                <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px] border border-white/10 rounded-3xl" />

                                {/* Card Content */}
                                <div className="relative h-full p-6 md:p-8 flex flex-col justify-between">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <p className="text-xs font-medium text-indigo-200 tracking-[0.2em] uppercase">Total Balance</p>
                                            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight drop-shadow-lg tabular-nums">
                                                <BalanceDisplay
                                                    multiBalance={userProfile?.multiBalance}
                                                />
                                            </h2>
                                        </div>
                                        <div className="h-10 w-10 md:h-12 md:w-12 rounded-xl bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-md border border-white/20 flex items-center justify-center">
                                            <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-indigo-100" />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {/* Chip */}
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-9 rounded-lg bg-gradient-to-br from-amber-200 to-amber-400 opacity-80 shadow-inner border border-amber-300/30 flex items-center justify-center">
                                                <div className="w-8 h-5 border border-black/10 rounded opacity-50" />
                                            </div>
                                            <div className="flex gap-2">
                                                <div className="w-2 h-2 rounded-full bg-white/30 animate-pulse" />
                                                <div className="w-2 h-2 rounded-full bg-white/30" />
                                                <div className="w-2 h-2 rounded-full bg-white/30" />
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-sm text-indigo-200 font-mono tracking-widest mb-1 shadow-black/50 drop-shadow-md">
                                                    **** **** **** {userCardLast4}
                                                </p>
                                                <p className="text-sm font-medium text-white tracking-wide uppercase opacity-90">
                                                    {user?.name || "NEXNUM MEMBER"}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-indigo-300 font-bold tracking-widest uppercase">Valid Thru</p>
                                                <p className="text-sm font-mono text-white">12/29</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>

                        {/* Quick Actions Grid (Showcase Buttons) */}
                        <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-3">
                            <Button
                                className="h-16 rounded-xl bg-card/40 border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 backdrop-blur-sm group transition-all"
                                variant="outline"
                                onClick={handleDepositClick}
                            >
                                <ArrowDownRight className="mr-2 h-5 w-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                                <div className="text-left">
                                    <div className="font-semibold text-white">Deposit</div>
                                    <div className="text-[10px] text-muted-foreground">Add funds via UPI</div>
                                </div>
                            </Button>
                            
                            <div className="relative group">
                                <Button
                                    className="w-full h-16 rounded-xl bg-card/20 border border-white/5 opacity-80 cursor-pointer hover:bg-rose-500/5 backdrop-blur-sm transition-all"
                                    variant="outline"
                                    onClick={handleWithdrawClick}
                                >
                                    <ArrowUpRight className="mr-2 h-5 w-5 text-rose-400/70" />
                                    <div className="text-left flex-1 min-w-0">
                                        <div className="flex items-center gap-1 justify-between">
                                            <span className="font-semibold text-white/80">Withdraw</span>
                                        </div>
                                        <div className="text-[10px] text-rose-400/90 font-medium">Currently Not Available</div>
                                    </div>
                                </Button>
                            </div>
                        </motion.div>

                        {/* Security Notice */}
                        <motion.div variants={fadeInUp} className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 flex items-start gap-3">
                            <Shield className="h-5 w-5 text-indigo-400 mt-0.5 shrink-0" />
                            <div>
                                <h4 className="text-sm font-semibold text-indigo-200">Bank-Grade Security</h4>
                                <p className="text-xs text-indigo-300/70 mt-1 leading-relaxed">
                                    Your funds are protected by 256-bit encryption and regulated banking partners. All transactions are monitored for fraud.
                                </p>
                            </div>
                        </motion.div>
                    </div>

                    {/* Right Column: Add Funds & History (7/12) */}
                    <div className="lg:col-span-12 xl:col-span-7 space-y-8">
                        {/* Top Up / Add Funds Panel */}
                        <motion.div variants={fadeInUp} ref={addFundsRef}>
                            <Card className="border-white/10 bg-card/30 backdrop-blur-xl overflow-hidden shadow-xl shadow-black/5 relative">
                                <div className="absolute top-0 right-0 p-4 opacity-50">
                                    <Wallet className="w-24 h-24 text-white/5 -rotate-12" />
                                </div>
                                <CardHeader>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
                                            <Plus className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-2xl font-bold">Add Funds</CardTitle>
                                            <CardDescription>Instant top-up via secure gateway</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6 relative z-10">
                                    <div className="space-y-6">
                                        {/* Dynamic Server-Synced Presets */}
                                        <div className="grid grid-cols-4 gap-3">
                                            {dynamicPresets.map((preset) => {
                                                const isActive = amount === preset.value.toString()
                                                return (
                                                    <button
                                                        key={preset.value}
                                                        type="button"
                                                        onClick={() => setAmount(preset.value.toString())}
                                                        className={cn(
                                                            "relative h-14 rounded-xl font-semibold transition-all duration-300 border text-sm md:text-base",
                                                            isActive
                                                                ? "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/25 scale-[1.02]"
                                                                : "bg-card/50 border-white/5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                                                        )}
                                                    >
                                                        {preset.label}
                                                    </button>
                                                )
                                            })}
                                        </div>

                                        {/* Custom Amount with Dynamic Currency Prefix */}
                                        <div className="relative group">
                                            <div className={cn(
                                                "absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-xl blur transition-opacity duration-500",
                                                customFocused ? "opacity-100" : "opacity-0"
                                            )} />
                                            <div className="relative flex items-center bg-card/50 border border-white/10 rounded-xl px-4 h-16 transition-colors group-hover:border-white/20">
                                                <span className="text-2xl font-bold text-muted-foreground mr-2">{currencySym}</span>
                                                <Input
                                                    ref={customInputRef}
                                                    type="number"
                                                    placeholder={`Enter custom amount in ${preferredCurrency}...`}
                                                    value={amount}
                                                    onChange={(e) => setAmount(e.target.value)}
                                                    onFocus={() => setCustomFocused(true)}
                                                    onBlur={() => setCustomFocused(false)}
                                                    className="border-none bg-transparent h-full text-2xl font-bold placeholder:font-normal placeholder:text-muted-foreground/60 focus-visible:ring-0 p-0"
                                                />
                                            </div>
                                        </div>

                                        {/* Deposit Trigger Button */}
                                        <Button
                                            onClick={handleOpenDepositDialog}
                                            disabled={!amount || parseFloat(amount) <= 0}
                                            className={cn(
                                                "w-full h-14 text-lg font-semibold border-none shadow-lg transition-all duration-300 rounded-xl cursor-pointer",
                                                "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                                            )}
                                        >
                                            {amount ? `Deposit ${currencySym}${parseFloat(amount).toLocaleString()}` : "Enter Amount"}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Recent Activity Detailed with Pagination */}
                        <motion.div variants={fadeInUp}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 px-1">
                                <h3 className="font-semibold text-lg flex items-center gap-2">
                                    <History className="h-5 w-5 text-indigo-400" />
                                    Transaction History
                                </h3>

                                {/* Filters */}
                                <div className="flex items-center gap-1 bg-card/40 p-1 rounded-xl border border-white/10 self-start sm:self-auto">
                                    <button
                                        type="button"
                                        onClick={() => setFilterType('all')}
                                        className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer", filterType === 'all' ? "bg-white/10 text-white font-bold" : "text-muted-foreground hover:text-white")}
                                    >All</button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterType('credit')}
                                        className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer", filterType === 'credit' ? "bg-emerald-500/20 text-emerald-400 font-bold" : "text-muted-foreground hover:text-white")}
                                    >Incoming</button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterType('debit')}
                                        className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer", filterType === 'debit' ? "bg-rose-500/20 text-rose-400 font-bold" : "text-muted-foreground hover:text-white")}
                                    >Outgoing</button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterType('other')}
                                        className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer", filterType === 'other' ? "bg-purple-500/20 text-purple-400 font-bold" : "text-muted-foreground hover:text-white")}
                                    >Other</button>
                                </div>
                            </div>

                            <Card className="border-white/10 bg-card/20 backdrop-blur-md overflow-hidden shadow-xl">
                                <div className="divide-y divide-white/5">
                                    {paginatedTransactions.length > 0 ? (
                                        paginatedTransactions.map((tx) => {
                                            const isCredit = ['topup', 'manual_credit', 'referral_bonus', 'refund'].includes((tx.type || '').toLowerCase())
                                            return (
                                                <div
                                                    key={tx.id}
                                                    className="group flex items-center justify-between p-4 hover:bg-white/5 transition-colors cursor-default"
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={cn(
                                                            "w-12 h-12 rounded-2xl flex items-center justify-center border border-white/5 relative overflow-hidden shrink-0",
                                                            isCredit ? "bg-emerald-500/10" : "bg-rose-500/10"
                                                        )}>
                                                            {renderTransactionIcon(tx.type, tx.status)}
                                                        </div>
                                                        <div>
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <p className="font-medium text-sm text-white group-hover:text-indigo-200 transition-colors">
                                                                    {tx.description || (tx.type === 'topup' ? 'Wallet Top-up' : 'Transaction')}
                                                                </p>
                                                                {renderStatusBadge(tx.status, tx.type)}
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <p className="text-xs text-muted-foreground font-mono">{new Date(tx.date).toLocaleDateString()}</p>
                                                                <span className="text-xs text-white/20">•</span>
                                                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{(tx.type || '').replace('_', ' ')}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <span className={cn(
                                                            "block text-lg font-bold font-mono",
                                                            isCredit ? "text-emerald-400" : "text-white"
                                                        )}>
                                                            {isCredit ? "+" : "-"}
                                                            <PriceDisplay currencyPrices={tx.currencyPrices || {}} />
                                                        </span>
                                                        <span className="text-[10px] text-white/30 font-mono">{tx.id.slice(0, 8)}...</span>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    ) : (
                                        <div className="text-center py-12 flex flex-col items-center justify-center">
                                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                                <Search className="h-8 w-8 text-white/20" />
                                            </div>
                                            <h3 className="text-lg font-medium text-white">No transactions found</h3>
                                            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                                                We couldn&apos;t find any transactions matching your current filters.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Catalog Pagination Controls */}
                                {filteredTransactions.length > 0 && (
                                    <div className="p-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4 bg-black/20">
                                        <p className="text-xs text-muted-foreground">
                                            Showing <span className="font-semibold text-white">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to{" "}
                                            <span className="font-semibold text-white">{Math.min(currentPage * ITEMS_PER_PAGE, filteredTransactions.length)}</span> of{" "}
                                            <span className="font-semibold text-white">{filteredTransactions.length}</span> transactions
                                        </p>
                                        
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={currentPage === 1}
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                className="h-8 border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30"
                                            >
                                                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
                                            </Button>
                                            
                                            <div className="flex items-center gap-1 px-2">
                                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                                    <button
                                                        key={page}
                                                        type="button"
                                                        onClick={() => setCurrentPage(page)}
                                                        className={cn(
                                                            "w-7 h-7 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                                                            currentPage === page
                                                                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                                                                : "text-muted-foreground hover:bg-white/5 hover:text-white"
                                                        )}
                                                    >
                                                        {page}
                                                    </button>
                                                ))}
                                            </div>

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={currentPage === totalPages}
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                className="h-8 border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30"
                                            >
                                                Next <ChevronRight className="w-4 h-4 ml-1" />
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </Card>
                        </motion.div>
                    </div>
                </div>
            </motion.div>

            {/* Deposit Dialog */}
            <DepositDialog
                open={depositDialogOpen}
                initialAmount={selectedDepositAmount}
                onClose={() => setDepositDialogOpen(false)}
                onSuccess={() => {
                    fetchTransactions()
                    fetchBalance()
                }}
            />
        </div>
    )
}
