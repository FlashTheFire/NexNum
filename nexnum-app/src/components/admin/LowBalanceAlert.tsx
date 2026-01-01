"use client"

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, TrendingDown, ArrowRight, X } from 'lucide-react'
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
            // 1. Trigger background sync (optional, or rely on scheduled job)
            await fetch('/api/admin/providers/balance-check', { method: 'POST' })

            // 2. Get alerts
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
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-red-500/10 border-b border-red-500/20 backdrop-blur-sm"
            >
                <div className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 animate-pulse">
                            <AlertTriangle size={16} className="text-red-500" />
                        </div>
                        <div className="space-y-0.5">
                            <h4 className="text-sm font-bold text-red-400">Low Balance Warning</h4>
                            <p className="text-xs text-red-200/60">
                                {alerts.length} provider{alerts.length > 1 ? 's are' : ' is'} running low on funds. Service interruptions may occur.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="flex -space-x-2 overflow-hidden py-1">
                            {alerts.map((alert) => (
                                <div key={alert.id} className="relative group cursor-help">
                                    <div className="h-8 px-3 flex items-center gap-1.5 bg-black/40 border border-red-500/30 rounded-full hover:bg-black/60 transition-colors">
                                        <span className="text-[10px] font-bold text-white max-w-[60px] truncate">{alert.name}</span>
                                        <div className="h-3 w-[1px] bg-white/10" />
                                        <span className="text-[10px] font-mono text-red-400 group-hover:text-red-300">
                                            {(alert.balance ?? 0).toFixed(2)} <span className="text-[8px] opacity-50">{alert.currency}</span>
                                        </span>
                                    </div>
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-black border border-white/10 rounded text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                        Threshold: {alert.threshold} {alert.currency}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center gap-2 ml-auto">
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                onClick={() => router.push('/admin/providers')}
                            >
                                Manage Providers
                                <ArrowRight size={12} className="ml-2 opacity-50" />
                            </Button>
                            <button
                                onClick={() => setIsVisible(false)}
                                className="p-1 hover:bg-white/5 rounded-full text-white/40 hover:text-white transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
