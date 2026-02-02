"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
    CreditCard, Shield, RefreshCw, Settings2, CheckCircle2, AlertCircle,
    Save, Info, Clock, Zap, Globe, Wallet, TrendingUp, Activity,
    AlertTriangle, TestTube2, Eye, EyeOff
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { PremiumSkeleton } from "@/components/ui/skeleton"

// ============================================================================
// Types
// ============================================================================

interface PaymentConfig {
    paymentsEnabled: boolean
    upiProviderMode: 'THIRD_PARTY' | 'DIRECT_PAYTM' | 'DISABLED'

    // 3rd Party
    upiApiToken: string | null
    upiApiTokenSet: boolean
    upiCreateOrderUrl: string | null
    upiCheckStatusUrl: string | null
    upiQrBaseUrl: string | null

    // Direct Paytm
    paytmMerchantId: string | null
    paytmMerchantKey: string | null
    paytmMerchantKeySet: boolean
    paytmWebsite: string | null
    paytmIndustryType: string | null
    paytmChannelId: string | null
    paytmCallbackUrl: string | null
    paytmEnvironment: 'STAGING' | 'PRODUCTION'

    // Limits
    depositMinAmount: number
    depositMaxAmount: number
    depositTimeoutMins: number
    maxPendingDeposits: number
    depositBonusPercent: number
}

interface PaymentStatus {
    isOperational: boolean
    mode: 'THIRD_PARTY' | 'DIRECT_PAYTM' | 'DISABLED'
}

// ============================================================================
// Component
// ============================================================================

