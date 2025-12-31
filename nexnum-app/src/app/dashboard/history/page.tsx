"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import Link from "next/link"
import { motion, AnimatePresence, useScroll, useTransform, useSpring } from "framer-motion"
import {
    Search,
    Filter,
    Download,
    ArrowUpRight,
    ArrowDownRight,
    ArrowLeft,
    ArrowRight,
    Wallet,
    Clock,
    CheckCircle2,
    RefreshCw,
    ChevronUp,
    ChevronDown,
    TrendingUp,
    TrendingDown,
    Calendar,
    Sparkles,
    X,
    History as HistoryIcon,
    Activity
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useGlobalStore } from "@/store"
import { formatPrice, formatDate, cn } from "@/lib/utils"
import { DashboardBackground } from "../components/dashboard-background"

// ============================================
// SKELETON COMPONENTS
// ============================================

const SkeletonPulse = ({ className }: { className?: string }) => (
    <div className={cn(
        "animate-pulse bg-gradient-to-r from-white/[0.03] via-white/[0.08] to-white/[0.03] bg-[length:200%_100%] rounded",
        className
    )} style={{ animation: 'shimmer 1.5s infinite' }} />
)

const TransactionSkeleton = ({ index }: { index: number }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        className="relative rounded-2xl bg-white/[0.02] border border-white/[0.04] overflow-hidden"
    >
        {/* Shimmer overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent animate-shimmer" />

        {/* Desktop skeleton */}
        <div className="hidden md:flex items-center gap-4 p-4">
            <SkeletonPulse className="w-12 h-12 rounded-xl" />
            <div className="flex-1 grid grid-cols-12 gap-4">
                <div className="col-span-4 space-y-2">
                    <SkeletonPulse className="h-4 w-3/4" />
                    <SkeletonPulse className="h-3 w-1/2" />
                </div>
                <div className="col-span-3">
                    <SkeletonPulse className="h-4 w-24" />
                </div>
                <div className="col-span-2">
                    <SkeletonPulse className="h-6 w-16 rounded-full" />
                </div>
                <div className="col-span-3 flex flex-col items-end gap-1">
                    <SkeletonPulse className="h-5 w-20" />
                    <SkeletonPulse className="h-3 w-12" />
                </div>
            </div>
        </div>

        {/* Mobile skeleton */}
        <div className="md:hidden flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
                <SkeletonPulse className="w-10 h-10 rounded-xl" />
                <div className="space-y-2">
                    <SkeletonPulse className="h-4 w-32" />
                    <SkeletonPulse className="h-3 w-20" />
                </div>
            </div>
            <div className="text-right space-y-1">
                <SkeletonPulse className="h-4 w-16 ml-auto" />
                <SkeletonPulse className="h-3 w-12 ml-auto" />
            </div>
        </div>
    </motion.div>
)

const StatCardSkeleton = ({ index }: { index: number }) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: index * 0.1, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        className="relative rounded-2xl bg-white/[0.02] border border-white/[0.04] p-4 md:p-5 overflow-hidden"
    >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent animate-shimmer" />
        <div className="flex items-center justify-between">
            <div className="space-y-2">
                <SkeletonPulse className="h-3 w-20" />
                <SkeletonPulse className="h-8 w-28" />
            </div>
            <SkeletonPulse className="w-10 h-10 rounded-xl" />
        </div>
    </motion.div>
)

// ============================================
// DECORATIVE SVG ACCENTS
// ============================================

