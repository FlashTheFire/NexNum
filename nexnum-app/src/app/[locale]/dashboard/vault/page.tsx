"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import Link from "next/link"
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion"
import {
    Search,
    Filter,
    Download,
    ArrowLeft,
    ArrowRight,
    Clock,
    CheckCircle2,
    ChevronDown,
    Phone,
    Activity,
    Archive,
    LayoutGrid
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useGlobalStore } from "@/stores/appStore"
import { cn } from "@/lib/utils/utils"
import { DashboardBackground } from "../components/dashboard-background"
import { ModernNumberCard } from "../components/ModernNumberCard"
import { toast } from "sonner"

// ============================================
// SKELETON COMPONENTS (EXACT MATCH TO HISTORY)
// ============================================

const SkeletonPulse = ({ className }: { className?: string }) => (
    <div className={cn(
        "animate-pulse bg-gradient-to-r from-white/[0.03] via-white/[0.08] to-white/[0.03] bg-[length:200%_100%] rounded",
        className
    )} style={{ animation: 'shimmer 1.5s infinite' }} />
)

const NumberCardSkeleton = ({ index }: { index: number }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        className="relative h-[148px] rounded-2xl bg-white/[0.02] border border-white/[0.04] overflow-hidden p-4"
        style={{
            clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%)'
        }}
    >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.02] to-transparent animate-shimmer" />
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
                <SkeletonPulse className="w-7 h-7 rounded-md" />
                <div className="space-y-1.5">
                    <SkeletonPulse className="h-4 w-24" />
                    <SkeletonPulse className="h-3 w-16" />
                </div>
            </div>
            <SkeletonPulse className="h-4 w-14 rounded-full" />
        </div>
        <div className="space-y-2 mt-4">
            <SkeletonPulse className="h-6 w-36" />
            <SkeletonPulse className="h-3 w-20" />
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
// DECORATIVE SVG ACCENTS (EXACT MATCH TO HISTORY)
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
// STAT CARD COMPONENT (EXACT MATCH TO HISTORY)
// ============================================

interface StatCardProps {
    title: string
    value: React.ReactNode
    icon: React.ReactNode
    colorScheme: 'emerald' | 'rose' | 'neutral' | 'lime'
    index: number
}

