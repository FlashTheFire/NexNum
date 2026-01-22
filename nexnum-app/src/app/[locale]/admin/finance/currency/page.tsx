
"use client"

import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    RefreshCw, DollarSign, Coins, TrendingUp, Settings2,
    CheckCircle2, AlertCircle, Save, Globe, Info, Clock,
    ChevronRight, ArrowUpRight, ArrowDownRight, Edit3
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { formatDistanceToNow } from "date-fns"
import { PremiumSkeleton } from "@/components/ui/skeleton"

interface Currency {
    code: string
    name: string
    symbol: string
    rate: number
    updatedAt: string
    isActive: boolean
    autoUpdate: boolean
}

interface SystemSettings {
    baseCurrency: string
    displayCurrency: string
    pointsEnabled: boolean
    pointsName: string
    pointsRate: number
}

export default function CurrencyManagementPage() {
    const [currencies, setCurrencies] = useState<Currency[]>([])
    const [settings, setSettings] = useState<SystemSettings | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSyncing, setIsSyncing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    const fetchData = async () => {
        try {
            const res = await fetch('/api/admin/finance/currency')
            const data = await res.json()
            setCurrencies(data.currencies)
            setSettings(data.settings)
        } catch (e) {
            toast.error("Failed to load currency data")
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            const res = await fetch('/api/admin/finance/currency/sync', { method: 'POST' })
            if (res.ok) {
                toast.success("Exchange rates synchronized")
                fetchData()
            } else {
                toast.error("Sync failed")
            }
        } catch (e) {
            toast.error("Network error during sync")
        } finally {
            setIsSyncing(false)
        }
    }

    const updateSettings = async (newData: Partial<SystemSettings>) => {
        if (!settings) return
        setIsSaving(true)
        try {
            const res = await fetch('/api/admin/finance/currency', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update_settings', ...settings, ...newData })
            })
            if (res.ok) {
                toast.success("Settings updated")
                fetchData()
            } else {
                toast.error("Update failed")
            }
        } catch (e) {
            toast.error("Network error")
        } finally {
            setIsSaving(false)
        }
    }

    const updateCurrency = async (code: string, data: Partial<Currency>) => {
        setIsSaving(true)
        try {
            const res = await fetch('/api/admin/finance/currency', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update_currency', code, ...data })
            })
            if (res.ok) {
                toast.success(`${code} updated`)
                fetchData()
            }
        } catch (e) {
            toast.error("Failed to update currency")
        } finally {
            setIsSaving(false)
        }
    }

    if (isLoading) {
        return (
            <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
                <PremiumSkeleton className="h-12 w-64 bg-white/5" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <PremiumSkeleton className="h-32 bg-white/5" />
                    <PremiumSkeleton className="h-32 bg-white/5" />
                    <PremiumSkeleton className="h-32 bg-white/5" />
                </div>
                <PremiumSkeleton className="h-96 bg-white/5" />
            </div>
        )
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-32">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-[hsl(var(--neon-lime))]/10">
                            <RefreshCw className={`w-5 h-5 text-[hsl(var(--neon-lime))] ${isSyncing ? 'animate-spin' : ''}`} />
                        </div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Currency Engine</h1>
                    </div>
                    <p className="text-white/40 text-sm max-w-md">
                        Global exchange rate management and internal pricing normalization system.
                    </p>
                </motion.div>

                <div className="flex items-center gap-3">
                    <Button
                        onClick={handleSync}
                        disabled={isSyncing}
                        variant="outline"
                        className="bg-white/5 border-white/10 hover:bg-white/10 text-white h-11"
                    >
                        <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing...' : 'Sync Rates Now'}
                    </Button>
                </div>
            </div>

            {/* Top Stats / Quick Settings Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Base Anchor Card */}
                <GlassCard className="p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                            <Globe className="w-5 h-5" />
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-blue-500/50">Technical Anchor</div>
                    </div>
                    <h3 className="text-sm font-medium text-white/60 mb-1">Technical base currency</h3>
                    <div className="flex items-end gap-2">
                        <span className="text-2xl font-bold text-white">{settings?.baseCurrency}</span>
                        <span className="text-[10px] text-white/30 mb-1">Fixed Intermediary</span>
                    </div>
                    <p className="text-[10px] text-white/40 mt-3 leading-relaxed">
                        Internal technical anchor for all exchange rate calculations. Default is USD.
                    </p>
                </GlassCard>

                {/* Points Card */}
                <GlassCard className="p-6 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3">
                        <div className={`w-2 h-2 rounded-full ${settings?.pointsEnabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-white/20'}`} />
                    </div>

                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                            <Coins className="w-5 h-5" />
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500/50">Internal Economy</div>
                    </div>

                    <h3 className="text-sm font-medium text-white/60 mb-1">Active Point System</h3>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-white">{settings?.pointsName}</span>
                        <span className="text-xs text-amber-500 font-mono">1 USD = {settings?.pointsRate}</span>
                    </div>

                    <div className="mt-4 flex gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className={`h-7 px-3 text-[10px] rounded-full border transition-all ${settings?.pointsEnabled ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-white/5 border-white/10 text-white/40'}`}
                            onClick={() => updateSettings({ pointsEnabled: !settings?.pointsEnabled })}
                        >
                            {settings?.pointsEnabled ? 'ENABLED' : 'DISABLED'}
                        </Button>
                    </div>
                </GlassCard>

                {/* Automation Card */}
                <GlassCard className="p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                            <Clock className="w-5 h-5" />
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-purple-500/50">Auto-Update</div>
                    </div>
                    <h3 className="text-sm font-medium text-white/60 mb-1">Last Rate Refresh</h3>
                    <div className="text-xl font-bold text-white tracking-tight">
                        {currencies.length > 0 ? formatDistanceToNow(new Date(currencies[0].updatedAt)) : 'N/A'}
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 text-[10px] text-white/40">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        Automatic sync before provider indexing
                    </div>
                </GlassCard>
            </div>

            {/* Main Content: Tables & Settings */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Left: Settings Panel */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                        <Settings2 className="w-4 h-4 text-white/40" />
                        <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">Global Config</h2>
                    </div>

                    <GlassCard className="p-5 space-y-6">
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] text-white/40 uppercase font-bold block mb-1.5">Point System Name</label>
                                <Input
                                    value={settings?.pointsName || ''}
                                    onChange={(e) => setSettings(s => s ? { ...s, pointsName: e.target.value } : s)}
                                    className="bg-white/5 border-white/10 text-sm h-9"
                                    placeholder="e.g. Coins, Credits"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-white/40 uppercase font-bold block mb-1.5">Points Multiplier (per USD)</label>
                                <Input
                                    type="number"
                                    value={settings?.pointsRate || 0}
                                    onChange={(e) => setSettings(s => s ? { ...s, pointsRate: Number(e.target.value) } : s)}
                                    className="bg-white/5 border-white/10 text-sm h-9 font-mono"
                                />
                                <span className="text-[9px] text-white/20 mt-1 block italic">How many points equal 1.00 USD</span>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-white/5">
                            <Button
                                className="w-full bg-[hsl(var(--neon-lime))] hover:bg-[hsl(var(--neon-lime))]/90 text-black font-bold h-10"
                                onClick={() => updateSettings({})}
                                disabled={isSaving}
                            >
                                <Save className="w-4 h-4 mr-2" />
                                Save Settings
                            </Button>
                        </div>
                    </GlassCard>

                    <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
                        <div className="flex gap-3">
                            <Info className="w-4 h-4 text-blue-400 shrink-0" />
                            <p className="text-[10px] text-blue-300/60 leading-relaxed">
                                <strong>Tip:</strong> The displayed currency for users depends on their profile preference.
                                System settings define the default for new users.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right: Currencies Table */}
                <div className="lg:col-span-3 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-white/40" />
                            <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">Exchange Rates</h2>
                        </div>
                        <span className="text-[10px] text-white/30">{currencies.length} currencies tracked</span>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-white/5 bg-black/40">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-white/5 border-b border-white/5 text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                    <th className="px-6 py-4">Currency</th>
                                    <th className="px-6 py-4">Relative Rate</th>
                                    <th className="px-6 py-4 text-center">Status</th>
                                    <th className="px-6 py-4 text-center">Auto-Sync</th>
                                    <th className="px-6 py-4 text-right">Last Update</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {currencies.map((curr) => (
                                    <tr key={curr.code} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center font-bold text-white/60 text-xs">
                                                    {curr.symbol}
                                                </div>
                                                <div>
                                                    <div className="text-sm font-bold text-white">{curr.code}</div>
                                                    <div className="text-[10px] text-white/30">{curr.name}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-sm text-white/70">
                                            <div className="flex items-center gap-2">
                                                1 {settings?.baseCurrency} = {curr.rate} {curr.code}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => updateCurrency(curr.code, { isActive: !curr.isActive })}
                                                className={`px-2 py-1 rounded text-[9px] font-bold ${curr.isActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/5 text-white/30'}`}
                                            >
                                                {curr.isActive ? 'ACTIVE' : 'INACTIVE'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => updateCurrency(curr.code, { autoUpdate: !curr.autoUpdate })}
                                                className={`w-5 h-5 rounded-full border border-white/10 flex items-center justify-center mx-auto transition-colors ${curr.autoUpdate ? 'bg-[hsl(var(--neon-lime))]/20 text-[hsl(var(--neon-lime))] border-[hsl(var(--neon-lime))]/30' : 'text-white/20'}`}
                                            >
                                                <RefreshCw className="w-3 h-3" />
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="text-[10px] text-white/30">{formatDistanceToNow(new Date(curr.updatedAt))} ago</div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}

function GlassCard({ children, className = "" }: { children: React.ReactNode, className?: string }) {
    return (
        <div className={`bg-[#0A0A0A] border border-white/5 rounded-2xl relative overflow-hidden backdrop-blur-3xl ${className}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
            {children}
        </div>
    )
}
