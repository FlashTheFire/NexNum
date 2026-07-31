"use client"

import { motion } from "framer-motion"
import { ShieldAlert, SearchX, ShoppingCart, RefreshCcw } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

interface VaultEmptyStateProps {
    type: 'no-numbers' | 'no-results'
    onClearFilters?: () => void
}

export function VaultEmptyState({ type, onClearFilters }: VaultEmptyStateProps) {
    if (type === 'no-results') {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-3xl border border-white/10 bg-zinc-900/40 backdrop-blur-xl my-8"
            >
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4 shadow-lg shadow-amber-500/5">
                    <SearchX className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">No Matching Vault Records</h3>
                <p className="text-sm text-zinc-400 max-w-md mb-6 leading-relaxed">
                    No active or historical numbers matched your active search query and selected filter options.
                </p>
                {onClearFilters && (
                    <Button
                        onClick={onClearFilters}
                        variant="outline"
                        className="rounded-xl border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold flex items-center gap-2"
                    >
                        <RefreshCcw className="w-4 h-4 text-[hsl(var(--neon-lime))]" />
                        Reset All Filters
                    </Button>
                )}
            </motion.div>
        )
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden flex flex-col items-center justify-center py-20 px-6 text-center rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900/60 via-zinc-900/40 to-black/80 backdrop-blur-2xl my-8 shadow-2xl"
        >
            {/* Ambient Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[hsl(var(--neon-lime))/0.1] blur-3xl rounded-full pointer-events-none" />

            <div className="relative z-10 w-20 h-20 rounded-3xl bg-gradient-to-tr from-[hsl(var(--neon-lime))/0.2] to-emerald-500/10 border border-[hsl(var(--neon-lime))/0.4] flex items-center justify-center text-[hsl(var(--neon-lime))] mb-6 shadow-xl shadow-[hsl(var(--neon-lime))/0.1]">
                <ShieldAlert className="w-10 h-10" />
            </div>

            <h3 className="relative z-10 text-2xl font-black text-white tracking-tight mb-2">
                Your Vault is Empty
            </h3>
            <p className="relative z-10 text-sm text-zinc-400 max-w-lg mb-8 leading-relaxed">
                You haven&apos;t purchased any virtual numbers yet. Get instant access to 180+ countries with non-VoIP SMS verification for Telegram, WhatsApp, OpenAI, and more.
            </p>

            <Link href="/dashboard/buy" className="relative z-10">
                <Button className="h-12 px-8 rounded-2xl bg-[hsl(var(--neon-lime))] hover:bg-[hsl(var(--neon-lime-soft))] text-black font-extrabold text-sm tracking-wide shadow-lg shadow-[hsl(var(--neon-lime))/0.25] transition-all hover:scale-105 active:scale-95 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 stroke-[2.5]" />
                    Get Virtual Number Now
                </Button>
            </Link>
        </motion.div>
    )
}