export default function PaymentSettingsPage() {
    const [config, setConfig] = useState<PaymentConfig | null>(null)
    const [status, setStatus] = useState<PaymentStatus | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isTesting, setIsTesting] = useState(false)
    const [csrfToken, setCsrfToken] = useState<string>('')
    const [showThirdPartyToken, setShowThirdPartyToken] = useState(false)
    const [showPaytmKey, setShowPaytmKey] = useState(false)

    // Local edit state for sensitive fields
    const [newThirdPartyToken, setNewThirdPartyToken] = useState('')
    const [newPaytmKey, setNewPaytmKey] = useState('')

    const fetchCsrf = async () => {
        try {
            const res = await fetch('/api/csrf')
            const data = await res.json()
            if (data.success) {
                setCsrfToken(data.token)
            }
        } catch (e) {
            console.error("Failed to init CSRF")
        }
    }

    const fetchData = async () => {
        try {
            const res = await fetch('/api/admin/finance/payments')
            const data = await res.json()
            if (data.success) {
                setConfig(data.data.config)
                setStatus(data.data.status)
            } else {
                toast.error(data.error || "Failed to load payment settings")
            }
        } catch (e) {
            toast.error("Failed to load payment settings")
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
        fetchCsrf()
    }, [])

    const updateConfig = async (updates: Partial<PaymentConfig>) => {
        setIsSaving(true)
        try {
            const res = await fetch('/api/admin/finance/payments', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': csrfToken
                },
                body: JSON.stringify(updates)
            })
            const data = await res.json()
            if (data.success) {
                toast.success("Settings updated")
                setConfig(data.data.config)
                setStatus(data.data.status)
                // Clear sensitive field inputs
                setNewThirdPartyToken('')
                setNewPaytmKey('')
            } else {
                toast.error(data.error || "Update failed")
            }
        } catch (e) {
            toast.error("Network error")
        } finally {
            setIsSaving(false)
        }
    }

    const testConnection = async (provider: 'THIRD_PARTY' | 'DIRECT_PAYTM') => {
        setIsTesting(true)
        try {
            const res = await fetch('/api/admin/finance/payments', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-csrf-token': csrfToken
                },
                body: JSON.stringify({ provider })
            })
            const data = await res.json()
            if (data.success && data.data.success) {
                toast.success(data.data.message)
            } else {
                toast.error(data.data?.message || data.error || "Connection test failed")
            }
        } catch (e) {
            toast.error("Connection test failed")
        } finally {
            setIsTesting(false)
        }
    }

    if (isLoading) {
        return (
            <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
                <PremiumSkeleton className="h-12 w-64 bg-white/5" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <PremiumSkeleton className="h-32 bg-white/5" />
                    <PremiumSkeleton className="h-32 bg-white/5" />
                    <PremiumSkeleton className="h-32 bg-white/5" />
                    <PremiumSkeleton className="h-32 bg-white/5" />
                </div>
                <PremiumSkeleton className="h-96 bg-white/5" />
            </div>
        )
    }

    if (!config) {
        return (
            <div className="p-6 md:p-10 max-w-7xl mx-auto">
                <div className="p-8 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-white mb-2">Configuration Error</h2>
                    <p className="text-white/60">Failed to load payment settings. Please try again.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-32">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-[hsl(var(--neon-lime))]/10">
                            <CreditCard className="w-5 h-5 text-[hsl(var(--neon-lime))]" />
                        </div>
                        <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">Payment Gateway</h1>
                    </div>
                    <p className="text-white/40 text-sm max-w-md">
                        Configure UPI payment providers, transaction limits, and deposit bonuses.
                    </p>
                </motion.div>

                <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${status?.isOperational ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                        {status?.isOperational ? (
                            <>
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                <span className="text-sm font-medium text-emerald-400">Operational</span>
                            </>
                        ) : (
                            <>
                                <AlertCircle className="w-4 h-4 text-red-400" />
                                <span className="text-sm font-medium text-red-400">Not Configured</span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Top Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Payment Status */}
                <GlassCard className="p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                            <Zap className="w-5 h-5" />
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-blue-500/50">Status</div>
                    </div>
                    <h3 className="text-sm font-medium text-white/60 mb-1">Payments</h3>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${config.paymentsEnabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-red-500'}`} />
                        <span className="text-lg font-bold text-white">{config.paymentsEnabled ? 'Enabled' : 'Disabled'}</span>
                    </div>
                </GlassCard>

                {/* Provider Mode */}
                <GlassCard className="p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                            <Globe className="w-5 h-5" />
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-purple-500/50">Provider</div>
                    </div>
                    <h3 className="text-sm font-medium text-white/60 mb-1">UPI Mode</h3>
                    <span className="text-lg font-bold text-white">
                        {config.upiProviderMode === 'THIRD_PARTY' ? '3rd Party' :
                            config.upiProviderMode === 'DIRECT_PAYTM' ? 'Direct Paytm' : 'Disabled'}
                    </span>
                </GlassCard>

                {/* Deposit Limits */}
                <GlassCard className="p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                            <Wallet className="w-5 h-5" />
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500/50">Limits</div>
                    </div>
                    <h3 className="text-sm font-medium text-white/60 mb-1">Deposit Range</h3>
                    <span className="text-lg font-bold text-white font-mono">
                        ₹{config.depositMinAmount} - ₹{config.depositMaxAmount}
                    </span>
                </GlassCard>

                {/* Bonus */}
                <GlassCard className="p-6">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-lg bg-green-500/10 text-green-400">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-green-500/50">Bonus</div>
                    </div>
                    <h3 className="text-sm font-medium text-white/60 mb-1">Deposit Bonus</h3>
                    <span className="text-lg font-bold text-white font-mono">{config.depositBonusPercent}%</span>
                </GlassCard>
            </div>

            {/* Main Configuration Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: General Settings */}
                <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                        <Settings2 className="w-4 h-4 text-white/40" />
                        <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">General Config</h2>
                    </div>

                    <GlassCard className="p-5 space-y-6">
                        {/* Enable/Disable Payments */}
                        <div>
                            <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Payment Master Switch</label>
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={`flex-1 h-10 ${config.paymentsEnabled ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400' : 'bg-white/5 border border-white/10 text-white/40'}`}
                                    onClick={() => updateConfig({ paymentsEnabled: true })}
                                    disabled={isSaving}
                                >
                                    <CheckCircle2 className="w-4 h-4 mr-2" />
                                    Enabled
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={`flex-1 h-10 ${!config.paymentsEnabled ? 'bg-red-500/20 border border-red-500/30 text-red-400' : 'bg-white/5 border border-white/10 text-white/40'}`}
                                    onClick={() => updateConfig({ paymentsEnabled: false })}
                                    disabled={isSaving}
                                >
                                    <AlertCircle className="w-4 h-4 mr-2" />
                                    Disabled
                                </Button>
                            </div>
                        </div>

                        {/* Provider Mode */}
                        <div>
                            <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">UPI Provider Mode</label>
                            <div className="space-y-2">
                                {['THIRD_PARTY', 'DIRECT_PAYTM', 'DISABLED'].map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => updateConfig({ upiProviderMode: mode as any })}
                                        disabled={isSaving}
                                        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${config.upiProviderMode === mode
                                            ? 'bg-[hsl(var(--neon-lime))]/10 border-[hsl(var(--neon-lime))]/30 text-white'
                                            : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                                            }`}
                                    >
                                        <span className="text-sm font-medium">
                                            {mode === 'THIRD_PARTY' ? '3rd Party Gateway' :
                                                mode === 'DIRECT_PAYTM' ? 'Direct Paytm' : 'Disabled'}
                                        </span>
                                        {config.upiProviderMode === mode && (
                                            <CheckCircle2 className="w-4 h-4 text-[hsl(var(--neon-lime))]" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Transaction Limits */}
                        <div className="pt-4 border-t border-white/5 space-y-4">
                            <h4 className="text-[10px] text-white/40 uppercase font-bold">Transaction Limits</h4>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] text-white/30 block mb-1">Min Deposit (₹)</label>
                                    <Input
                                        type="number"
                                        value={config.depositMinAmount}
                                        onChange={(e) => setConfig(c => c ? { ...c, depositMinAmount: Number(e.target.value) } : c)}
                                        className="bg-white/5 border-white/10 text-sm h-9 font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-white/30 block mb-1">Max Deposit (₹)</label>
                                    <Input
                                        type="number"
                                        value={config.depositMaxAmount}
                                        onChange={(e) => setConfig(c => c ? { ...c, depositMaxAmount: Number(e.target.value) } : c)}
                                        className="bg-white/5 border-white/10 text-sm h-9 font-mono"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] text-white/30 block mb-1">Timeout (mins)</label>
                                    <Input
                                        type="number"
                                        value={config.depositTimeoutMins}
                                        onChange={(e) => setConfig(c => c ? { ...c, depositTimeoutMins: Number(e.target.value) } : c)}
                                        className="bg-white/5 border-white/10 text-sm h-9 font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-white/30 block mb-1">Max Pending</label>
                                    <Input
                                        type="number"
                                        value={config.maxPendingDeposits}
                                        onChange={(e) => setConfig(c => c ? { ...c, maxPendingDeposits: Number(e.target.value) } : c)}
                                        className="bg-white/5 border-white/10 text-sm h-9 font-mono"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] text-white/30 block mb-1">Deposit Bonus (%)</label>
                                <Input
                                    type="number"
                                    value={config.depositBonusPercent}
                                    onChange={(e) => setConfig(c => c ? { ...c, depositBonusPercent: Number(e.target.value) } : c)}
                                    className="bg-white/5 border-white/10 text-sm h-9 font-mono"
                                    min={0}
                                    max={100}
                                />
                                <span className="text-[9px] text-white/20 mt-1 block">Extra % credited on deposits</span>
                            </div>
                        </div>

                        <Button
                            className="w-full bg-[hsl(var(--neon-lime))] hover:bg-[hsl(var(--neon-lime))]/90 text-black font-bold h-10"
                            onClick={() => updateConfig({
                                depositMinAmount: config.depositMinAmount,
                                depositMaxAmount: config.depositMaxAmount,
                                depositTimeoutMins: config.depositTimeoutMins,
                                maxPendingDeposits: config.maxPendingDeposits,
                                depositBonusPercent: config.depositBonusPercent,
                            })}
                            disabled={isSaving}
                        >
                            <Save className="w-4 h-4 mr-2" />
                            Save Limits
                        </Button>
                    </GlassCard>
                </div>

                {/* Middle Column: 3rd Party Config */}
                <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                        <Globe className="w-4 h-4 text-white/40" />
                        <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">3rd Party Gateway</h2>
                    </div>

                    <GlassCard className={`p-5 space-y-6 ${config.upiProviderMode !== 'THIRD_PARTY' ? 'opacity-50' : ''}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${config.upiApiTokenSet ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                <span className="text-sm text-white/60">
                                    {config.upiApiTokenSet ? 'Token Configured' : 'Token Not Set'}
                                </span>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={() => testConnection('THIRD_PARTY')}
                                disabled={isTesting || config.upiProviderMode !== 'THIRD_PARTY'}
                            >
                                <TestTube2 className="w-3 h-3 mr-1" />
                                Test
                            </Button>
                        </div>

                        {/* API Token */}
                        <div>
                            <label className="text-[10px] text-white/40 uppercase font-bold block mb-1">API Token</label>
                            <div className="relative">
                                <Input
                                    type={showThirdPartyToken ? 'text' : 'password'}
                                    value={newThirdPartyToken || (config.upiApiToken || '')}
                                    onChange={(e) => setNewThirdPartyToken(e.target.value)}
                                    placeholder="Enter new token to update"
                                    className="bg-white/5 border-white/10 text-sm h-9 pr-10"
                                />
                                <button
                                    onClick={() => setShowThirdPartyToken(!showThirdPartyToken)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                                >
                                    {showThirdPartyToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* URLs */}
                        <div>
                            <label className="text-[10px] text-white/40 uppercase font-bold block mb-1">Create Order URL</label>
                            <Input
                                value={config.upiCreateOrderUrl || ''}
                                onChange={(e) => setConfig(c => c ? { ...c, upiCreateOrderUrl: e.target.value } : c)}
                                placeholder="https://pay.example.com/api/create-order"
                                className="bg-white/5 border-white/10 text-sm h-9"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] text-white/40 uppercase font-bold block mb-1">Check Status URL</label>
                            <Input
                                value={config.upiCheckStatusUrl || ''}
                                onChange={(e) => setConfig(c => c ? { ...c, upiCheckStatusUrl: e.target.value } : c)}
                                placeholder="https://pay.example.com/api/check-status"
                                className="bg-white/5 border-white/10 text-sm h-9"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] text-white/40 uppercase font-bold block mb-1">QR Base URL</label>
                            <Input
                                value={config.upiQrBaseUrl || ''}
                                onChange={(e) => setConfig(c => c ? { ...c, upiQrBaseUrl: e.target.value } : c)}
                                placeholder="https://qr.example.com/"
                                className="bg-white/5 border-white/10 text-sm h-9"
                            />
                        </div>

                        <Button
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10"
                            onClick={() => updateConfig({
                                upiApiToken: newThirdPartyToken || undefined,
                                upiCreateOrderUrl: config.upiCreateOrderUrl,
                                upiCheckStatusUrl: config.upiCheckStatusUrl,
                                upiQrBaseUrl: config.upiQrBaseUrl,
                            })}
                            disabled={isSaving}
                        >
                            <Save className="w-4 h-4 mr-2" />
                            Save 3rd Party Config
                        </Button>
                    </GlassCard>
                </div>

                {/* Right Column: Direct Paytm Config */}
                <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-4 h-4 text-white/40" />
                        <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">Direct Paytm</h2>
                    </div>

                    <GlassCard className={`p-5 space-y-6 ${config.upiProviderMode !== 'DIRECT_PAYTM' ? 'opacity-50' : ''}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${config.paytmMerchantKeySet ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                <span className="text-sm text-white/60">
                                    {config.paytmMerchantId ? `MID: ${config.paytmMerchantId}` : 'Not Configured'}
                                </span>
                            </div>
                            <span className={`px-2 py-1 rounded text-[9px] font-bold ${config.paytmEnvironment === 'PRODUCTION' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                {config.paytmEnvironment}
                            </span>
                        </div>

                        {/* Environment Toggle */}
                        <div>
                            <label className="text-[10px] text-white/40 uppercase font-bold block mb-2">Environment</label>
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={`flex-1 h-9 text-xs ${config.paytmEnvironment === 'STAGING' ? 'bg-amber-500/20 border border-amber-500/30 text-amber-400' : 'bg-white/5 border border-white/10 text-white/40'}`}
                                    onClick={() => updateConfig({ paytmEnvironment: 'STAGING' })}
                                    disabled={isSaving}
                                >
                                    Staging
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className={`flex-1 h-9 text-xs ${config.paytmEnvironment === 'PRODUCTION' ? 'bg-red-500/20 border border-red-500/30 text-red-400' : 'bg-white/5 border border-white/10 text-white/40'}`}
                                    onClick={() => updateConfig({ paytmEnvironment: 'PRODUCTION' })}
                                    disabled={isSaving}
                                >
                                    Production
                                </Button>
                            </div>
                        </div>

                        {/* Merchant ID */}
                        <div>
                            <label className="text-[10px] text-white/40 uppercase font-bold block mb-1">Merchant ID (MID)</label>
                            <Input
                                value={config.paytmMerchantId || ''}
                                onChange={(e) => setConfig(c => c ? { ...c, paytmMerchantId: e.target.value } : c)}
                                placeholder="XXXXXXXXXXXXXXXX"
                                className="bg-white/5 border-white/10 text-sm h-9 font-mono"
                            />
                        </div>

                        {/* Merchant Key */}
                        <div>
                            <label className="text-[10px] text-white/40 uppercase font-bold block mb-1">Merchant Key</label>
                            <div className="relative">
                                <Input
                                    type={showPaytmKey ? 'text' : 'password'}
                                    value={newPaytmKey || (config.paytmMerchantKey || '')}
                                    onChange={(e) => setNewPaytmKey(e.target.value)}
                                    placeholder="Enter new key to update"
                                    className="bg-white/5 border-white/10 text-sm h-9 pr-10 font-mono"
                                />
                                <button
                                    onClick={() => setShowPaytmKey(!showPaytmKey)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                                >
                                    {showPaytmKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        {/* Website & Industry */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-[10px] text-white/30 block mb-1">Website</label>
                                <Input
                                    value={config.paytmWebsite || ''}
                                    onChange={(e) => setConfig(c => c ? { ...c, paytmWebsite: e.target.value } : c)}
                                    placeholder="DEFAULT"
                                    className="bg-white/5 border-white/10 text-sm h-9"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-white/30 block mb-1">Industry Type</label>
                                <Input
                                    value={config.paytmIndustryType || ''}
                                    onChange={(e) => setConfig(c => c ? { ...c, paytmIndustryType: e.target.value } : c)}
                                    placeholder="Retail"
                                    className="bg-white/5 border-white/10 text-sm h-9"
                                />
                            </div>
                        </div>

                        {/* Callback URL */}
                        <div>
                            <label className="text-[10px] text-white/40 uppercase font-bold block mb-1">Callback URL</label>
                            <Input
                                value={config.paytmCallbackUrl || ''}
                                onChange={(e) => setConfig(c => c ? { ...c, paytmCallbackUrl: e.target.value } : c)}
                                placeholder="https://yoursite.com/api/wallet/deposit/callback"
                                className="bg-white/5 border-white/10 text-sm h-9"
                            />
                        </div>

                        <Button
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold h-10"
                            onClick={() => updateConfig({
                                paytmMerchantId: config.paytmMerchantId,
                                paytmMerchantKey: newPaytmKey || undefined,
                                paytmWebsite: config.paytmWebsite,
                                paytmIndustryType: config.paytmIndustryType,
                                paytmCallbackUrl: config.paytmCallbackUrl,
                            })}
                            disabled={isSaving}
                        >
                            <Save className="w-4 h-4 mr-2" />
                            Save Paytm Config
                        </Button>
                    </GlassCard>

                    {/* Warning Box */}
                    <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10">
                        <div className="flex gap-3">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                            <p className="text-[10px] text-amber-300/60 leading-relaxed">
                                <strong>Important:</strong> Direct Paytm integration requires a verified merchant account.
                                Use Staging environment for testing before enabling Production mode.
                            </p>
                        </div>
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
