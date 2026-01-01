"use client"

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Wallet, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

interface Alert {
    id: string
    name: string
    balance: number
    threshold: number
    currency: string
}

export function LowBalanceAlert() {
    const [alerts, setAlerts] = useState<Alert[]>([])
    const [isVisible, setIsVisible] = useState(true)
    const router = useRouter()

    useEffect(() => {
        checkBalance()
        // Poll every 5 minutes
        const interval = setInterval(checkBalance, 5 * 60 * 1000)
        return () => clearInterval(interval)
    }, [])

    const checkBalance = async () => {
        try {
            await fetch('/api/admin/providers/balance-check', { method: 'POST' })
            const res = await fetch('/api/admin/providers/balance-check')
            const data = await res.json()
            if (data.alerts && Array.isArray(data.alerts)) {
                setAlerts(data.alerts)
            }
        } catch (e) {
            console.error("Failed to check balances", e)
        }
    }

    if (!isVisible || alerts.length === 0) return null

    return (
        <AnimatePresence>
            <motion.div
                initial={{ height: 0, opacity: 0, y: -20 }}
                animate={{ height: 'auto', opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="relative z-50 group"
            >
                {/* Premium Glass Background */}
                <div className="absolute inset-0 bg-gradient-to-r from-red-950/90 via-red-900/60 to-black/90 backdrop-blur-xl border-b border-white/5" />

                {/* Animated Bottom Glow Line */}
                <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent opacity-50" />

                <div className="relative max-w-7xl mx-auto px-4 md:px-8 py-3.5 flex flex-col lg:flex-row items-center justify-between gap-4">

                    {/* Left: Icon & Text */}
                    <div className="flex items-center gap-4 w-full lg:w-auto">
                        <div className="relative">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center shrink-0 border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                                <Wallet className="w-5 h-5 text-red-400" />
                            </div>
                            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-bold text-black ring-2 ring-black animate-bounce">
                                !
                            </div>
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-400 to-orange-400">
                                    Critical Balance Alert
                                </h4>
                                <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20 uppercase tracking-wide">
                                    Action Required
                                </span>
                            </div>
                            <p className="text-xs text-white/50 truncate">
                                <span className="text-white/80 font-medium">{alerts.length} provider{alerts.length > 1 ? 's' : ''}</span> have fallen below credit thresholds.
                            </p>
                        </div>
                    </div>

                    {/* Middle: Provider Chips */}
                    <div className="flex items-center gap-3 w-full lg:w-auto overflow-hidden">
                        <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1 mask-linear-fade">
                            {alerts.map((alert) => (
                                <div
                                    key={alert.id}
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/10 transition-all group/chip cursor-default"
                                >
                                    <span className="text-[11px] font-semibold text-white/90">{alert.name}</span>
                                    <div className="h-3 w-px bg-white/10" />
                                    <span className="text-[11px] font-mono text-red-400 group-hover/chip:text-red-300 font-medium">
                                        {(alert.balance ?? 0).toFixed(2)}
                                        <span className="text-[9px] text-white/30 ml-0.5">{alert.currency}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-3 w-full lg:w-auto justify-end">
                        <Button
                            size="sm"
                            className="h-9 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20 hover:border-red-500/40 shadow-[0_0_20px_rgba(220,38,38,0.1)] hover:shadow-[0_0_25px_rgba(220,38,38,0.2)] transition-all"
                            onClick={() => router.push('/admin/providers')}
                        >
                            <span className="text-xs font-semibold mr-2">Manage Funds</span>
                            <ChevronRight className="w-3 h-3" />
                        </Button>

                        <button
                            onClick={() => setIsVisible(false)}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