const StatCard = ({ title, value, icon, colorScheme, index }: StatCardProps) => {
    const colors = {
        lime: {
            border: 'border-[hsl(var(--neon-lime)/0.25)]',
            bg: 'bg-[hsl(var(--neon-lime)/0.04)]',
            iconBg: 'bg-[hsl(var(--neon-lime)/0.15)]',
            iconColor: 'text-[hsl(var(--neon-lime))]',
            titleColor: 'text-[hsl(var(--neon-lime))/0.9]',
            gradient: 'from-[hsl(var(--neon-lime)/0.1)]'
        },
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
            <Card className={cn("relative overflow-hidden backdrop-blur-xl transition-all duration-300", c.border, c.bg)}>
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
                        <p className="text-xl md:text-3xl font-bold text-white font-mono">{value}</p>
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
// MAIN VAULT PAGE COMPONENT
// ============================================

export default function VaultPage() {
    const { activeNumbers, isLoadingNumbers, fetchNumbers } = useGlobalStore()
    const [searchTerm, setSearchTerm] = useState("")
    const [filterType, setFilterType] = useState<"all" | "active" | "completed" | "expired">("all")
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const [isStatsOpen, setIsStatsOpen] = useState(true)
    const [isMounted, setIsMounted] = useState(false)
    const itemsPerPage = 12

    const containerRef = useRef<HTMLDivElement>(null)
    const { scrollY } = useScroll()
    const headerOpacity = useTransform(scrollY, [0, 100], [1, 0.95])

    useEffect(() => {
        setIsMounted(true)
        if (fetchNumbers) {
            fetchNumbers()
        }
    }, [fetchNumbers])

    const isLoading = isLoadingNumbers || !isMounted

    // Process all numbers & derive current status
    const allNumbers = useMemo(() => {
        if (!isMounted) return []
        const now = Date.now()

        return (activeNumbers || [])
            .filter(num => num && num.id && num.number)
            .map(num => {
                const expiresAt = num.expiresAt ? new Date(num.expiresAt).getTime() : 0
                const rawStatus = String(num.status || 'active').toLowerCase()
                let calculatedStatus: 'active' | 'completed' | 'expired' | 'cancelled' = 'active'

                if (rawStatus === 'cancelled' || rawStatus === 'refunded') {
                    calculatedStatus = 'cancelled'
                } else if (rawStatus === 'received' || rawStatus === 'completed' || (num.smsCount || 0) > 0 || num.latestSms) {
                    calculatedStatus = 'completed'
                } else if (rawStatus === 'expired' || rawStatus === 'timeout' || (expiresAt > 0 && expiresAt <= now)) {
                    calculatedStatus = 'expired'
                } else {
                    calculatedStatus = 'active'
                }

                return { ...num, currentStatus: calculatedStatus }
            })
            .sort((a, b) => {
                const dateA = a.purchasedAt ? new Date(a.purchasedAt).getTime() : 0
                const dateB = b.purchasedAt ? new Date(b.purchasedAt).getTime() : 0
                return dateB - dateA
            })
    }, [activeNumbers, isMounted])

    // Filter Logic
    const filteredNumbers = useMemo(() => {
        return allNumbers.filter((num) => {
            const matchesSearch =
                num.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (num.serviceName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (num.countryName || '').toLowerCase().includes(searchTerm.toLowerCase())

            if (filterType === "all") return matchesSearch
            if (filterType === "active") return matchesSearch && num.currentStatus === 'active'
            if (filterType === "completed") return matchesSearch && num.currentStatus === 'completed'
            if (filterType === "expired") return matchesSearch && (num.currentStatus === 'expired' || num.currentStatus === 'cancelled')

            return matchesSearch
        })
    }, [allNumbers, searchTerm, filterType])

    // Stats Calculation
    const stats = useMemo(() => {
        return {
            total: allNumbers.length,
            active: allNumbers.filter(n => n.currentStatus === 'active').length,
            completed: allNumbers.filter(n => n.currentStatus === 'completed').length,
            expired: allNumbers.filter(n => n.currentStatus === 'expired' || n.currentStatus === 'cancelled').length
        }
    }, [allNumbers])

    // Pagination
    const totalPages = Math.ceil(filteredNumbers.length / itemsPerPage) || 1
    const paginatedNumbers = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage
        return filteredNumbers.slice(startIndex, startIndex + itemsPerPage)
    }, [filteredNumbers, currentPage])

    // Export CSV Handler (Matches History page export pattern)
    const handleExportCSV = () => {
        if (filteredNumbers.length === 0) {
            toast.error("No numbers to export")
            return
        }

        const headers = ["Phone Number", "Service", "Country", "Status", "SMS Count", "Expires At"]
        const csvRows = [
            headers.join(","),
            ...filteredNumbers.map(n => [
                `"${n.number}"`,
                `"${n.serviceName || ''}"`,
                `"${n.countryName || ''}"`,
                `"${n.currentStatus}"`,
                n.smsCount || 0,
                `"${n.expiresAt || ''}"`
            ].join(","))
        ]

        const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `nexnum_vault_export_${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        toast.success("Exported to CSV!")
    }

    return (
        <div ref={containerRef} className="relative min-h-screen pb-20 overflow-x-hidden">
            <DashboardBackground />
            <VectorAccents />

            {/* Shimmer keyframe */}
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

                {/* Premium Sticky Header (Exact match to History) */}
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
                                    <Phone className="w-5 h-5" />
                                </motion.div>
                                <div>
                                    <h1 className="text-lg md:text-xl font-bold text-white">
                                        Number <span className="text-[hsl(var(--neon-lime))]">Vault</span>
                                    </h1>
                                    <p className="text-xs text-white/40 hidden md:block">Secure activation history & live SMS verifications</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleExportCSV}
                                    className="bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1] rounded-xl h-9 px-3 gap-2 text-white/70 hover:text-white transition-all text-xs"
                                >
                                    <Download className="h-4 w-4" />
                                    <span className="hidden md:inline">Export CSV</span>
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
                                        title="SMS Delivered"
                                        value={stats.completed}
                                        icon={<CheckCircle2 className="h-5 w-5 md:h-6 md:w-6" />}
                                        colorScheme="emerald"
                                        index={0}
                                    />
                                    <StatCard
                                        title="Expired / Cancelled"
                                        value={stats.expired}
                                        icon={<Archive className="h-5 w-5 md:h-6 md:w-6" />}
                                        colorScheme="rose"
                                        index={1}
                                    />
                                    <StatCard
                                        title="Total Registrations"
                                        value={stats.total}
                                        icon={<LayoutGrid className="h-5 w-5 md:h-6 md:w-6" />}
                                        colorScheme="neutral"
                                        index={2}
                                    />
                                    <StatCard
                                        title="Active Verifications"
                                        value={stats.active}
                                        icon={<Clock className="h-5 w-5 md:h-6 md:w-6" />}
                                        colorScheme="neutral"
                                        index={3}
                                    />
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Search & Filter Bar */}
                <Card className="border-white/[0.04] bg-white/[0.02] backdrop-blur-xl sticky top-[80px] md:top-[100px] z-30 shadow-xl shadow-black/10 mb-6">
                    <CardContent className="p-2 md:p-3">
                        <div className="flex flex-row items-center gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                                <Input
                                    placeholder="Search number, service, country..."
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value)
                                        setCurrentPage(1)
                                    }}
                                    className="pl-10 h-10 md:h-11 bg-transparent border-transparent focus-visible:ring-0 focus-visible:bg-white/[0.03] transition-all rounded-xl placeholder:text-white/30 text-sm text-white"
                                />
                            </div>

                            {/* Desktop Filter Pills */}
                            <div className="hidden md:flex gap-1 px-1">
                                {(["all", "active", "completed", "expired"] as const).map((type) => (
                                    <motion.button
                                        key={type}
                                        onClick={() => {
                                            setFilterType(type)
                                            setCurrentPage(1)
                                        }}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        className={cn(
                                            "px-4 h-9 text-xs font-medium capitalize rounded-xl transition-all flex items-center gap-1.5",
                                            filterType === type
                                                ? "bg-[hsl(var(--neon-lime))] text-black font-bold"
                                                : "text-white/50 hover:text-white hover:bg-white/[0.05]"
                                        )}
                                    >
                                        <span>{type === "all" ? "All Activations" : type === "active" ? "Active" : type === "completed" ? "Completed" : "Expired"}</span>
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
                                    {(["all", "active", "completed", "expired"] as const).map((type) => (
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
                                                    ? "bg-[hsl(var(--neon-lime))] text-black font-bold"
                                                    : "text-white/50 hover:text-white"
                                            )}
                                        >
                                            {type === "all" ? "All Activations" : type}
                                        </Button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </Card>

                {/* Number Cards Grid (ModernNumberCard Integration) */}
                <div className="space-y-4">
                    <AnimatePresence mode="wait">
                        {isLoading ? (
                            <motion.div
                                key="skeleton"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4"
                            >
                                {[...Array(8)].map((_, i) => (
                                    <NumberCardSkeleton key={i} index={i} />
                                ))}
                            </motion.div>
                        ) : paginatedNumbers.length === 0 ? (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="text-center py-20 bg-white/[0.01] border border-white/[0.04] rounded-3xl backdrop-blur-xl"
                            >
                                <motion.div
                                    className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-white/[0.03] flex items-center justify-center border border-white/[0.05]"
                                    whileHover={{ rotate: 5, scale: 1.05 }}
                                >
                                    <Phone className="h-8 w-8 text-white/20" />
                                </motion.div>
                                <p className="text-lg font-semibold text-white/80 mb-2">No numbers found in Vault</p>
                                <p className="text-sm text-white/40 max-w-sm mx-auto mb-6">
                                    {searchTerm || filterType !== "all"
                                        ? "Try adjusting your search query or filter tabs."
                                        : "You don't have any active or past virtual number activations."}
                                </p>
                                {(searchTerm || filterType !== "all") ? (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setSearchTerm("")
                                            setFilterType("all")
                                        }}
                                        className="text-[hsl(var(--neon-lime))] hover:text-[hsl(var(--neon-lime))]"
                                    >
                                        Reset Filters
                                    </Button>
                                ) : (
                                    <Link href="/dashboard/buy">
                                        <Button className="h-10 px-6 rounded-xl bg-[hsl(var(--neon-lime))] text-black font-bold hover:bg-[hsl(72,100%,60%)] shadow-lg shadow-[hsl(var(--neon-lime)/0.2)]">
                                            Get Virtual Number
                                        </Button>
                                    </Link>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="list"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4"
                            >
                                {paginatedNumbers.map((num) => (
                                    <ModernNumberCard
                                        key={num.id}
                                        id={num.id}
                                        number={(num as any).phoneNumber || num.number}
                                        phoneCountryCode={(num as any).phoneCountryCode || null}
                                        phoneNationalNumber={(num as any).phoneNationalNumber || null}
                                        countryCode={num.countryCode}
                                        countryName={num.countryName}
                                        countryIconUrl={num.countryIconUrl}
                                        serviceName={num.serviceName}
                                        serviceIconUrl={num.serviceIconUrl}
                                        smsCount={num.smsCount}
                                        expiresAt={num.expiresAt}
                                        status={num.currentStatus}
                                        currencyPrices={(num as any).currencyPrices}
                                        className="h-[148px]"
                                    />
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