const VectorAccents = () => (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Top-right circle accent */}
        <svg className="absolute top-[15%] right-[5%] w-24 h-24 opacity-[0.06]" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-[hsl(var(--neon-lime))]" />
            <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="0.3" strokeDasharray="4 4" className="text-white" />
        </svg>

        {/* Left side dashed lines */}
        <svg className="absolute left-[3%] top-[40%] w-16 h-32 opacity-[0.04]" viewBox="0 0 60 120">
            <line x1="30" y1="0" x2="30" y2="120" stroke="currentColor" strokeWidth="1" strokeDasharray="8 8" className="text-white" />
            <circle cx="30" cy="60" r="4" fill="currentColor" className="text-[hsl(var(--neon-lime))]" />
        </svg>

        {/* Bottom connector */}
        <svg className="absolute bottom-[20%] right-[15%] w-40 h-20 opacity-[0.05]" viewBox="0 0 160 80">
            <path d="M0 40 Q40 10, 80 40 T160 40" fill="none" stroke="currentColor" strokeWidth="1" className="text-white" />
            <circle cx="80" cy="40" r="3" fill="currentColor" className="text-[hsl(var(--neon-lime))]" />
        </svg>

        {/* Floating dots pattern */}
        <div className="absolute top-[60%] left-[8%] grid grid-cols-3 gap-2 opacity-[0.06]">
            {[...Array(9)].map((_, i) => (
                <div key={i} className="w-1 h-1 rounded-full bg-white" />
            ))}
        </div>
    </div>
)

// ============================================
// TRANSACTION CARD COMPONENT
// ============================================

interface TransactionCardProps {
    tx: {
        id: string
        type: 'purchase' | 'topup' | 'refund'
        amount: number
        createdAt: string
        status: string
        description: string
    }
    index: number
}

const TransactionCard = ({ tx, index }: TransactionCardProps) => {
    const isCredit = tx.type === 'topup' || tx.type === 'refund'
    const iconBgColor = isCredit ? 'bg-emerald-500/10' : 'bg-rose-500/10'
    const iconColor = isCredit ? 'text-emerald-400' : 'text-rose-400'
    const amountColor = isCredit ? 'text-emerald-400' : 'text-white'

    const Icon = isCredit ? ArrowDownRight : ArrowUpRight

    return (
        <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
                delay: index * 0.03,
                duration: 0.4,
                ease: [0.23, 1, 0.32, 1]
            }}
            className="group relative"
        >
            <div className="relative overflow-hidden rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04] hover:border-white/[0.08] transition-all duration-300">
                {/* Hover gradient */}
                <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--neon-lime)/0.02)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                {/* Decorative corner accent */}
                <svg className="absolute top-2 right-2 w-4 h-4 opacity-0 group-hover:opacity-20 transition-opacity" viewBox="0 0 16 16">
                    <path d="M0 0 L16 0 L16 16" fill="none" stroke="currentColor" strokeWidth="1" className="text-[hsl(var(--neon-lime))]" />
                </svg>

                {/* Desktop Layout */}
                <div className="hidden md:flex items-center p-4 gap-5">
                    <motion.div
                        className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", iconBgColor)}
                        whileHover={{ scale: 1.05 }}
                        transition={{ type: "spring", stiffness: 400 }}
                    >
                        <Icon className={cn("h-5 w-5", iconColor)} />
                    </motion.div>

                    <div className="flex-1 grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-4">
                            <p className="font-medium text-sm text-white truncate group-hover:text-[hsl(var(--neon-lime))] transition-colors">
                                {tx.description}
                            </p>
                            <p className="text-xs text-white/40 font-mono mt-0.5">{tx.id}</p>
                        </div>
                        <div className="col-span-3 flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-white/30" />
                            <span className="text-sm text-white/50">{formatDate(tx.createdAt)}</span>
                        </div>
                        <div className="col-span-2">
                            <Badge
                                className={cn(
                                    "text-[10px] uppercase tracking-wider px-2.5 py-0.5 rounded-full font-semibold",
                                    tx.type === 'topup'
                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                        : tx.type === 'purchase'
                                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                            : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                )}
                            >
                                {tx.type}
                            </Badge>
                        </div>
                        <div className="col-span-3 text-right">
                            <span className={cn("font-bold font-mono text-lg block", amountColor)}>
                                {isCredit ? "+" : "-"}{formatPrice(Math.abs(tx.amount))}
                            </span>
                            <span className={cn(
                                "text-[10px] uppercase font-bold tracking-wider flex items-center justify-end gap-1 mt-0.5",
                                tx.status === 'success' || tx.status === 'completed' ? "text-emerald-500" : "text-amber-500"
                            )}>
                                {tx.status}
                                {(tx.status === 'success' || tx.status === 'completed') && <CheckCircle2 className="h-3 w-3" />}
                            </span>
                        </div>
                    </div>

                    <ArrowRight className="h-4 w-4 text-white/0 group-hover:text-white/30 transition-colors" />
                </div>

                {/* Mobile Layout */}
                <div className="md:hidden p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", iconBgColor)}>
                            <Icon className={cn("h-4 w-4", iconColor)} />
                        </div>
                        <div>
                            <p className="font-medium text-sm text-white line-clamp-1">{tx.description}</p>
                            <p className="text-xs text-white/40 flex items-center gap-1.5 mt-0.5">
                                <Clock className="h-3 w-3" />
                                {new Date(tx.createdAt).toLocaleDateString()}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className={cn("font-bold font-mono text-sm", amountColor)}>
                            {isCredit ? "+" : "-"}{formatPrice(Math.abs(tx.amount))}
                        </p>
                        <p className={cn(
                            "text-[10px] font-medium uppercase tracking-wide",
                            tx.status === 'success' || tx.status === 'completed' ? "text-emerald-500/80" : "text-amber-500/80"
                        )}>
                            {tx.status}
                        </p>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}

