"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
    Phone,
    Clock,
    MessageSquare,
    ArrowRight,
    Plus,
    Search,
    Copy,
    CheckCircle2,
    Filter,
    ChevronDown,
    ChevronUp,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    Globe,
    Timer
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useGlobalStore } from "@/store"
import { cn, formatPrice } from "@/lib/utils"
import { toast } from "sonner"

const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
}

const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
}

// Animated Countdown Timer with Progress Ring
function CountdownTimer({ expiresAt }: { expiresAt: string }) {
    const [timeLeft, setTimeLeft] = useState("")
    const [progress, setProgress] = useState(100)
    const totalDuration = 20 * 60 * 1000 // 20 minutes

    useEffect(() => {
        const calculateTimeLeft = () => {
            const diff = new Date(expiresAt).getTime() - Date.now()
            if (diff <= 0) return { time: "Expired", progress: 0 }

            const mins = Math.floor(diff / 60000)
            const secs = Math.floor((diff % 60000) / 1000)
            const progressPercent = Math.max(0, (diff / totalDuration) * 100)

            return {
                time: `${mins}:${secs.toString().padStart(2, "0")}`,
                progress: progressPercent
            }
        }

        const update = () => {
            const result = calculateTimeLeft()
            setTimeLeft(result.time)
            setProgress(result.progress)
        }

        update()
        const interval = setInterval(update, 1000)
        return () => clearInterval(interval)
    }, [expiresAt])

    const isExpired = timeLeft === "Expired"
    const isWarning = progress < 25

    return (
        <div className="flex items-center gap-2">
            <div className="relative w-8 h-8">
                <svg className="w-8 h-8 -rotate-90">
                    <circle
                        cx="16"
                        cy="16"
                        r="14"
                        strokeWidth="3"
                        className="fill-none stroke-muted/30"
                    />
                    <circle
                        cx="16"
                        cy="16"
                        r="14"
                        strokeWidth="3"
                        strokeDasharray={88}
                        strokeDashoffset={88 - (88 * progress) / 100}
                        className={cn(
                            "fill-none transition-all duration-1000",
                            isExpired ? "stroke-rose-500" :
                                isWarning ? "stroke-amber-500" : "stroke-cyan-500"
                        )}
                        strokeLinecap="round"
                    />
                </svg>
                <Timer className={cn(
                    "absolute inset-0 m-auto w-3.5 h-3.5",
                    isExpired ? "text-rose-500" :
                        isWarning ? "text-amber-500" : "text-cyan-500"
                )} />
            </div>
            <span className={cn(
                "font-mono text-sm font-semibold",
                isExpired ? "text-rose-500" :
                    isWarning ? "text-amber-500" : "text-cyan-500"
            )}>
                {timeLeft}
            </span>
        </div>
    )
}

// Country flag emoji helper
function getCountryFlag(countryName: string): string {
    const flags: Record<string, string> = {
        "USA": "🇺🇸", "United States": "🇺🇸",
        "UK": "🇬🇧", "United Kingdom": "🇬🇧",
        "Germany": "🇩🇪", "France": "🇫🇷",
        "Russia": "🇷🇺", "India": "🇮🇳",
        "China": "🇨🇳", "Brazil": "🇧🇷",
        "Canada": "🇨🇦", "Australia": "🇦🇺",
        "Spain": "🇪🇸", "Italy": "🇮🇹",
        "Netherlands": "🇳🇱", "Poland": "🇵🇱"
    }
    return flags[countryName] || "🌍"
}

// Service icon helper
function getServiceIcon(serviceName: string): string {
    const icons: Record<string, string> = {
        "WhatsApp": "💬",
        "Telegram": "✈️",
        "Facebook": "📘",
        "Instagram": "📷",
        "Twitter": "🐦",
        "Google": "🔍",
        "Microsoft": "🪟",
        "Amazon": "📦",
        "Netflix": "🎬",
        "Uber": "🚗"
    }
    return icons[serviceName] || "📱"
}

