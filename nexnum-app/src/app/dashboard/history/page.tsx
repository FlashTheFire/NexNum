"use strict";
"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Search,
    Filter,
    Download,
    ArrowUpRight,
    ArrowDownRight,
    ArrowRight,
    Wallet,
    CreditCard,
    DollarSign,
    Calendar,
    CheckCircle2,
    XCircle,
    Clock,
    RefreshCw,
    MoreHorizontal,
    ChevronUp,
    ChevronDown
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useGlobalStore } from "@/store"
import { formatPrice, formatDate, cn } from "@/lib/utils"

// Animation Variants
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.05 }
    }
}

const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
}

export default function HistoryPage() {
    const { transactions } = useGlobalStore()
    const [searchTerm, setSearchTerm] = useState("")
    const [filterType, setFilterType] = useState<"all" | "purchase" | "topup" | "refund">("all")
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [dateRange, setDateRange] = useState<"all" | "this_month" | "last_month">("all")
    const [currentPage, setCurrentPage] = useState(1)
    const [isStatsOpen, setIsStatsOpen] = useState(false)
    const itemsPerPage = 8

    // Filter Logic
    const filteredTransactions = useMemo(() => {
        return transactions.filter((tx) => {
            const matchesSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase()) || tx.id.toLowerCase().includes(searchTerm.toLowerCase())
            const matchesType = filterType === "all" || tx.type === filterType

            // Date Logic (Mock implementation for demo)
            let matchesDate = true
            const txDate = new Date(tx.createdAt)
            const now = new Date()
            if (dateRange === "this_month") {
                matchesDate = txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()
            } else if (dateRange === "last_month") {
                const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
                matchesDate = txDate.getMonth() === lastMonth.getMonth() && txDate.getFullYear() === lastMonth.getFullYear()
            }

            return matchesSearch && matchesType && matchesDate
        })
    }, [transactions, searchTerm, filterType, dateRange])

    // Pagination Logic
    const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage)
    const paginatedTransactions = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage
        return filteredTransactions.slice(startIndex, startIndex + itemsPerPage)
    }, [filteredTransactions, currentPage])

    // Stats Calculation
    const stats = useMemo(() => ({
        spent: transactions.filter(t => t.type === "purchase").reduce((acc, curr) => acc + Math.abs(curr.amount), 0),
        deposited: transactions.filter(t => t.type === "topup").reduce((acc, curr) => acc + curr.amount, 0),
        count: transactions.length,
    }), [transactions])

    const handleExport = () => {
        // ... (Export logic same as before)
        const csv = [
            ["Date", "Type", "Description", "Amount", "Status"],
            ...filteredTransactions.map(tx => [
                formatDate(tx.createdAt),
                tx.type,
                tx.description,
                formatPrice(tx.amount),
                tx.status,
            ])
        ].map(row => row.join(",")).join("\n")

        const blob = new Blob([csv], { type: "text/csv" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "nexnum_transactions.csv"
        a.click()
    }

    return (
        <div className="min-h-full relative overflow-hidden bg-background">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-transparent rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-emerald-500/5 via-cyan-500/5 to-transparent rounded-full blur-3xl" />
            </div>

            <div className="p-4 md:p-6 lg:p-8 relative z-10 space-y-6 md:space-y-8 max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-row items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-1">
                            <span className="gradient-text">History</span> Log
                        </h1>
                        <p className="text-muted-foreground text-sm">Track your financial footprint</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            className="bg-card/50 backdrop-blur-md border-white/10 hover:bg-white/10 rounded-xl h-10 px-4"
                            onClick={handleExport}
                        >
                            <Download className="h-4 w-4 md:mr-2" />
                            <span className="hidden md:inline">Export</span>
                        </Button>
                    </div>
                </div>

                {/* Stats Toggle (Mobile Only) */}
                <div className="flex items-center justify-between md:hidden">
                    <p className="text-sm font-medium text-muted-foreground">Overview</p>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsStatsOpen(!isStatsOpen)}
                        className="h-8 gap-2 text-muted-foreground hover:text-white"
                    >
                        {isStatsOpen ? "Hide" : "Show"} Stats
                        {isStatsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                </div>

                {/* Stats Overview */}
                <div className={cn("grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6", !isStatsOpen && "hidden md:grid")}>
                    <Card className="border-emerald-500/20 bg-emerald-950/10 backdrop-blur-xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <CardContent className="p-3 md:p-5 flex items-center justify-between relative">
                            <div>
                                <p className="text-[10px] md:text-xs font-medium text-emerald-400 mb-0 md:mb-1 uppercase tracking-wider">Total Deposited</p>
                                <p className="text-lg md:text-3xl font-bold text-white">{formatPrice(stats.deposited)}</p>
                            </div>
                            <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                                <ArrowDownRight className="h-4 w-4 md:h-6 md:w-6" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-rose-500/20 bg-rose-950/10 backdrop-blur-xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <CardContent className="p-3 md:p-5 flex items-center justify-between relative">
                            <div>
                                <p className="text-[10px] md:text-xs font-medium text-rose-400 mb-0 md:mb-1 uppercase tracking-wider">Total Spent</p>
                                <p className="text-lg md:text-3xl font-bold text-white">{formatPrice(stats.spent)}</p>
                            </div>
                            <div className="h-8 w-8 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-400">
                                <ArrowUpRight className="h-4 w-4 md:h-6 md:w-6" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="col-span-2 lg:col-span-1 border-white/10 bg-card/30 backdrop-blur-xl relative overflow-hidden group">
                        <CardContent className="p-5 flex items-center justify-between relative">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wider">Transactions</p>
                                <p className="text-2xl md:text-3xl font-bold text-white">{stats.count}</p>
                            </div>
                            <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center text-muted-foreground">
                                <Clock className="h-6 w-6" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content Area */}
                <div className="space-y-4">
                    {/* Search & Filter Bar */}
                    <Card className="border-white/10 bg-card/30 backdrop-blur-xl sticky top-4 z-20 shadow-xl shadow-black/5">
                        <CardContent className="p-2">
                            <div className="flex flex-row items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by ID or description..."
                                        value={searchTerm}
                                        onChange={(e) => {
                                            setSearchTerm(e.target.value)
                                            setCurrentPage(1)
                                        }}
                                        className="pl-10 h-10 bg-transparent border-transparent focus-visible:ring-0 focus-visible:bg-white/5 transition-all rounded-lg placeholder:text-muted-foreground/50"
                                    />
                                </div>
                                <div className="hidden md:flex gap-1">
                                    {(["all", "purchase", "topup"] as const).map((type) => (
                                        <Button
                                            key={type}
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setFilterType(type as any)
                                                setCurrentPage(1)
                                            }}
                                            className={cn(
                                                "rounded-lg px-3 h-9 text-xs font-medium capitalize transition-all",
                                                filterType === type
                                                    ? "bg-white/10 text-white"
                                                    : "text-muted-foreground hover:text-white hover:bg-white/5"
                                            )}
                                        >
                                            {type === "all" ? "All Activity" : type}
                                        </Button>
                                    ))}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                                    className={cn(
                                        "h-10 w-10 rounded-lg transition-all md:hidden",
                                        isFilterOpen ? "bg-white/10 text-white" : "text-muted-foreground"
                                    )}
                                >
                                    <Filter className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>

                        {/* Mobile Collapsible Filters */}
                        <AnimatePresence>
                            {isFilterOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden border-t border-white/5 md:hidden"
                                >
                                    <div className="p-3 space-y-3">
                                        <div className="space-y-2">
                                            <label className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Type</label>
                                            <div className="flex flex-wrap gap-2">
                                                {(["all", "purchase", "topup", "refund"] as const).map((type) => (
                                                    <Button
                                                        key={type}
                                                        variant={filterType === type ? "secondary" : "ghost"}
                                                        size="sm"
                                                        onClick={() => {
                                                            setFilterType(type)
                                                            setCurrentPage(1)
                                                        }}
                                                        className="h-8 text-xs rounded-lg capitalize"
                                                    >
                                                        {type}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Card>

                    {/* Transactions List */}
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        className="space-y-2"
                    >
                        {paginatedTransactions.length === 0 ? (
                            <div className="text-center py-20">
                                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                                    <Search className="h-8 w-8 text-muted-foreground" />
                                </div>
                                <p className="text-lg font-medium">No transactions found</p>
                                <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
                            </div>
                        ) : (
                            paginatedTransactions.map((tx) => (
                                <motion.div key={tx.id} variants={itemVariants}>
                                    {/* Link Container */}
                                    <div className="group relative overflow-hidden rounded-xl bg-card/40 hover:bg-card/60 border border-white/5 hover:border-white/10 transition-all duration-300">
                                        {/* Desktop Layout (md+) */}
                                        <div className="hidden md:flex items-center p-4 gap-6">
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                                tx.type === 'topup' ? "bg-emerald-500/10 text-emerald-500" :
                                                    tx.type === 'purchase' ? "bg-rose-500/10 text-rose-500" :
                                                        "bg-blue-500/10 text-blue-500"
                                            )}>
                                                {tx.type === 'topup' ? <ArrowDownRight className="h-5 w-5" /> :
                                                    tx.type === 'purchase' ? <ArrowUpRight className="h-5 w-5" /> :
                                                        <RefreshCw className="h-5 w-5" />}
                                            </div>

                                            <div className="flex-1 grid grid-cols-12 gap-4 items-center">
                                                <div className="col-span-4">
                                                    <p className="font-medium text-sm text-white truncate">{tx.description}</p>
                                                    <p className="text-xs text-muted-foreground font-mono">{tx.id}</p>
                                                </div>
                                                <div className="col-span-3 text-sm text-muted-foreground">
                                                    {formatDate(tx.createdAt)}
                                                </div>
                                                <div className="col-span-2">
                                                    <Badge variant={tx.type === 'topup' ? "outline" : "secondary"} className="text-xs uppercase tracking-wider bg-white/5 border-white/10 text-muted-foreground">
                                                        {tx.type}
                                                    </Badge>
                                                </div>
                                                <div className="col-span-3 text-right">
                                                    <span className={cn(
                                                        "font-bold font-mono text-base block",
                                                        tx.amount > 0 ? "text-emerald-400" : "text-white"
                                                    )}>
                                                        {tx.amount > 0 ? "+" : ""}{formatPrice(tx.amount)}
                                                    </span>
                                                    <span className={cn(
                                                        "text-[10px] uppercase font-bold tracking-wider flex items-center justify-end gap-1 mt-0.5",
                                                        tx.status === 'success' ? "text-emerald-500" : "text-amber-500"
                                                    )}>
                                                        {tx.status}
                                                        {tx.status === 'success' && <CheckCircle2 className="h-3 w-3" />}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors">
                                                <ArrowRight className="h-5 w-5" />
                                            </div>
                                        </div>

                                        {/* Mobile Layout (< md) */}
                                        <div className="md:hidden p-4 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                                                    tx.type === 'topup' ? "bg-emerald-500/10 text-emerald-500" :
                                                        tx.type === 'purchase' ? "bg-rose-500/10 text-rose-500" :
                                                            "bg-blue-500/10 text-blue-500"
                                                )}>
                                                    {tx.type === 'topup' ? <ArrowDownRight className="h-5 w-5" /> :
                                                        tx.type === 'purchase' ? <ArrowUpRight className="h-5 w-5" /> :
                                                            <RefreshCw className="h-5 w-5" />}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm text-white line-clamp-1">{tx.description}</p>
                                                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                                        <Clock className="h-3 w-3" />
                                                        {new Date(tx.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={cn(
                                                    "font-bold font-mono text-sm",
                                                    tx.amount > 0 ? "text-emerald-400" : "text-white"
                                                )}>
                                                    {tx.amount > 0 ? "+" : ""}{formatPrice(tx.amount)}
                                                </p>
                                                <p className={cn(
                                                    "text-[10px] font-medium uppercase tracking-wide",
                                                    tx.status === 'success' ? "text-emerald-500/80" : "text-amber-500/80"
                                                )}>
                                                    {tx.status}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </motion.div>

                    {/* Premium Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-4">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="h-10 w-10 rounded-xl bg-card/40 border-white/10 hover:bg-white/10 disabled:opacity-50"
                            >
                                <ArrowRight className="h-4 w-4 rotate-180" />
                            </Button>

                            <div className="h-10 px-4 flex items-center justify-center rounded-xl bg-card/40 border border-white/10 backdrop-blur-md">
                                <span className="text-sm font-medium text-muted-foreground">
                                    Page <span className="text-white">{currentPage}</span> of {totalPages}
                                </span>
                            </div>

                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="h-10 w-10 rounded-xl bg-card/40 border-white/10 hover:bg-white/10 disabled:opacity-50"
                            >
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

