"use client"

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Wallet, ChevronRight, Clock, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

interface Alert {
    id: string
    name: string
    balance: number
    threshold: number
    currency: string
}

const SNOOZE_OPTIONS = [
    { label: '1 hour', hours: 1 },
    { label: '6 hours', hours: 6 },
    { label: '12 hours', hours: 12 },
    { label: '24 hours', hours: 24 },
]

const SNOOZE_STORAGE_KEY = 'nexnum_balance_alert_snoozed_until'
const LAST_CHECK_KEY = 'nexnum_balance_last_check'
const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

export function LowBalanceAlert() {
    const [alerts, setAlerts] = useState<Alert[]>([])
    const [isVisible, setIsVisible] = useState(true)
    const [showSnoozeMenu, setShowSnoozeMenu] = useState(false)
    const [isSnoozed, setIsSnoozed] = useState(false)
    const router = useRouter()
    const isCheckingRef = useRef(false)

    // Check if currently snoozed
    useEffect(() => {
        const snoozedUntil = localStorage.getItem(SNOOZE_STORAGE_KEY)
        if (snoozedUntil) {
            const until = new Date(snoozedUntil)
            if (until > new Date()) {
                setIsSnoozed(true)
                // Set timeout to un-snooze when time expires
                const timeout = setTimeout(() => {
                    setIsSnoozed(false)
                    localStorage.removeItem(SNOOZE_STORAGE_KEY)
                }, until.getTime() - Date.now())
                return () => clearTimeout(timeout)
            } else {
                localStorage.removeItem(SNOOZE_STORAGE_KEY)
            }
        }
    }, [])

    const checkBalance = useCallback(async () => {
        // Guard against duplicate calls (React Strict Mode, re-renders)
        if (isCheckingRef.current) return

        // Check if we've checked recently (guards across page navigations)
        const lastCheck = localStorage.getItem(LAST_CHECK_KEY)
        if (lastCheck) {
            const elapsed = Date.now() - parseInt(lastCheck, 10)
            if (elapsed < 60000) { // Don't check more than once per minute
                return
            }
        }

        isCheckingRef.current = true
        localStorage.setItem(LAST_CHECK_KEY, Date.now().toString())

        try {
            await fetch('/api/admin/providers/balance-check', { method: 'POST' })
            const res = await fetch('/api/admin/providers/balance-check')
            const data = await res.json()
            if (data.alerts && Array.isArray(data.alerts)) {
                setAlerts(data.alerts)
            }
        } catch (e) {
            console.error("Failed to check balances", e)
        } finally {
            isCheckingRef.current = false
        }
    }, [])

    useEffect(() => {
        if (isSnoozed) return
        checkBalance()
        // Poll every 1 hour (60 minutes)
        const interval = setInterval(checkBalance, CHECK_INTERVAL_MS)
        return () => clearInterval(interval)
    }, [isSnoozed, checkBalance])

    const handleSnooze = (hours: number) => {
        const until = new Date(Date.now() + hours * 60 * 60 * 1000)
        localStorage.setItem(SNOOZE_STORAGE_KEY, until.toISOString())
        setIsSnoozed(true)
        setShowSnoozeMenu(false)
        setIsVisible(false)
    }

    if (!isVisible || alerts.length === 0 || isSnoozed) return null

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

                <div className="relative max-w-7xl mx-auto px-3 md:px-8 py-2 md:py-3">
                    {/* Mobile Layout - Single compact row */}
                    <div className="flex items-center gap-2 md:gap-4">
                        {/* Icon */}
                        <div className="relative shrink-0">
                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 flex items-center justify-center border border-red-500/20">
                                <Wallet className="w-4 h-4 md:w-5 md:h-5 text-red-400" />
                            </div>
                            <div className="absolute -top-0.5 -right-0.5 w-3 h-3 md:w-4 md:h-4 rounded-full bg-red-500 flex items-center justify-center text-[8px] md:text-[10px] font-bold text-black ring-1 ring-black animate-bounce">
                                !
                            </div>
                        </div>

                        {/* Text - compressed on mobile */}
                        <div className="flex-1 min-w-0">
                            <h4 className="text-xs md:text-sm font-bold text-red-400 truncate">
                                Critical Balance Alert
                            </h4>
                            <p className="text-[10px] md:text-xs text-white/50 truncate">
                                <span className="text-white/80 font-medium">{alerts.length} provider{alerts.length > 1 ? 's' : ''}</span> have fallen below credit thresholds.
                            </p>
                        </div>

                        {/* Provider Chips - horizontal scroll on mobile */}
                        <div className="hidden sm:flex items-center gap-2 overflow-x-auto scrollbar-hide max-w-xs lg:max-w-md py-1">
                            {alerts.slice(0, 3).map((alert) => (
                                <div
                                    key={alert.id}
                                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/40 border border-red-500/20 shrink-0"
                                >
                                    <span className="text-[10px] font-semibold text-white/90">{alert.name}</span>
                                    <span className="text-[10px] font-mono text-red-400 font-medium">
                                        {(alert.balance ?? 0).toFixed(2)}
                                        <span className="text-[8px] text-white/30 ml-0.5">{alert.currency}</span>
                                    </span>
                                </div>
                            ))}
                            {alerts.length > 3 && (
                                <span className="text-[10px] text-white/40 shrink-0">+{alerts.length - 3}</span>
                            )}
                        </div>

                        {/* Actions - compact */}
                        <div className="flex items-center gap-1 md:gap-2 shrink-0">
                            <Button
                                size="sm"
                                className="h-7 md:h-9 px-2 md:px-3 bg-red-600/10 hover:bg-red-600/20 text-red-400 border border-red-500/20"
                                onClick={() => router.push('/admin/providers')}
                            >
                                <span className="text-[10px] md:text-xs font-semibold">Manage Funds</span>
                                <ChevronRight className="w-3 h-3 ml-1 hidden md:inline" />
                            </Button>

                            {/* Snooze Dropdown */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
                                    className="h-7 md:h-9 px-2 rounded-md flex items-center gap-1 text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                                >
                                    <Clock className="w-3 h-3 md:w-3.5 md:h-3.5" />
                                    <ChevronDown className={`w-3 h-3 transition-transform ${showSnoozeMenu ? 'rotate-180' : ''}`} />
                                </button>

                                <AnimatePresence>
                                    {showSnoozeMenu && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: -5, scale: 0.95 }}
                                            className="absolute right-0 top-full mt-2 w-36 bg-zinc-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50"
                                        >
                                            <div className="p-1.5">
                                                <div className="px-2 py-1.5 text-[10px] text-white/40 font-medium uppercase tracking-wider">
                                                    Hide for...
                                                </div>
                                                {SNOOZE_OPTIONS.map((option) => (
                                                    <button
                                                        key={option.hours}
                                                        onClick={() => handleSnooze(option.hours)}
                                                        className="w-full px-3 py-2 text-left text-xs text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors flex items-center gap-2"
                                                    >
                                                        <Clock className="w-3 h-3 text-white/30" />
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <button
                                onClick={() => setIsVisible(false)}
                                className="w-6 h-6 md:w-8 md:h-8 rounded-full flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-colors"
                                title="Dismiss"
                            >
                                <X className="w-3 h-3 md:w-4 md:h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Click outside to close snooze menu */}
                {showSnoozeMenu && (
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowSnoozeMenu(false)}
                    />
                )}
            </motion.div>
        </AnimatePresence>
    )
}
