"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
    Phone,
    MessageSquare,
    Search,
    Filter,
    Plus,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    X,
    Archive,
    ArrowLeft,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useGlobalStore } from "@/store"
import { cn } from "@/lib/utils/utils"
import { DashboardBackground } from "../components/dashboard-background"
import { VaultCard } from "./components/VaultCard"
import { ExpiredCard } from "./components/ExpiredCard"

const ITEMS_PER_PAGE = 6;

export default function VaultPage() {
    const { activeNumbers } = useGlobalStore()
    const [searchQuery, setSearchQuery] = useState("")
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
    const [selectedService, setSelectedService] = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [showExpired, setShowExpired] = useState(false) // Default folded
    const [showCompleted, setShowCompleted] = useState(false) // Default folded

    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    // Separate active, completed, and expired numbers
    const { liveNumbers, completedNumbers, expiredNumbers } = useMemo(() => {
        // Return empty arrays during server-side rendering to avoid hydration mismatch
        // effectively showing "No numbers found" initially (loading state)
        if (!isMounted) return { liveNumbers: [], completedNumbers: [], expiredNumbers: [] }

        const now = Date.now()
        const live: typeof activeNumbers = []
        const completed: typeof activeNumbers = []
        const expired: typeof activeNumbers = []

        activeNumbers.forEach(num => {
            // Strict Validation: Skip invalid or corrupted entries from localStorage
            if (!num || !num.id || !num.number || !num.expiresAt) return

            const expiresAt = new Date(num.expiresAt).getTime()
            // Skip invalid dates
            if (isNaN(expiresAt)) return

            if (expiresAt <= now) {
                // Completed = received SMS, Expired = no SMS
                if ((num.smsCount || 0) > 0) {
                    completed.push(num)
                } else {
                    expired.push(num)
                }
            } else {
                live.push(num)
            }
        })
        return { liveNumbers: live, completedNumbers: completed, expiredNumbers: expired }
    }, [activeNumbers, isMounted])

    // Get unique data for filters (from live numbers only)
    const uniqueCountries = useMemo(() =>
        Array.from(new Set(liveNumbers.map(n => n.countryName))).filter(Boolean),
        [liveNumbers]
    )
    const uniqueServices = useMemo(() =>
        Array.from(new Set(liveNumbers.map(n => n.serviceName))).filter(Boolean),
        [liveNumbers]
    )

    // Filter Logic (for live numbers only)
    const filteredNumbers = useMemo(() => {
        return liveNumbers.filter(num => {
            const matchesSearch =
                num.number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (num.serviceName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (num.countryName || '').toLowerCase().includes(searchQuery.toLowerCase())

            const matchesCountry = selectedCountry ? num.countryName === selectedCountry : true
            const matchesService = selectedService ? num.serviceName === selectedService : true

            return matchesSearch && matchesCountry && matchesService
        })
    }, [liveNumbers, searchQuery, selectedCountry, selectedService])

    // Pagination
    const totalPages = Math.ceil(filteredNumbers.length / ITEMS_PER_PAGE)
    const paginatedNumbers = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE
        return filteredNumbers.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredNumbers, currentPage])

    // Reset page when filters change
    const handleFilterChange = (type: 'country' | 'service', value: string | null) => {
        setCurrentPage(1)
        if (type === 'country') setSelectedCountry(value)
        if (type === 'service') setSelectedService(value)
    }

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value)
        setCurrentPage(1)
    }

    const clearFilters = () => {
        setSelectedCountry(null)
        setSelectedService(null)
        setSearchQuery("")
        setCurrentPage(1)
    }

    const activeFiltersCount = [selectedCountry, selectedService, searchQuery].filter(Boolean).length

    // Stats
    const totalSMS = activeNumbers.reduce((acc, num) => acc + (num.smsCount || 0), 0)

    return (
        <div className="relative min-h-screen pb-20 overflow-x-hidden">
            <DashboardBackground />

            <div className="relative z-30 container mx-auto px-4 md:px-6 max-w-7xl pt-8 animate-in fade-in duration-700">

                {/* New Sticky Header */}
                <div className="sticky top-[4px] md:top-4 z-40 bg-[#0a0a0c]/95 backdrop-blur-xl border-b border-white/5 py-3 -mx-4 px-4 md:mx-0 md:bg-[#0a0a0c]/80 md:border md:rounded-2xl md:px-6 md:py-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg transition-all animate-in fade-in slide-in-from-top-2 duration-500">
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-3">
                            <Link href="/dashboard" className="p-1.5 hover:bg-white/10 rounded-full transition-colors -ml-1 group">
                                <ArrowLeft className="w-4 h-4 text-white group-hover:text-[hsl(var(--neon-lime))] transition-colors" />
                            </Link>
                            <h2 className="text-xl font-bold text-white flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[hsl(var(--neon-lime))] text-black text-sm font-bold shadow-[0_0_15px_hsl(var(--neon-lime)/0.4)]">
                                    <Archive className="w-4 h-4" />
                                </span>
                                Number Vault
                            </h2>
                        </div>
                        {/* Mobile Live Badge (Hidden on Desktop) */}
                        <div className="flex md:hidden items-center bg-zinc-900 rounded-full border border-white/5 px-2.5 py-1 gap-2">
                            <span className="flex w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                            <span className="text-[10px] font-mono text-zinc-300">Live</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        {/* Desktop Live Badge */}
                        <div className="hidden md:flex items-center bg-zinc-900 rounded-full border border-white/5 px-2.5 py-1 gap-2 mr-2">
                            <span className="flex w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                            <span className="text-[10px] sm:text-xs font-mono text-zinc-300">Live</span>
                        </div>

                        {/* Search Input */}
                        <div className="relative flex-1 md:w-64 group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-4 w-4 text-gray-500 group-focus-within:text-[hsl(var(--neon-lime))] transition-colors" />
                            </div>
                            <Input
                                placeholder="Search numbers..."
                                value={searchQuery}
                                onChange={handleSearchChange}
                                className="w-full bg-[#0a0a0c] border border-white/10 text-sm rounded-xl py-2.5 pl-10 pr-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-[hsl(var(--neon-lime))/50] focus:bg-zinc-900/50 focus:shadow-[0_0_15px_rgba(204,255,0,0.1)] transition-all h-10"
                            />
                        </div>

                        {/* Filter Button (All Devices) */}
                        <Button
                            variant="outline"
                            size="icon"
                            className={cn(
                                "h-10 w-10 rounded-xl border-[#1E2128] bg-[#111318] hover:bg-white/10 text-gray-400 shrink-0",
                                isFilterOpen && "border-[hsl(var(--neon-lime))] text-[hsl(var(--neon-lime))]"
                            )}
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                        >
                            <Filter className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Filter Panel */}
                <AnimatePresence>
                    {isFilterOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="p-4 rounded-xl bg-[#111318] border border-[#1E2128] space-y-4">
                                {/* Country Filter */}
                                <div>
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Country</div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => handleFilterChange('country', null)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                                !selectedCountry
                                                    ? "bg-[hsl(var(--neon-lime))] text-black"
                                                    : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                                            )}
                                        >All</button>
                                        {uniqueCountries.map(c => (
                                            <button
                                                key={c}
                                                onClick={() => handleFilterChange('country', selectedCountry === c ? null : c)}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                                    selectedCountry === c
                                                        ? "bg-[hsl(var(--neon-lime))] text-black"
                                                        : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                                                )}
                                            >{c}</button>
                                        ))}
                                    </div>
                                </div>

                                {/* Service Filter */}
                                <div>
                                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Service</div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => handleFilterChange('service', null)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                                !selectedService
                                                    ? "bg-[hsl(var(--neon-lime))] text-black"
                                                    : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                                            )}
                                        >All</button>
                                        {uniqueServices.map(s => (
                                            <button
                                                key={s}
                                                onClick={() => handleFilterChange('service', selectedService === s ? null : s)}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all",
                                                    selectedService === s
                                                        ? "bg-[hsl(var(--neon-lime))] text-black"
                                                        : "bg-white/5 text-gray-400 hover:text-white hover:bg-white/10"
                                                )}
                                            >{s}</button>
                                        ))}
                                    </div>
                                </div>

                                {/* Clear Filters */}
                                {activeFiltersCount > 0 && (
                                    <button
                                        onClick={clearFilters}
                                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                                    >
                                        Clear all filters
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Grid */}
            <div className="px-4 md:px-6 max-w-7xl mx-auto relative z-20 mt-6">
                {paginatedNumbers.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {paginatedNumbers.map((num) => (
                            <div key={num.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <VaultCard number={num} />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-[#111318] border border-[#2a2e38] rounded-2xl p-12 text-center animate-in fade-in duration-300 shadow-lg">
                        <div className="w-16 h-16 rounded-full bg-white/10 mx-auto mb-4 flex items-center justify-center">
                            <Search className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-2">No numbers found</h3>
                        <p className="text-gray-400 text-sm mb-4">Try adjusting your filters</p>
                        {activeFiltersCount > 0 && (
                            <Button variant="outline" onClick={clearFilters} className="text-sm">
                                Clear filters
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* Completed & Expired Sections Container */}
            <div className="px-4 md:px-6 max-w-7xl mx-auto relative z-20 mt-6">
                {/* Completed Numbers - Collapsible (received SMS) */}
                {completedNumbers.length > 0 && (
                    <div className="mt-8 pt-6 border-t border-[#1E2128]">
                        <button
                            onClick={() => setShowCompleted(!showCompleted)}
                            className="w-full flex items-center justify-between p-3 rounded-xl bg-[#111318] hover:bg-[#15181E] border border-[#1E2128] transition-colors touch-manipulation"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-emerald-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                        <polyline points="22 4 12 14.01 9 11.01" />
                                    </svg>
                                </div>
                                <div className="text-left">
                                    <div className="text-sm font-medium text-emerald-400">Completed</div>
                                    <div className="text-[11px] text-gray-500">{completedNumbers.length} numbers</div>
                                </div>
                            </div>
                            <ChevronDown className={cn(
                                "w-5 h-5 text-gray-500 transition-transform duration-200",
                                showCompleted && "rotate-180"
                            )} />
                        </button>

                        {showCompleted && (
                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                {completedNumbers.map((num) => (
                                    <ExpiredCard key={num.id} number={num} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Expired Numbers - Collapsible (no SMS received) */}
                {expiredNumbers.length > 0 && (
                    <div className="mt-6">
                        <button
                            onClick={() => setShowExpired(!showExpired)}
                            className="w-full flex items-center justify-between p-4 rounded-xl bg-[#1F2229] hover:bg-[#252830] border-2 border-red-500/50 transition-colors touch-manipulation shadow-lg group"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                                    <Archive className="w-4 h-4 text-red-500" />
                                </div>
                                <div className="text-left">
                                    <div className="text-sm font-bold text-white group-hover:text-red-400 transition-colors">Expired Numbers</div>
                                    <div className="text-[11px] text-gray-400">{expiredNumbers.length} archived</div>
                                </div>
                            </div>
                            <ChevronDown className={cn(
                                "w-5 h-5 text-gray-400 transition-transform duration-200 group-hover:text-white",
                                showExpired && "rotate-180"
                            )} />
                        </button>

                        {showExpired && (
                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                {expiredNumbers.map((num) => (
                                    <ExpiredCard key={num.id} number={num} />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-8">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="h-10 px-4 rounded-lg border-[#1E2128] bg-[#111318] disabled:opacity-30"
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            Previous
                        </Button>

                        <div className="flex items-center gap-1 px-4">
                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    className={cn(
                                        "w-8 h-8 rounded-lg text-sm font-medium transition-all",
                                        currentPage === page
                                            ? "bg-[hsl(var(--neon-lime))] text-black"
                                            : "text-gray-500 hover:text-white hover:bg-white/5"
                                    )}
                                >
                                    {page}
                                </button>
                            ))}
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="h-10 px-4 rounded-lg border-[#1E2128] bg-[#111318] disabled:opacity-30"
                        >
                            Next
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}
