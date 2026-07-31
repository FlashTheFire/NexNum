"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Globe, Server, XCircle, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils/utils"

interface VaultFilterDrawerProps {
    isOpen: boolean
    uniqueCountries: string[]
    uniqueServices: string[]
    selectedCountry: string | null
    selectedService: string | null
    onSelectCountry: (country: string | null) => void
    onSelectService: (service: string | null) => void
    onClear: () => void
}

export function VaultFilterDrawer({
    isOpen,
    uniqueCountries,
    uniqueServices,
    selectedCountry,
    selectedService,
    onSelectCountry,
    onSelectService,
    onClear
}: VaultFilterDrawerProps) {
    const hasActiveFilters = Boolean(selectedCountry || selectedService)

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden mb-6"
                >
                    <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-5 backdrop-blur-xl shadow-2xl space-y-5">
                        <div className="flex items-center justify-between border-b border-white/10 pb-3">
                            <span className="text-xs font-extrabold uppercase tracking-widest text-zinc-400">
                                Advanced Filter Options
                            </span>
                            {hasActiveFilters && (
                                <button
                                    onClick={onClear}
                                    className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1.5 transition-colors"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" /> Reset Filters
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Country Filter Section */}
                            <div>
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                    <Globe className="w-3.5 h-3.5 text-sky-400" /> Filter by Country
                                </label>
                                <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1 scrollbar-hide">
                                    <button
                                        onClick={() => onSelectCountry(null)}
                                        className={cn(
                                            "px-3 py-1.5 rounded-xl text-xs font-medium transition-all",
                                            !selectedCountry
                                                ? "bg-white/20 text-white font-bold border border-white/30"
                                                : "bg-white/5 text-zinc-400 hover:text-white border border-transparent"
                                        )}
                                    >
                                        All Countries
                                    </button>
                                    {uniqueCountries.map((c) => (
                                        <button
                                            key={c}
                                            onClick={() => onSelectCountry(selectedCountry === c ? null : c)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-xl text-xs transition-all",
                                                selectedCountry === c
                                                    ? "bg-[hsl(var(--neon-lime))] text-black font-extrabold shadow-md shadow-[hsl(var(--neon-lime))/0.2]"
                                                    : "bg-white/5 text-zinc-400 hover:text-white border border-white/5"
                                            )}
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Service Filter Section */}
                            <div>
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                    <Server className="w-3.5 h-3.5 text-purple-400" /> Filter by Service
                                </label>
                                <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1 scrollbar-hide">
                                    <button
                                        onClick={() => onSelectService(null)}
                                        className={cn(
                                            "px-3 py-1.5 rounded-xl text-xs font-medium transition-all",
                                            !selectedService
                                                ? "bg-white/20 text-white font-bold border border-white/30"
                                                : "bg-white/5 text-zinc-400 hover:text-white border border-transparent"
                                        )}
                                    >
                                        All Services
                                    </button>
                                    {uniqueServices.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => onSelectService(selectedService === s ? null : s)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-xl text-xs capitalize transition-all",
                                                selectedService === s
                                                    ? "bg-[hsl(var(--neon-lime))] text-black font-extrabold shadow-md shadow-[hsl(var(--neon-lime))/0.2]"
                                                    : "bg-white/5 text-zinc-400 hover:text-white border border-white/5"
                                            )}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
