"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
    Search,
    Filter,
    ArrowLeft,
    Clock,
    Check,
    Archive,
    LayoutGrid,
    AlertCircle,
    XCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useGlobalStore } from "@/store"
import { cn } from "@/lib/utils/utils"
import { DashboardBackground } from "../components/dashboard-background"
import { VaultOrderCard, VaultOrderStatus } from "./components/VaultOrderCard"

const ITEMS_PER_PAGE = 12;

export default function VaultPage() {
    const { activeNumbers } = useGlobalStore()
    const [searchQuery, setSearchQuery] = useState("")
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
    const [selectedService, setSelectedService] = useState<string | null>(null)
    const [selectedStatus, setSelectedStatus] = useState<'all' | VaultOrderStatus>('all')
    const [currentPage, setCurrentPage] = useState(1)
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    // Unified List Logic
    const allNumbers = useMemo(() => {
        if (!isMounted) return []

        const now = Date.now()

        return activeNumbers
            .filter(num => num && num.id && num.number && num.expiresAt)
            .map(num => {
                const expiresAt = new Date(num.expiresAt).getTime()
                let status: VaultOrderStatus = 'active';

                if (isNaN(expiresAt) || expiresAt <= now) {
                    if ((num.smsCount || 0) > 0) {
                        status = 'completed';
                    } else {
                        status = 'expired';
                    }
                }

                // If explicitly cancelled/refunded in future (placeholder logic if you have a status field)
                // if (num.status === 'refunded') status = 'refunded';

                return { ...num, currentStatus: status }
            })
            .sort((a, b) => {
                // Sort by purchase time desc (newest first)
                // Fallback to ID if purchasedAt missing
                const dateA = a.purchasedAt ? new Date(a.purchasedAt).getTime() : 0;
                const dateB = b.purchasedAt ? new Date(b.purchasedAt).getTime() : 0;
                return dateB - dateA;
            });
    }, [activeNumbers, isMounted])

    // Filter Options
    const uniqueCountries = useMemo(() =>
        Array.from(new Set(allNumbers.map(n => n.countryName))).filter(Boolean),
        [allNumbers]
    )
    const uniqueServices = useMemo(() =>
        Array.from(new Set(allNumbers.map(n => n.serviceName))).filter(Boolean),
        [allNumbers]
    )

    // Filter Logic
    const filteredNumbers = useMemo(() => {
        return allNumbers.filter(num => {
            // Status Filter
            if (selectedStatus !== 'all' && num.currentStatus !== selectedStatus) return false;

            // Search
            const q = searchQuery.toLowerCase();
            const matchesSearch =
                !q ||
                num.number.toLowerCase().includes(q) ||
                (num.serviceName || '').toLowerCase().includes(q) ||
                (num.countryName || '').toLowerCase().includes(q);

            // Dropdown Filters
            const matchesCountry = selectedCountry ? num.countryName === selectedCountry : true;
            const matchesService = selectedService ? num.serviceName === selectedService : true;

            return matchesSearch && matchesCountry && matchesService;
        })
    }, [allNumbers, searchQuery, selectedCountry, selectedService, selectedStatus])

    // Stats
    const stats = useMemo(() => ({
        all: allNumbers.length,
        active: allNumbers.filter(n => n.currentStatus === 'active').length,
        completed: allNumbers.filter(n => n.currentStatus === 'completed').length,
        expired: allNumbers.filter(n => n.currentStatus === 'expired').length
    }), [allNumbers]);

    // Pagination
    const totalPages = Math.ceil(filteredNumbers.length / ITEMS_PER_PAGE)
    const paginatedNumbers = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE
        return filteredNumbers.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredNumbers, currentPage])

    // Handlers
    const handleStatusChange = (status: typeof selectedStatus) => {
        setSelectedStatus(status);
        setCurrentPage(1);
    }

    const clearFilters = () => {
        setSelectedCountry(null)
        setSelectedService(null)
        setSearchQuery("")
        setCurrentPage(1)
    }

    return (
        <div className="relative min-h-screen pb-20 overflow-x-hidden">
            <DashboardBackground />

            <div className="relative z-30 container mx-auto px-4 md:px-6 max-w-7xl pt-6 animate-in fade-in duration-700">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard" className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-white/20 transition-all group">
                            <ArrowLeft className="w-5 h-5 text-zinc-400 group-hover:text-white" />
                        </Link>
                        <div>
                            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                                Number Vault
                                <span className="flex items-center justify-center px-2.5 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 font-mono font-bold">
                                    {allNumbers.length}
                                </span>
                            </h1>
                            <p className="text-sm text-zinc-500 mt-0.5">Manage all your active and past numbers</p>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <div className="relative flex-1 md:w-64 group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-white transition-colors" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search number, service..."
                                className="pl-9 bg-zinc-900/50 border-white/10 focus:border-[hsl(var(--neon-lime))] rounded-xl"
                            />
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className={cn(
                                "rounded-xl border-white/10 bg-zinc-900/50 hover:bg-zinc-800",
                                (isFilterOpen || selectedCountry || selectedService) && "border-[hsl(var(--neon-lime))] text-[hsl(var(--neon-lime))]"
                            )}
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
                            className="bg-zinc-900/40 border border-white/10 rounded-xl p-4 mb-6 overflow-hidden"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Country</label>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setSelectedCountry(null)}
                                            className={cn("px-3 py-1 rounded-lg text-xs transition-colors", !selectedCountry ? "bg-white/20 text-white" : "bg-white/5 text-zinc-400 hover:text-white")}
                                        >All</button>
                                        {uniqueCountries.map(c => (
                                            <button
                                                key={c}
                                                onClick={() => setSelectedCountry(selectedCountry === c ? null : c)}
                                                className={cn("px-3 py-1 rounded-lg text-xs transition-colors", selectedCountry === c ? "bg-[hsl(var(--neon-lime))] text-black font-bold" : "bg-white/5 text-zinc-400 hover:text-white")}
                                            >{c}</button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Service</label>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            onClick={() => setSelectedService(null)}
                                            className={cn("px-3 py-1 rounded-lg text-xs transition-colors", !selectedService ? "bg-white/20 text-white" : "bg-white/5 text-zinc-400 hover:text-white")}
                                        >All</button>
                                        {uniqueServices.map(s => (
                                            <button
                                                key={s}
                                                onClick={() => setSelectedService(selectedService === s ? null : s)}
                                                className={cn("px-3 py-1 rounded-lg text-xs transition-colors capitalize", selectedService === s ? "bg-[hsl(var(--neon-lime))] text-black font-bold" : "bg-white/5 text-zinc-400 hover:text-white")}
                                            >{s}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            {(selectedCountry || selectedService) && (
                                <button onClick={clearFilters} className="mt-4 text-xs flex items-center gap-1 text-red-400 hover:text-red-300">
                                    <XCircle className="w-3 h-3" /> Clear Filters
                                </button>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Status Tabs */}
                <div className="flex overflow-x-auto pb-4 mb-2 gap-2 hide-scrollbar">
                    {[
                        { id: 'all', label: 'All Orders', icon: LayoutGrid, count: stats.all },
                        { id: 'active', label: 'Active', icon: Clock, count: stats.active },
                        { id: 'completed', label: 'Completed', icon: Check, count: stats.completed },
                        { id: 'expired', label: 'Expired', icon: Archive, count: stats.expired },
                    ].map((tab) => {
                        const Icon = tab.icon;
                        const isActive = selectedStatus === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => handleStatusChange(tab.id as any)}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all whitespace-nowrap",
                                    isActive
                                        ? "bg-white/10 border-white/20 text-white shadow-lg shadow-black/20"
                                        : "bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                                )}
                            >
                                <Icon className={cn("w-4 h-4", isActive && tab.id === 'active' ? "text-[hsl(var(--neon-lime))]" : "")} />
                                <span className="text-sm font-medium">{tab.label}</span>
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded-md text-[10px] font-bold min-w-[20px] text-center",
                                    isActive ? "bg-white/20 text-white" : "bg-white/5 text-zinc-600"
                                )}>
                                    {tab.count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Grid Content */}
                {paginatedNumbers.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        <AnimatePresence mode="popLayout">
                            {paginatedNumbers.map((num) => (
                                <motion.div
                                    key={num.id}
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.98 }}
                                    transition={{ duration: 0.15 }}
                                >
                                    <VaultOrderCard number={num} status={num.currentStatus} />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 bg-zinc-900/20 border border-white/5 rounded-3xl mt-4">
                        <div className="w-16 h-16 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center mb-4">
                            <Search className="w-8 h-8 text-zinc-700" />
                        </div>
                        <h3 className="text-lg font-bold text-white mb-1">No orders found</h3>
                        <p className="text-sm text-zinc-500">Try adjusting your filters or status tabs</p>
                        <Button
                            variant="outline"
                            className="mt-6 border-white/10 text-zinc-400 hover:text-white hover:bg-white/5"
                            onClick={() => { clearFilters(); setSelectedStatus('all'); }}
                        >
                            Reset all filters
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}
