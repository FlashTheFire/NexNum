"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Wallet,
    CreditCard as CreditCardIcon,
    Plus,
    Loader2,
    Shield,
    ArrowUpRight,
    ArrowDownRight,
    History,
    CheckCircle2,
    Sparkles,
    ChevronRight,
    Lock,
    Smartphone,
    Copy,
    Filter,
    Download,
    Search,
    RefreshCw
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useGlobalStore, Transaction } from "@/store"
import { useAuthStore } from "@/stores/authStore"
import { formatPrice, formatRelativeTime, cn } from "@/lib/utils/utils"

// Animation Variants
const fadeInUp: any = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
}

const containerVariants: any = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
}

const cardTilt: any = {
    rest: { rotateX: 0, rotateY: 0, scale: 1 },
    hover: {
        rotateX: 2,
        rotateY: 2,
        scale: 1.02,
        transition: { duration: 0.4, type: "spring" }
    }
}

const presets = [10, 25, 50, 100]

export default function WalletPage() {
    const { user } = useAuthStore()
    const { userProfile, transactions, topUp, fetchTransactions, isLoadingTransactions } = useGlobalStore()
    const [amount, setAmount] = useState<string>("")
    const [isLoading, setIsLoading] = useState(false)
    const [selectedMethod, setSelectedMethod] = useState("upi")
    const [customFocused, setCustomFocused] = useState(false)

    // Filters
    const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit'>('all')
    const [searchQuery, setSearchQuery] = useState("")

    useEffect(() => {
        fetchTransactions()
    }, [fetchTransactions])

    // Auto-complete payment simulation
    useEffect(() => {
        let timeout: NodeJS.Timeout
        if (isLoading && amount) {
            timeout = setTimeout(() => {
                const value = parseFloat(amount)
                if (!isNaN(value)) {
                    topUp(value)
                    toast.success(`Successfully added ${formatPrice(value)} to wallet`)
                    setIsLoading(false)
                    setAmount("")
                }
            }, 5000)
        }
        return () => clearTimeout(timeout)
    }, [isLoading, amount, topUp])

    // Calculate simulated "Card Number" based on User ID for consistent personalization
    const userCardLast4 = user?.id ? user.id.slice(-4).toUpperCase() : "8888"

    // Filter Logic
    const filteredTransactions = transactions.filter(t => {
        const matchesSearch = t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.id.toLowerCase().includes(searchQuery.toLowerCase())

        if (!matchesSearch) return false

        if (filterType === 'all') return true
        if (filterType === 'credit') return ['topup', 'manual_credit', 'referral_bonus'].includes(t.type)
        if (filterType === 'debit') return ['purchase', 'manual_debit'].includes(t.type)
        return true
    })

    const handleTopUp = () => {
        const value = parseFloat(amount)
        if (isNaN(value) || value < 5) {
            toast.error("Minimum top-up is $5.00")
            return
        }
        setIsLoading(true)
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
                            onClick={() => fetchTransactions()}
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
                    {/* Left Column: Digital Card & Actions (5/12) */}
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
                                                {formatPrice(userProfile?.balance || 0)}
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
                                            <div className="flex-1 h-9 flex items-center">
                                                <div className="flex gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-white/30 animate-pulse" />
                                                    <div className="w-2 h-2 rounded-full bg-white/30" />
                                                    <div className="w-2 h-2 rounded-full bg-white/30" />
                                                </div>
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

                        {/* Quick Actions Grid */}
                        <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-3">
                            <Button className="h-14 rounded-xl bg-card/40 border border-white/5 hover:bg-white/5 backdrop-blur-sm group" variant="outline">
                                <ArrowDownRight className="mr-2 h-5 w-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                                <div className="text-left">
                                    <div className="font-semibold text-white">Deposit</div>
                                    <div className="text-[10px] text-muted-foreground">Add funds instantly</div>
                                </div>
                            </Button>
                            <Button className="h-14 rounded-xl bg-card/40 border border-white/5 hover:bg-white/5 backdrop-blur-sm group" variant="outline">
                                <ArrowUpRight className="mr-2 h-5 w-5 text-rose-400 group-hover:scale-110 transition-transform" />
                                <div className="text-left">
                                    <div className="font-semibold text-white">Withdraw</div>
                                    <div className="text-[10px] text-muted-foreground">Transfer to bank</div>
                                </div>
                            </Button>
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

                    {/* Right Column: Top-Up & History (7/12) */}
                    <div className="lg:col-span-12 xl:col-span-7 space-y-8">
                        {/* Top Up Panel */}
                        <motion.div variants={fadeInUp}>
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
                                            <CardTitle>Add Funds</CardTitle>
                                            <CardDescription>Instant top-up via secure gateway</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6 relative z-10">
                                    <AnimatePresence mode="wait">
                                        {!isLoading ? (
                                            <motion.div
                                                key="selection"
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 20 }}
                                                className="space-y-6"
                                            >
                                                {/* Presets */}
                                                <div className="grid grid-cols-4 gap-3">
                                                    {presets.map((preset) => {
                                                        const isActive = amount === preset.toString()
                                                        return (
                                                            <button
                                                                key={preset}
                                                                onClick={() => setAmount(preset.toString())}
                                                                className={cn(
                                                                    "relative h-14 rounded-xl font-semibold transition-all duration-300 border",
                                                                    isActive
                                                                        ? "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/25 scale-[1.02]"
                                                                        : "bg-card/50 border-white/5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                                                                )}
                                                            >
                                                                ${preset}
                                                            </button>
                                                        )
                                                    })}
                                                </div>

                                                {/* Custom Amount */}
                                                <div className="relative group">
                                                    <div className={cn(
                                                        "absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-xl blur transition-opacity duration-500",
                                                        customFocused ? "opacity-100" : "opacity-0"
                                                    )} />
                                                    <div className="relative flex items-center bg-card/50 border border-white/10 rounded-xl px-4 h-16 transition-colors group-hover:border-white/20">
                                                        <span className="text-xl font-medium text-muted-foreground mr-2">$</span>
                                                        <Input
                                                            type="number"
                                                            placeholder="Enter custom amount..."
                                                            value={amount}
                                                            onChange={(e) => setAmount(e.target.value)}
                                                            onFocus={() => setCustomFocused(true)}
                                                            onBlur={() => setCustomFocused(false)}
                                                            className="border-none bg-transparent h-full text-2xl font-bold placeholder:font-normal focus-visible:ring-0 p-0"
                                                        />
                                                    </div>
                                                </div>

                                                <Button
                                                    onClick={handleTopUp}
                                                    disabled={!amount || parseFloat(amount) < 5}
                                                    className={cn(
                                                        "w-full h-14 text-lg font-semibold border-none shadow-lg transition-all duration-300 rounded-xl",
                                                        "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-500/25"
                                                    )}
                                                >
                                                    {amount ? `Pay ${formatPrice(parseFloat(amount))}` : "Enter Amount"}
                                                </Button>
                                            </motion.div>
                                        ) : (
                                            <motion.div
                                                key="payment"
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                className="space-y-6 py-4"
                                            >
                                                <div className="flex flex-col items-center justify-center space-y-4">
                                                    <div className="relative w-20 h-20">
                                                        <div className="absolute inset-0 rounded-full border-4 border-white/10" />
                                                        <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
                                                        <div className="absolute inset-0 flex items-center justify-center">
                                                            <Lock className="w-8 h-8 text-indigo-400" />
                                                        </div>
                                                    </div>
                                                    <div className="text-center">
                                                        <h3 className="text-lg font-semibold text-white">Processing Secure Payment</h3>
                                                        <p className="text-muted-foreground text-sm">Please approve the request on your device...</p>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    onClick={() => setIsLoading(false)}
                                                    className="w-full hover:bg-white/5 text-muted-foreground"
                                                >
                                                    Cancel Transaction
                                                </Button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Recent Activity Detailed */}
                        <motion.div variants={fadeInUp}>
                            <div className="flex items-center justify-between mb-6 px-1">
                                <h3 className="font-semibold text-lg flex items-center gap-2">
                                    <History className="h-5 w-5 text-indigo-400" />
                                    Transaction History
                                </h3>

                                {/* Filters */}
                                <div className="flex items-center gap-2 bg-card/30 p-1 rounded-lg border border-white/5">
                                    <button
                                        onClick={() => setFilterType('all')}
                                        className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors", filterType === 'all' ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white")}
                                    >All</button>
                                    <button
                                        onClick={() => setFilterType('credit')}
                                        className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors", filterType === 'credit' ? "bg-emerald-500/10 text-emerald-400" : "text-muted-foreground hover:text-white")}
                                    >Incoming</button>
                                    <button
                                        onClick={() => setFilterType('debit')}
                                        className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors", filterType === 'debit' ? "bg-rose-500/10 text-rose-400" : "text-muted-foreground hover:text-white")}
                                    >Outgoing</button>
                                </div>
                            </div>

                            <Card className="border-white/5 bg-card/20 backdrop-blur-md overflow-hidden">
                                <div className="divide-y divide-white/5">
                                    {filteredTransactions.length > 0 ? (
                                        filteredTransactions.map((tx) => (
                                            <div
                                                key={tx.id}
                                                className="group flex items-center justify-between p-4 hover:bg-white/5 transition-colors cursor-default"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={cn(
                                                        "w-12 h-12 rounded-2xl flex items-center justify-center border border-white/5 relative overflow-hidden",
                                                        ['topup', 'manual_credit', 'referral_bonus'].includes(tx.type) ? "bg-emerald-500/5" : "bg-rose-500/5"
                                                    )}>
                                                        {['topup', 'manual_credit'].includes(tx.type) && <ArrowDownRight className="h-5 w-5 text-emerald-500" />}
                                                        {['purchase', 'manual_debit'].includes(tx.type) && <ArrowUpRight className="h-5 w-5 text-rose-500" />}
                                                        {tx.type === 'referral_bonus' && <Sparkles className="h-5 w-5 text-amber-500" />}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-medium text-sm text-white group-hover:text-indigo-200 transition-colors">
                                                                {tx.description || (tx.type === 'topup' ? 'Wallet Top-up' : 'Number Purchase')}
                                                            </p>
                                                            {tx.status === 'pending' && <Badge variant="outline" className="text-[10px] h-5 border-amber-500/50 text-amber-500">Pending</Badge>}
                                                            {tx.type.includes('manual') && <Badge variant="outline" className="text-[10px] h-5 border-indigo-500/50 text-indigo-400">Admin</Badge>}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <p className="text-xs text-muted-foreground font-mono">{new Date(tx.date).toLocaleDateString()}</p>
                                                            <span className="text-xs text-white/20">•</span>
                                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{tx.type.replace('_', ' ')}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className={cn(
                                                        "block text-lg font-bold font-mono",
                                                        ['topup', 'manual_credit', 'referral_bonus'].includes(tx.type) ? "text-emerald-400" : "text-white"
                                                    )}>
                                                        {['topup', 'manual_credit', 'referral_bonus'].includes(tx.type) ? "+" : "-"}{formatPrice(tx.amount)}
                                                    </span>
                                                    <span className="text-[10px] text-white/30 font-mono">{tx.id.slice(0, 8)}...</span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-12 flex flex-col items-center justify-center">
                                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                                                <Search className="h-8 w-8 text-white/20" />
                                            </div>
                                            <h3 className="text-lg font-medium text-white">No transactions found</h3>
                                            <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                                                We couldn't find any transactions matching your current filters.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        </motion.div>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