// ============================================
// STAT CARD COMPONENT
// ============================================

interface StatCardProps {
    title: string
    value: string | number
    icon: React.ReactNode
    colorScheme: 'emerald' | 'rose' | 'neutral'
    index: number
    trend?: 'up' | 'down' | null
}

const StatCard = ({ title, value, icon, colorScheme, index, trend }: StatCardProps) => {
    const colors = {
        emerald: {
            border: 'border-emerald-500/20',
            bg: 'bg-emerald-950/20',
            iconBg: 'bg-emerald-500/15',
            iconColor: 'text-emerald-400',
            titleColor: 'text-emerald-400/80',
            gradient: 'from-emerald-500/10'
        },
        rose: {
            border: 'border-rose-500/20',
            bg: 'bg-rose-950/20',
            iconBg: 'bg-rose-500/15',
            iconColor: 'text-rose-400',
            titleColor: 'text-rose-400/80',
            gradient: 'from-rose-500/10'
        },
        neutral: {
            border: 'border-white/[0.06]',
            bg: 'bg-white/[0.02]',
            iconBg: 'bg-white/[0.05]',
            iconColor: 'text-white/60',
            titleColor: 'text-white/50',
            gradient: 'from-white/[0.02]'
        }
    }

    const c = colors[colorScheme]

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: index * 0.1, duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            whileHover={{ scale: 1.02, y: -2 }}
            className="group"
        >
            <Card className={cn("relative overflow-hidden backdrop-blur-xl", c.border, c.bg)}>
                {/* Hover gradient overlay */}
                <div className={cn(
                    "absolute inset-0 bg-gradient-to-br to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                    c.gradient
                )} />

                {/* Corner accent */}
                <svg className="absolute -top-2 -right-2 w-12 h-12 opacity-10 group-hover:opacity-20 transition-opacity" viewBox="0 0 48 48">
                    <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="0.5" className={c.iconColor} />
                </svg>

                <CardContent className="p-4 md:p-5 flex items-center justify-between relative">
                    <div>
                        <p className={cn("text-[10px] md:text-xs font-medium mb-1 uppercase tracking-wider", c.titleColor)}>
                            {title}
                        </p>
                        <div className="flex items-center gap-2">
                            <p className="text-xl md:text-3xl font-bold text-white">{value}</p>
                            {trend && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.5 + index * 0.1 }}
                                >
                                    {trend === 'up' ? (
                                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                                    ) : (
                                        <TrendingDown className="h-4 w-4 text-rose-400" />
                                    )}
                                </motion.div>
                            )}
                        </div>
                    </div>
                    <motion.div
                        className={cn("h-10 w-10 md:h-12 md:w-12 rounded-xl md:rounded-2xl flex items-center justify-center", c.iconBg)}
                        whileHover={{ rotate: 5 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        <div className={c.iconColor}>
                            {icon}
                        </div>
                    </motion.div>
                </CardContent>
            </Card>
        </motion.div>
    )
}