export default function VaultPage() {
    const { activeNumbers, numberHistory } = useGlobalStore()
    const [searchQuery, setSearchQuery] = useState("")
    const [showExpired, setShowExpired] = useState(false)
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 6

    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
    const [selectedService, setSelectedService] = useState<string | null>(null)
    const [sortBy, setSortBy] = useState<"newest" | "oldest" | "price_asc" | "price_desc">("newest")

    // Get unique countries and services for filter options
    const uniqueCountries = Array.from(new Set(activeNumbers.map(n => n.countryName)))
    const uniqueServices = Array.from(new Set(activeNumbers.map(n => n.serviceName)))

    // Filter active numbers
    const filteredNumbers = activeNumbers
        .filter(num => {
            const matchesSearch =
                num.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                num.serviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                num.countryName.toLowerCase().includes(searchQuery.toLowerCase())

            const matchesCountry = selectedCountry ? num.countryName === selectedCountry : true
            const matchesService = selectedService ? num.serviceName === selectedService : true

            return matchesSearch && matchesCountry && matchesService
        })
        .sort((a, b) => {
            if (sortBy === "newest") return new Date(b.purchasedAt || "").getTime() - new Date(a.purchasedAt || "").getTime()
            if (sortBy === "oldest") return new Date(a.purchasedAt || "").getTime() - new Date(b.purchasedAt || "").getTime()
            if (sortBy === "price_asc") return a.price - b.price
            if (sortBy === "price_desc") return b.price - a.price
            return 0
        })

    // Pagination
    const totalPages = Math.ceil(filteredNumbers.length / itemsPerPage)
    const paginatedNumbers = filteredNumbers.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    )

    // Stats
    const totalSMS = activeNumbers.reduce((acc, num) => acc + num.smsCount, 0)
    const totalSpent = activeNumbers.reduce((acc, num) => acc + num.price, 0)

    // Copy number to clipboard
    const copyNumber = async (number: string, id: string) => {
        await navigator.clipboard.writeText(number)
        setCopiedId(id)
        toast.success("Number copied!")
        setTimeout(() => setCopiedId(null), 2000)
    }

    return (
        <div className="p-4 md:p-6 lg:p-8 min-h-screen">
            <motion.div
                initial="hidden"
                animate="visible"
                variants={staggerContainer}
                className="space-y-6 max-w-7xl mx-auto"
            >
                {/* Premium Header */}
                <motion.div variants={fadeInUp} className="space-y-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-violet-500 to-purple-500">
                            Number Vault
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Manage your virtual numbers & receive SMS
                        </p>
                    </div>

                    {/* Stats Bar - Hidden on mobile */}
                    <div className="hidden md:grid grid-cols-3 gap-4">
                        {[
                            { label: "Active", value: activeNumbers.length.toString(), icon: Phone, color: "from-cyan-500 to-sky-500" },
                            { label: "SMS", value: totalSMS.toString(), icon: MessageSquare, color: "from-emerald-500 to-teal-500" },
                            { label: "Spent", value: formatPrice(totalSpent), icon: Globe, color: "from-violet-500 to-purple-500" }
                        ].map((stat) => (
                            <div
                                key={stat.label}
                                className="relative overflow-hidden rounded-xl border border-white/10 bg-card/50 backdrop-blur-xl p-3"
                            >
                                <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-10`} />
                                <div className="relative flex flex-col items-center text-center gap-1">
                                    <div className={`p-2 rounded-xl bg-gradient-to-br ${stat.color}`}>
                                        <stat.icon className="h-4 w-4 text-white" />
                                    </div>
                                    <p className="text-lg font-bold">{stat.value}</p>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{stat.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* Search & Filter Bar */}
                <motion.div variants={fadeInUp} className="space-y-4">
                    <div className="relative z-20">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by number, service, or country..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-11 pr-12 h-12 bg-card/50 border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/20 transition-all"
                        />
                        <Button
                            variant={isFilterOpen ? "gradient" : "ghost"}
                            size="icon"
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg transition-all duration-300"
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                        >
                            <Filter className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Advanced Filter Panel */}
                    <AnimatePresence>
                        {isFilterOpen && (
                            <motion.div
                                initial={{ height: 0, opacity: 0, scale: 0.98 }}
                                animate={{ height: "auto", opacity: 1, scale: 1 }}
                                exit={{ height: 0, opacity: 0, scale: 0.98 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <Card className="border-white/5 bg-[#0f172a] shadow-xl">
                                    <CardContent className="p-5 space-y-6">
                                        {/* Country Filter */}
                                        <div className="space-y-3">
                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-1">Country</label>
                                            <div className="flex flex-wrap gap-2.5">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className={cn(
                                                        "rounded-full h-9 px-4 text-xs font-medium border transition-all",
                                                        selectedCountry === null
                                                            ? "bg-white/10 border-white/10 text-white"
                                                            : "border-white/5 text-muted-foreground hover:bg-white/5 hover:text-white"
                                                    )}
                                                    onClick={() => setSelectedCountry(null)}
                                                >
                                                    All
                                                </Button>
                                                {uniqueCountries.map(country => (
                                                    <Button
                                                        key={country}
                                                        variant="ghost"
                                                        size="sm"
                                                        className={cn(
                                                            "rounded-full h-9 pl-2 pr-4 text-xs font-medium border transition-all",
                                                            selectedCountry === country
                                                                ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/25"
                                                                : "bg-[#1e293b] border-white/5 text-gray-300 hover:border-white/10 hover:bg-[#334155]"
                                                        )}
                                                        onClick={() => setSelectedCountry(selectedCountry === country ? null : country)}
                                                    >
                                                        <span className="mr-2 text-base">{getCountryFlag(country)}</span>
                                                        {country}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="border-t border-white/5" />

                                        {/* Service Filter */}
                                        <div className="space-y-3">
                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-1">Service</label>
                                            <div className="flex flex-wrap gap-2.5">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className={cn(
                                                        "rounded-full h-9 px-4 text-xs font-medium border transition-all",
                                                        selectedService === null
                                                            ? "bg-white/10 border-white/10 text-white"
                                                            : "border-white/5 text-muted-foreground hover:bg-white/5 hover:text-white"
                                                    )}
                                                    onClick={() => setSelectedService(null)}
                                                >
                                                    All
                                                </Button>
                                                {uniqueServices.map(service => (
                                                    <Button
                                                        key={service}
                                                        variant="ghost"
                                                        size="sm"
                                                        className={cn(
                                                            "rounded-full h-9 pl-2 pr-4 text-xs font-medium border transition-all",
                                                            selectedService === service
                                                                ? "bg-teal-500 border-teal-400 text-white shadow-lg shadow-teal-500/25"
                                                                : "bg-[#1e293b] border-white/5 text-gray-300 hover:border-white/10 hover:bg-[#334155]"
                                                        )}
                                                        onClick={() => setSelectedService(selectedService === service ? null : service)}
                                                    >
                                                        <span className="mr-2 text-sm">{getServiceIcon(service)}</span>
                                                        {service}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="border-t border-white/5" />

                                        {/* Sort Options */}
                                        <div className="space-y-3">
                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest pl-1">Sort By</label>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                {[
                                                    { id: "newest", label: "Newest First" },
                                                    { id: "oldest", label: "Oldest First" },
                                                    { id: "price_asc", label: "Price: Low to High" },
                                                    { id: "price_desc", label: "Price: High to Low" }
                                                ].map((option) => (
                                                    <Button
                                                        key={option.id}
                                                        variant="ghost"
                                                        size="sm"
                                                        className={cn(
                                                            "justify-start h-9 text-xs font-medium rounded-lg transition-all",
                                                            sortBy === option.id
                                                                ? "bg-white/10 text-white font-semibold"
                                                                : "text-muted-foreground hover:text-white"
                                                        )}
                                                        onClick={() => setSortBy(option.id as any)}
                                                    >
                                                        {option.label}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Active Numbers */}
                <motion.div variants={fadeInUp}>
                    <Card className="border-white/10 bg-card/50 backdrop-blur-xl overflow-hidden">
                        <CardHeader className="border-b border-white/10">
                            <CardTitle className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/20 to-sky-500/20">
                                    <Phone className="h-5 w-5 text-cyan-500" />
                                </div>
                                <span>Active Numbers</span>
                                <Badge variant="secondary" className="ml-auto">
                                    {filteredNumbers.length}
                                </Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6">
                            {filteredNumbers.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="relative w-24 h-24 mx-auto mb-6">
                                        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-violet-500/20 rounded-full blur-xl" />
                                        <div className="relative flex items-center justify-center w-full h-full rounded-full border-2 border-dashed border-muted-foreground/30">
                                            <Phone className="h-10 w-10 text-muted-foreground/50" />
                                        </div>
                                    </div>
                                    <h3 className="text-xl font-semibold mb-2">No Active Numbers</h3>
                                    <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                                        Purchase a virtual number to start receiving SMS and OTP codes
                                    </p>
                                    <Link href="/buy">
                                        <Button variant="gradient" size="lg">
                                            <Plus className="h-4 w-4 mr-2" />
                                            Buy Your First Number
                                        </Button>
                                    </Link>
                                </div>
                            ) : (
                                <>
                                    <div className="grid gap-3 md:gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                        <AnimatePresence mode="wait">
                                            {paginatedNumbers.map((number, index) => (
                                                <motion.div
                                                    key={number.id}
                                                    initial={{ opacity: 0, y: 20 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95 }}
                                                    transition={{ delay: index * 0.03 }}
                                                >
                                                    {/* Mobile: Premium List Item Style */}
                                                    <Card className="md:hidden group relative overflow-hidden border-white/5 bg-[#0f172a] hover:bg-[#1e293b] transition-colors duration-300 rounded-2xl">
                                                        <CardContent className="relative p-3.5 flex items-center gap-3.5">
                                                            {/* 1. Country Avatar */}
                                                            <div className="relative shrink-0">
                                                                <div className="w-12 h-12 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-xl shadow-inner">
                                                                    {getCountryFlag(number.countryName)}
                                                                </div>
                                                                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-[#0f172a] flex items-center justify-center">
                                                                    <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                                                                </div>
                                                            </div>

                                                            {/* 2. Details (Middle) */}
                                                            <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                                                                {/* Number + Copy */}
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-base text-gray-100 tracking-wide truncate">
                                                                        {number.number}
                                                                    </span>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            copyNumber(number.number, number.id);
                                                                        }}
                                                                        className="text-muted-foreground hover:text-white transition-colors"
                                                                    >
                                                                        {copiedId === number.id ? (
                                                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                                                        ) : (
                                                                            <Copy className="h-3.5 w-3.5" />
                                                                        )}
                                                                    </button>
                                                                </div>

                                                                {/* Meta Info */}
                                                                <div className="flex items-center gap-2 text-xs text-muted-foreground/80 font-medium">
                                                                    <span className="flex items-center gap-1">
                                                                        {getServiceIcon(number.serviceName)} {number.serviceName}
                                                                    </span>
                                                                    <span className="w-1 h-1 rounded-full bg-white/20" />
                                                                    <CountdownTimer expiresAt={number.expiresAt || ""} />
                                                                </div>
                                                            </div>

                                                            {/* 3. Action Button (Right) */}
                                                            <Link href={`/sms/${encodeURIComponent(number.number)}`}>
                                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 group-active:scale-95 transition-transform">
                                                                    <ArrowRight className="h-5 w-5 text-white" />
                                                                </div>
                                                            </Link>
                                                        </CardContent>
                                                    </Card>

                                                    {/* Desktop: Full card */}
                                                    <Card className="hidden md:block group relative overflow-hidden border-white/10 bg-card/80 backdrop-blur-xl hover:border-emerald-500/30 transition-all duration-300">
                                                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        <CardContent className="relative p-4">
                                                            <div className="flex items-center justify-between mb-3">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="relative">
                                                                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-card to-muted flex items-center justify-center text-2xl border-2 border-white/10">
                                                                            {getCountryFlag(number.countryName)}
                                                                        </div>
                                                                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                                                                            <CheckCircle2 className="h-3 w-3 text-white" />
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <p className="font-semibold text-base">{number.countryName}</p>
                                                                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mt-0.5">
                                                                            {number.serviceName}
                                                                        </Badge>
                                                                    </div>
                                                                </div>
                                                                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">LIVE</Badge>
                                                            </div>
                                                            <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 mb-3">
                                                                <p className="font-mono text-sm font-semibold">{number.number}</p>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7 hover:bg-emerald-500/20"
                                                                    onClick={() => copyNumber(number.number, number.id)}
                                                                >
                                                                    {copiedId === number.id ? (
                                                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                                                    ) : (
                                                                        <Copy className="h-3.5 w-3.5" />
                                                                    )}
                                                                </Button>
                                                            </div>
                                                            <div className="flex items-center justify-between text-sm mb-4">
                                                                <CountdownTimer expiresAt={number.expiresAt || ""} />
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-muted-foreground">{number.smsCount} SMS</span>
                                                                    <span className="text-muted-foreground">•</span>
                                                                    <span className="text-emerald-400">{formatPrice(number.price)}</span>
                                                                </div>
                                                            </div>
                                                            <Link href={`/sms/${encodeURIComponent(number.number)}`}>
                                                                <Button variant="gradient" className="w-full group/btn">
                                                                    View SMS
                                                                    <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover/btn:translate-x-1" />
                                                                </Button>
                                                            </Link>
                                                        </CardContent>
                                                    </Card>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>

                                    {/* Premium Pagination */}
                                    {totalPages > 1 && (
                                        <div className="flex items-center justify-center gap-2 mt-6">
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
                                </>
                            )}
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Expired Numbers - Collapsible */}
                {numberHistory.length > 0 && (
                    <motion.div variants={fadeInUp}>
                        <Card className="border-white/10 bg-card/30 backdrop-blur-xl">
                            <CardHeader
                                className="cursor-pointer hover:bg-white/5 transition-colors"
                                onClick={() => setShowExpired(!showExpired)}
                            >
                                <CardTitle className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-muted/50">
                                        <Clock className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <span className="text-muted-foreground">Expired Numbers</span>
                                    <Badge variant="secondary" className="ml-2">
                                        {numberHistory.length}
                                    </Badge>
                                    <div className="ml-auto">
                                        {showExpired ? (
                                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                                        ) : (
                                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                        )}
                                    </div>
                                </CardTitle>
                            </CardHeader>
                            <AnimatePresence>
                                {showExpired && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <CardContent className="pt-0">
                                            <div className="space-y-2">
                                                {numberHistory
                                                    .sort((a, b) => {
                                                        // Sort by date purchased (most recent first)
                                                        const timeA = new Date(a.purchasedAt || 0).getTime();
                                                        const timeB = new Date(b.purchasedAt || 0).getTime();
                                                        return timeB - timeA;
                                                    })
                                                    .map((number) => (
                                                        <div
                                                            key={number.id}
                                                            className="flex items-center justify-between p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-lg">{getCountryFlag(number.countryName)}</span>
                                                                <div>
                                                                    <p className="font-mono font-medium">{number.number}</p>
                                                                    <p className="text-xs text-muted-foreground">
                                                                        {getServiceIcon(number.serviceName)} {number.serviceName}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                                                                {number.smsCount} SMS
                                                            </Badge>
                                                        </div>
                                                    ))}
                                            </div>
                                        </CardContent>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </Card>
                    </motion.div>
                )}
            </motion.div>
        </div>
    )
}