// ============================================
// MAIN PAGE COMPONENT
// ============================================

export default function HistoryPage() {
    const { transactions, isLoadingTransactions, fetchTransactions } = useGlobalStore()
    const [searchTerm, setSearchTerm] = useState("")
    const [filterType, setFilterType] = useState<"all" | "purchase" | "topup" | "refund">("all")
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const [isStatsOpen, setIsStatsOpen] = useState(true)
    const [isMounted, setIsMounted] = useState(false)
    const itemsPerPage = 8

    const containerRef = useRef<HTMLDivElement>(null)
    const { scrollY } = useScroll()
    const headerOpacity = useTransform(scrollY, [0, 100], [1, 0.95])

    useEffect(() => {
        setIsMounted(true)
        fetchTransactions()
    }, [fetchTransactions])

    // Filter Logic
    const filteredTransactions = useMemo(() => {
        return transactions.filter((tx) => {
            const matchesSearch = tx.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                tx.id.toLowerCase().includes(searchTerm.toLowerCase())
            const matchesType = filterType === "all" || tx.type === filterType
            return matchesSearch && matchesType
        })
    }, [transactions, searchTerm, filterType])

    // Pagination
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
        thisMonth: transactions.filter(t => {
            const txDate = new Date(t.createdAt)
            const now = new Date()
            return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()
        }).length
    }), [transactions])

    const handleExport = () => {
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

    const isLoading = isLoadingTransactions || !isMounted

    return (
        <div ref={containerRef} className="relative min-h-screen pb-20 overflow-x-hidden">
            <DashboardBackground />
            <VectorAccents />

            {/* Add shimmer keyframe */}
            <style jsx global>{`
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
                .animate-shimmer {
                    animation: shimmer 2s infinite linear;
                    background-size: 200% 100%;
                }
            `}</style>

            <div className="relative z-10 container mx-auto px-4 md:px-6 max-w-7xl pt-6 md:pt-8">

                {/* Premium Sticky Header */}
                <motion.div
                    style={{ opacity: headerOpacity }}
                    className="sticky top-[4px] md:top-4 z-40 bg-[#0a0a0c]/95 backdrop-blur-xl border-b border-white/[0.04] py-3 -mx-4 px-4 md:mx-0 md:bg-[#0a0a0c]/80 md:border md:rounded-2xl md:px-6 md:py-4 mb-6 shadow-2xl shadow-black/20"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Link href="/dashboard" className="p-2 hover:bg-white/[0.06] rounded-xl transition-colors group">
                                <ArrowLeft className="w-4 h-4 text-white/60 group-hover:text-[hsl(var(--neon-lime))] transition-colors" />
                            </Link>
                            <div className="flex items-center gap-3">
                                <motion.div
                                    className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[hsl(var(--neon-lime))] to-[hsl(var(--neon-lime)/0.7)] text-black shadow-lg shadow-[hsl(var(--neon-lime)/0.3)]"
                                    whileHover={{ scale: 1.05, rotate: -5 }}
                                    transition={{ type: "spring", stiffness: 400 }}
                                >
                                    <HistoryIcon className="w-5 h-5" />
                                </motion.div>
                                <div>
                                    <h1 className="text-lg md:text-xl font-bold text-white">
                                        Transaction <span className="text-[hsl(var(--neon-lime))]">History</span>
                                    </h1>
                                    <p className="text-xs text-white/40 hidden md:block">Track your financial activity</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1] rounded-xl h-9 px-3 gap-2 text-white/70 hover:text-white transition-all"
                                    onClick={handleExport}
                                >
                                    <Download className="h-4 w-4" />
                                    <span className="hidden md:inline text-xs">Export</span>
                                </Button>
                            </motion.div>
                        </div>
                    </div>
                </motion.div>

                {/* Stats Toggle (Mobile) */}
                <div className="flex items-center justify-between md:hidden mb-4">
                    <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-[hsl(var(--neon-lime))]" />
                        <p className="text-sm font-medium text-white/60">Overview</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsStatsOpen(!isStatsOpen)}
                        className="h-8 gap-2 text-white/40 hover:text-white hover:bg-white/[0.05] rounded-lg"
                    >
                        {isStatsOpen ? "Hide" : "Show"}
                        <motion.div animate={{ rotate: isStatsOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                            <ChevronDown className="h-4 w-4" />
                        </motion.div>
                    </Button>
                </div>

                {/* Stats Grid */}
                <AnimatePresence>
                    {(isStatsOpen || typeof window !== 'undefined' && window.innerWidth >= 768) && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className={cn("grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6", !isStatsOpen && "hidden md:grid")}
                        >
                            {isLoading ? (
                                <>
                                    <StatCardSkeleton index={0} />
                                    <StatCardSkeleton index={1} />
                                    <StatCardSkeleton index={2} />
                                    <StatCardSkeleton index={3} />
                                </>
                            ) : (
                                <>
                                    <StatCard
                                        title="Total Deposited"
                                        value={formatPrice(stats.deposited)}
                                        icon={<ArrowDownRight className="h-5 w-5 md:h-6 md:w-6" />}
                                        colorScheme="emerald"
                                        index={0}
                                        trend="up"
                                    />
                                    <StatCard
                                        title="Total Spent"
                                        value={formatPrice(stats.spent)}
                                        icon={<ArrowUpRight className="h-5 w-5 md:h-6 md:w-6" />}
                                        colorScheme="rose"
                                        index={1}
                                    />
                                    <StatCard
                                        title="All Time"
                                        value={stats.count}
                                        icon={<Clock className="h-5 w-5 md:h-6 md:w-6" />}
                                        colorScheme="neutral"
                                        index={2}
                                    />
                                    <StatCard
                                        title="This Month"
                                        value={stats.thisMonth}
                                        icon={<Calendar className="h-5 w-5 md:h-6 md:w-6" />}
                                        colorScheme="neutral"
                                        index={3}
                                    />
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Search & Filter Bar */}
                <Card className="border-white/[0.04] bg-white/[0.02] backdrop-blur-xl sticky top-[80px] md:top-[100px] z-30 shadow-xl shadow-black/10 mb-4">
                    <CardContent className="p-2 md:p-3">
                        <div className="flex flex-row items-center gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                                <Input
                                    placeholder="Search transactions..."
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value)
                                        setCurrentPage(1)
                                    }}
                                    className="pl-10 h-10 md:h-11 bg-transparent border-transparent focus-visible:ring-0 focus-visible:bg-white/[0.03] transition-all rounded-xl placeholder:text-white/30 text-sm"
                                />
                            </div>

                            {/* Desktop Filter Pills */}
                            <div className="hidden md:flex gap-1 px-1">
                                {(["all", "purchase", "topup"] as const).map((type) => (
                                    <motion.button
                                        key={type}
                                        onClick={() => {
                                            setFilterType(type as any)
                                            setCurrentPage(1)
                                        }}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={cn(
                                            "px-4 h-9 text-xs font-medium capitalize rounded-xl transition-all",
                                            filterType === type
                                                ? "bg-[hsl(var(--neon-lime))] text-black"
                                                : "text-white/50 hover:text-white hover:bg-white/[0.05]"
                                        )}
                                    >
                                        {type === "all" ? "All" : type}
                                    </motion.button>
                                ))}
                            </div>

                            {/* Mobile Filter Button */}
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setIsFilterOpen(!isFilterOpen)}
                                className={cn(
                                    "h-10 w-10 rounded-xl transition-all md:hidden",
                                    isFilterOpen ? "bg-[hsl(var(--neon-lime))] text-black" : "text-white/50 hover:bg-white/[0.05]"
                                )}
                            >
                                <Filter className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardContent>

                    {/* Mobile Filters Dropdown */}
                    <AnimatePresence>
                        {isFilterOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden border-t border-white/[0.04] md:hidden"
                            >
                                <div className="p-3 flex flex-wrap gap-2">
                                    {(["all", "purchase", "topup", "refund"] as const).map((type) => (
                                        <Button
                                            key={type}
                                            variant={filterType === type ? "default" : "ghost"}
                                            size="sm"
                                            onClick={() => {
                                                setFilterType(type)
                                                setCurrentPage(1)
                                            }}
                                            className={cn(
                                                "h-8 text-xs rounded-lg capitalize",
                                                filterType === type
                                                    ? "bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(var(--neon-lime))]"
                                                    : "text-white/50 hover:text-white"
                                            )}
                                        >
                                            {type}
                                        </Button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Card>

                {/* Transactions List */}
                <div className="space-y-2 md:space-y-3">
                    <AnimatePresence mode="wait">
                        {isLoading ? (
                            <motion.div
                                key="skeleton"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="space-y-2 md:space-y-3"
                            >
                                {[...Array(5)].map((_, i) => (
                                    <TransactionSkeleton key={i} index={i} />
                                ))}
                            </motion.div>
                        ) : paginatedTransactions.length === 0 ? (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-center py-20"
                            >
                                <motion.div
                                    className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white/[0.03] flex items-center justify-center border border-white/[0.05]"
                                    whileHover={{ rotate: 5, scale: 1.05 }}
                                >
                                    <Search className="h-8 w-8 text-white/20" />
                                </motion.div>
                                <p className="text-lg font-semibold text-white/80 mb-2">No transactions found</p>
                                <p className="text-sm text-white/40">
                                    {searchTerm || filterType !== "all"
                                        ? "Try adjusting your search or filters"
                                        : "Your transaction history will appear here"}
                                </p>
                                {(searchTerm || filterType !== "all") && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setSearchTerm("")
                                            setFilterType("all")
                                        }}
                                        className="mt-4 text-[hsl(var(--neon-lime))] hover:text-[hsl(var(--neon-lime))]"
                                    >
                                        Clear filters
                                    </Button>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="list"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="space-y-2 md:space-y-3"
                            >
                                {paginatedTransactions.map((tx, index) => (
                                    <TransactionCard key={tx.id} tx={tx as any} index={index} />
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Premium Pagination */}
                {!isLoading && totalPages > 1 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex items-center justify-center gap-3 pt-8 pb-4"
                    >
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="h-11 w-11 rounded-xl bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] disabled:opacity-30"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </motion.div>

                        <div className="h-11 px-5 flex items-center justify-center rounded-xl bg-white/[0.02] border border-white/[0.06] backdrop-blur-md">
                            <span className="text-sm font-medium text-white/50">
                                Page <span className="text-white font-bold">{currentPage}</span> of <span className="text-white/70">{totalPages}</span>
                            </span>
                        </div>

                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="h-11 w-11 rounded-xl bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] disabled:opacity-30"
                            >
                                <ArrowRight className="h-4 w-4" />
                            </Button>
                        </motion.div>
                    </motion.div>
                )}
            </div>
        </div>
    )
}
