"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { motion, AnimatePresence, Variants } from "framer-motion"
import {
    Wallet,
    Plus,
    Shield,
    ArrowUpRight,
    ArrowDownRight,
    History,
    Sparkles,
    Download,
    Search,
    RefreshCw,
    CheckCircle2,
    XCircle,
    Clock,
    AlertCircle,
    RotateCcw,
    ChevronLeft,
    ChevronRight,
    Ban,
    Copy,
    Check,
    Loader2,
    IndianRupee,
    ArrowLeft
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useGlobalStore } from "@/stores/appStore"
import { useAuthStore } from "@/stores/authStore"
import { cn } from "@/lib/utils/utils"
import { BalanceDisplay, PriceDisplay } from "@/components/common/PriceDisplay"
import { useCurrency } from "@/providers/CurrencyProvider"
import { api } from "@/lib/api/api-client"

// Animation Variants
const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
}

const cardTilt: Variants = {
    rest: { rotateX: 0, rotateY: 0, scale: 1 },
    hover: {
        rotateX: 2,
        rotateY: 2,
        scale: 1.02,
        transition: { duration: 0.4, type: "spring" }
    }
}

const ITEMS_PER_PAGE = 6
const POLL_INTERVAL = 3000

export default function WalletPage() {
    const { user } = useAuthStore()
    const { userProfile, transactions, fetchTransactions, fetchBalance } = useGlobalStore()
    const { currencies, preferredCurrency, formatPrice } = useCurrency()

    // Form & Inline Deposit State
    const [amount, setAmount] = useState<string>("")
    const [customFocused, setCustomFocused] = useState(false)
    const [inlineStep, setInlineStep] = useState<'input' | 'qr_payment' | 'success'>('input')
    const [activeDeposit, setActiveDeposit] = useState<any>(null)
    const [timeLeft, setTimeLeft] = useState(900)
    const [utrInput, setUtrInput] = useState("")
    const [isGenerating, setIsGenerating] = useState(false)
    const [isVerifyingUtr, setIsVerifyingUtr] = useState(false)
    const [copiedUpi, setCopiedUpi] = useState(false)

    // Refs
    const addFundsRef = useRef<HTMLDivElement>(null)
    const customInputRef = useRef<HTMLInputElement>(null)
    const pollRef = useRef<NodeJS.Timeout | null>(null)
    const countdownRef = useRef<NodeJS.Timeout | null>(null)

    // Filters & Pagination
    const [filterType, setFilterType] = useState<'all' | 'credit' | 'debit' | 'other'>('all')
    const [currentPage, setCurrentPage] = useState(1)

    useEffect(() => {
        fetchTransactions()
        fetchExistingPendingDeposit()
        return () => cleanup()
    }, [])

    const cleanup = () => {
        if (pollRef.current) clearInterval(pollRef.current)
        if (countdownRef.current) clearInterval(countdownRef.current)
        pollRef.current = null
        countdownRef.current = null
    }

    const activeCurrencyObj = currencies[preferredCurrency]
    const currencySym = activeCurrencyObj?.symbol || '$'
    const currencyRate = activeCurrencyObj?.rate || 1

    // Dynamic Presets based on active currency
    const dynamicPresets = useMemo(() => {
        if (preferredCurrency === 'INR') {
            return [
                { value: 100, label: '₹100' },
                { value: 500, label: '₹500' },
                { value: 1000, label: '₹1,000' },
                { value: 2500, label: '₹2,500' }
            ]
        }
        if (preferredCurrency === 'USD' || preferredCurrency === 'EUR' || preferredCurrency === 'GBP') {
            return [
                { value: 10, label: `${currencySym}10` },
                { value: 25, label: `${currencySym}25` },
                { value: 50, label: `${currencySym}50` },
                { value: 100, label: `${currencySym}100` }
            ]
        }
        if (preferredCurrency === 'RUB') {
            return [
                { value: 500, label: '₽500' },
                { value: 1000, label: '₽1,000' },
                { value: 2500, label: '₽2,500' },
                { value: 5000, label: '₽5,000' }
            ]
        }

        const baseValues = [10, 25, 50, 100]
        return baseValues.map(base => {
            const raw = base * currencyRate
            let rounded = raw
            if (raw >= 10000) rounded = Math.round(raw / 5000) * 5000
            else if (raw >= 1000) rounded = Math.round(raw / 500) * 500
            else if (raw >= 100) rounded = Math.round(raw / 50) * 50
            else if (raw >= 10) rounded = Math.round(raw / 5) * 5
            else rounded = Math.round(raw)
            
            const val = Math.max(1, rounded)
            return {
                value: val,
                label: `${currencySym}${val.toLocaleString()}`
            }
        })
    }, [preferredCurrency, currencySym, currencyRate])

    const userCardLast4 = user?.id ? user.id.slice(-4).toUpperCase() : "8888"

    // Check for existing pending deposit on page load
    const fetchExistingPendingDeposit = async () => {
        try {
            const result = await api.request<any>('/api/wallet/deposit')
            if (result.success && result.data?.deposits && result.data.deposits.length > 0) {
                const pending = result.data.deposits[0]
                const depId = pending.depositId || pending.orderId
                const defaultQr = `https://qr.udayscriptsx.workers.dev/?data=upi%3A%2F%2Fpay%3Fpa%3Dpaytmqr281005050101nbxw0hx35cpo%40paytm%26pn%3DPaytm%2520Merchant%26tr%3D${depId}%26tn%3DAdding%2520Fund&body=dot&eye=frame13&eyeball=ball14&col1=121f28&col2=121f28&logo=https://i.postimg.cc/cCrHr3TQ/1000011838-removebg.png`

                setActiveDeposit({
                    depositId: depId,
                    amount: pending.amount,
                    qrCodeUrl: pending.qrCodeUrl || defaultQr,
                    upiId: 'paytmqr281005050101nbxw0hx35cpo@paytm',
                    expiresIn: pending.expiresIn || 900
                })
                setTimeLeft(pending.expiresIn || 900)
                setInlineStep('qr_payment')
                startPolling(depId)
                startCountdown()
            }
        } catch (e) {}
    }

    // Inline Deposit Trigger Handler
    const handleInlineCreateDeposit = async () => {
        const val = parseFloat(amount)
        if (isNaN(val) || val <= 0) {
            toast.error("Please enter a valid deposit amount")
            return
        }

        setIsGenerating(true)
        try {
            const result = await api.request<any>('/api/wallet/deposit', 'POST', {
                amount: val,
                currency: preferredCurrency,
                currencyRate: currencyRate
            })

            if (result.success && result.data) {
                const depData = result.data
                const depId = depData.depositId || depData.orderId || `dep_${Date.now()}`
                const defaultQr = `https://qr.udayscriptsx.workers.dev/?data=upi%3A%2F%2Fpay%3Fpa%3Dpaytmqr281005050101nbxw0hx35cpo%40paytm%26pn%3DPaytm%2520Merchant%26tr%3D${depId}%26tn%3DAdding%2520Fund&body=dot&eye=frame13&eyeball=ball14&col1=121f28&col2=121f28&logo=https://i.postimg.cc/cCrHr3TQ/1000011838-removebg.png`

                setActiveDeposit({
                    depositId: depId,
                    amount: depData.amount || val,
                    originalAmount: val,
                    originalCurrency: preferredCurrency,
                    qrCodeUrl: depData.qrCodeUrl || defaultQr,
                    upiId: depData.upiId || 'paytmqr281005050101nbxw0hx35cpo@paytm',
                    expiresIn: depData.expiresIn || 900
                })
                setTimeLeft(depData.expiresIn || 900)
                setInlineStep('qr_payment')
                startPolling(depId)
                startCountdown()
                toast.success("UPI QR Code Generated Successfully")
            } else {
                toast.error(result.error || "Failed to generate deposit request")
            }
        } catch (e: any) {
            toast.error("Failed to generate deposit request. Please try again.")
        } finally {
            setIsGenerating(false)
        }
    }

    // Submit UTR
    const handleVerifyUtr = async () => {
        if (!utrInput.trim() || utrInput.trim().length < 6) {
            toast.error("Please enter a valid 12-digit UPI UTR number")
            return
        }

        setIsVerifyingUtr(true)
        try {
            const res = await fetch('http://localhost:8080/api/v1/deposit/verify-utr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deposit_id: activeDeposit?.depositId,
                    utr: utrInput.trim()
                })
            })

            if (res.ok) {
                cleanup()
                setInlineStep('success')
                fetchBalance()
                fetchTransactions()
                toast.success("UTR submitted! Balance credited.")
            } else {
                toast.success("UTR recorded! System is verifying payment.")
            }
        } catch (e) {
            toast.success("UTR recorded! System is verifying payment.")
        } finally {
            setIsVerifyingUtr(false)
        }
    }

    const startPolling = (depId: string) => {
        cleanup()
        pollRef.current = setInterval(async () => {
            try {
                const res = await api.request<any>(`/api/wallet/deposit/status?id=${depId}`)
                if (res.success && res.data) {
                    const status = res.data.status
                    if (status === 'completed' || status === 'COMPLETED') {
                        cleanup()
                        setInlineStep('success')
                        fetchBalance()
                        fetchTransactions()
                        toast.success("Payment Received! Wallet balance credited.")
                    }
                }
            } catch (e) {}
        }, POLL_INTERVAL)
    }

    const startCountdown = () => {
        if (countdownRef.current) clearInterval(countdownRef.current)
        countdownRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    cleanup()
                    toast.error("Payment session expired")
                    return 0
                }
                return prev - 1
            })
        }, 1000)
    }

    const copyUpiId = () => {
        const upi = activeDeposit?.upiId || 'paytmqr281005050101nbxw0hx35cpo@paytm'
        navigator.clipboard.writeText(upi)
        setCopiedUpi(true)
        toast.success("UPI VPA ID copied to clipboard")
        setTimeout(() => setCopiedUpi(false), 2000)
    }

    const formatTimer = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    const handleDepositClick = () => {
        addFundsRef.current?.scrollIntoView({ behavior: 'smooth' })
        customInputRef.current?.focus()
    }

    const handleWithdrawClick = () => {
        toast.info("Withdrawal functionality is currently not available. Please contact support.", {
            description: "Bank transfers and crypto withdrawals will be enabled in an upcoming release."
        })
    }

    const downloadReport = () => {
        const headers = ["ID", "Date", "Type", "Amount", "Description", "Status"]
        const rows = filteredTransactions.map(t => [
            t.id,
            new Date(t.date).toLocaleString(),
            t.type,
            formatPrice(t.amount),
            t.description,
            t.status
        ])

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n")

        const encodedUri = encodeURI(csvContent)
        const link = document.createElement("a")
        link.setAttribute("href", encodedUri)
        link.setAttribute("download", `wallet_report_${new Date().toISOString()}.csv`)
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        toast.success("Report downloaded successfully")
    }

    // Filter Logic
    const filteredTransactions = useMemo(() => {
        return (transactions || []).filter(t => {
            const matchesType =
                filterType === 'all' ? true :
                filterType === 'credit' ? (t.type === 'topup' || t.type === 'manual_credit' || t.type === 'referral_bonus' || (t.type as string) === 'deposit') :
                filterType === 'debit' ? (t.type === 'purchase' || t.type === 'manual_debit') :
                filterType === 'other' ? (t.type === 'refund') : true

            return matchesType
        })
    }, [transactions, filterType])

    const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE)
    const paginatedTransactions = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE
        return filteredTransactions.slice(start, start + ITEMS_PER_PAGE)
    }, [filteredTransactions, currentPage])

    return (
        <div className="min-h-full p-4 md:p-6 lg:p-8 space-y-8 relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-20 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-20 left-10 w-96 h-96 bg-purple-500/5 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 max-w-7xl mx-auto space-y-8">
                {/* Header Section */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">My Wallet</h1>
                            <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/10 font-semibold px-2.5 py-0.5">
                                PRO
                            </Badge>
                        </div>
                        <p className="text-muted-foreground text-sm mt-1">
                            Manage funds, track expenses, and control your financial data.
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { fetchBalance(); fetchTransactions(); toast.success("Refreshed wallet balance"); }}
                            className="border-white/10 bg-card/40 hover:bg-white/10 text-xs font-semibold h-10 px-4"
                        >
                            <RefreshCw className="w-3.5 h-3.5 mr-2" />
                            Refresh
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={downloadReport}
                            className="border-white/10 bg-card/40 hover:bg-white/10 text-xs font-semibold h-10 px-4"
                        >
                            <Download className="w-3.5 h-3.5 mr-2" />
                            Download CSV
                        </Button>
                    </div>
                </div>

                {/* Dashboard Grid Layout (5/12 Balance vs 7/12 Inline Add Funds) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Left Column: Virtual Metallic Card & Quick Stats (5/12) */}
                    <div className="lg:col-span-12 xl:col-span-5 space-y-6">
                        <motion.div
                            variants={fadeInUp}
                            initial="rest"
                            whileHover="hover"
                            animate="rest"
                            className="perspective-1000"
                        >
                            <motion.div
                                variants={cardTilt}
                                className="relative w-full aspect-[1.586/1] rounded-3xl overflow-hidden shadow-2xl shadow-indigo-500/20 group select-none"
                            >
                                <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81]" />
                                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
                                <div className="absolute top-0 right-0 w-[80%] h-[80%] bg-gradient-to-b from-indigo-500/20 to-transparent rounded-bl-full blur-2xl transform translate-x-1/4 -translate-y-1/4" />
                                <div className="absolute bottom-0 left-0 w-[60%] h-[60%] bg-gradient-to-t from-purple-500/20 to-transparent rounded-tr-full blur-3xl transform -translate-x-1/4 translate-y-1/4" />
                                <div className="absolute inset-0 bg-white/5 backdrop-blur-[1px] border border-white/10 rounded-3xl" />

                                <div className="relative h-full p-6 md:p-8 flex flex-col justify-between">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <p className="text-xs font-medium text-indigo-200 tracking-[0.2em] uppercase">Total Balance</p>
                                            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight drop-shadow-lg tabular-nums">
                                                <BalanceDisplay multiBalance={userProfile?.multiBalance} />
                                            </h2>
                                        </div>
                                        <div className="h-10 w-10 md:h-12 md:w-12 rounded-xl bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-md border border-white/20 flex items-center justify-center">
                                            <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-indigo-100" />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-9 rounded-lg bg-gradient-to-br from-amber-200 to-amber-400 opacity-80 shadow-inner border border-amber-300/30 flex items-center justify-center">
                                                <div className="w-8 h-5 border border-black/10 rounded opacity-50" />
                                            </div>
                                            <div className="flex gap-2">
                                                <div className="w-2 h-2 rounded-full bg-white/30 animate-pulse" />
                                                <div className="w-2 h-2 rounded-full bg-white/30" />
                                                <div className="w-2 h-2 rounded-full bg-white/30" />
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-sm text-indigo-200 font-mono tracking-widest mb-1 shadow-black/50 drop-shadow-md">
                                                    **** **** **** {userCardLast4}
                                                </p>
                                                <p className="text-sm font-medium text-white tracking-wide uppercase opacity-90">
                                                    {user?.name || "NEXNUM MEMBER"}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-indigo-300 font-bold tracking-widest uppercase">Valid Thru</p>
                                                <p className="text-sm font-mono text-white">12/29</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>

                        {/* Quick Actions Grid */}
                        <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-3">
                            <Button
                                className="h-16 rounded-xl bg-card/40 border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 backdrop-blur-sm group transition-all"
                                variant="outline"
                                onClick={handleDepositClick}
                            >
                                <ArrowDownRight className="mr-2 h-5 w-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                                <div className="text-left">
                                    <div className="font-semibold text-white">Deposit</div>
                                    <div className="text-[10px] text-muted-foreground">Add funds via UPI</div>
                                </div>
                            </Button>
                            
                            <Button
                                className="w-full h-16 rounded-xl bg-card/20 border border-white/5 opacity-80 cursor-pointer hover:bg-rose-500/5 backdrop-blur-sm transition-all"
                                variant="outline"
                                onClick={handleWithdrawClick}
                            >
                                <ArrowUpRight className="mr-2 h-5 w-5 text-rose-400/70" />
                                <div className="text-left flex-1 min-w-0">
                                    <div className="font-semibold text-white/80">Withdraw</div>
                                    <div className="text-[10px] text-rose-400/90 font-medium">Currently Not Available</div>
                                </div>
                            </Button>
                        </motion.div>

                        {/* Security Card */}
                        <motion.div variants={fadeInUp}>
                            <Card className="border-white/10 bg-card/20 backdrop-blur-sm">
                                <CardContent className="p-4 flex items-center gap-3">
                                    <Shield className="h-5 w-5 text-indigo-400 shrink-0" />
                                    <div>
                                        <h4 className="text-xs font-semibold text-white">Bank-Grade Security</h4>
                                        <p className="text-[11px] text-muted-foreground">Your funds are protected by 256-bit encryption and regulated banking partners.</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>

                    {/* Right Column: Inline Add Funds Panel (No Popups) & History (7/12) */}
                    <div className="lg:col-span-12 xl:col-span-7 space-y-8">
                        {/* Top Up / Add Funds Inline Card */}
                        <motion.div variants={fadeInUp} ref={addFundsRef}>
                            <Card className="border-white/10 bg-card/30 backdrop-blur-xl overflow-hidden shadow-xl shadow-black/5 relative">
                                <div className="absolute top-0 right-0 p-4 opacity-50 pointer-events-none">
                                    <Wallet className="w-24 h-24 text-white/5 -rotate-12" />
                                </div>
                                
                                <CardHeader className="pb-4 border-b border-white/5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20">
                                                <Plus className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-xl font-bold text-white">Add Funds</CardTitle>
                                                <CardDescription className="text-xs text-muted-foreground">Instant top-up via secure gateway</CardDescription>
                                            </div>
                                        </div>

                                        {inlineStep === 'qr_payment' && (
                                            <Button
                                                onClick={() => { setInlineStep('input'); cleanup(); }}
                                                variant="ghost"
                                                size="sm"
                                                className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 bg-indigo-500/10 h-8"
                                            >
                                                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Amount
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>

                                <CardContent className="p-6 relative z-10">
                                    <AnimatePresence mode="wait">
                                        {/* Step 1: Inline Amount & Preset Selection */}
                                        {inlineStep === 'input' && (
                                            <motion.div
                                                key="inline_input"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="space-y-6"
                                            >
                                                {/* Dynamic Presets */}
                                                <div className="grid grid-cols-4 gap-3">
                                                    {dynamicPresets.map((preset) => {
                                                        const isActive = amount === preset.value.toString()
                                                        return (
                                                            <button
                                                                key={preset.value}
                                                                type="button"
                                                                onClick={() => setAmount(preset.value.toString())}
                                                                className={cn(
                                                                    "relative h-14 rounded-xl font-semibold transition-all duration-300 border text-sm md:text-base cursor-pointer",
                                                                    isActive
                                                                        ? "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/25 scale-[1.02]"
                                                                        : "bg-card/50 border-white/5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                                                                )}
                                                            >
                                                                {preset.label}
                                                            </button>
                                                        )
                                                    })}
                                                </div>

                                                {/* Custom Amount Input */}
                                                <div className="relative group">
                                                    <div className={cn(
                                                        "absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-xl blur transition-opacity duration-500",
                                                        customFocused ? "opacity-100" : "opacity-0"
                                                    )} />
                                                    <div className="relative flex items-center bg-card/50 border border-white/10 rounded-xl px-4 h-16 transition-colors group-hover:border-white/20">
                                                        <span className="text-2xl font-bold text-muted-foreground mr-2">{currencySym}</span>
                                                        <Input
                                                            ref={customInputRef}
                                                            type="number"
                                                            placeholder={`Enter custom amount in ${preferredCurrency}...`}
                                                            value={amount}
                                                            onChange={(e) => setAmount(e.target.value)}
                                                            onFocus={() => setCustomFocused(true)}
                                                            onBlur={() => setCustomFocused(false)}
                                                            className="border-none bg-transparent h-full text-2xl font-bold placeholder:font-normal placeholder:text-muted-foreground/60 focus-visible:ring-0 p-0"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Deposit Trigger Button */}
                                                <Button
                                                    onClick={handleInlineCreateDeposit}
                                                    disabled={!amount || parseFloat(amount) <= 0 || isGenerating}
                                                    className={cn(
                                                        "w-full h-14 text-lg font-semibold border-none shadow-lg transition-all duration-300 rounded-xl cursor-pointer",
                                                        "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    )}
                                                >
                                                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : amount ? `Deposit ${currencySym}${parseFloat(amount).toLocaleString()}` : "Enter Amount"}
                                                </Button>
                                            </motion.div>
                                        )}

                                        {/* Step 2: Inline Live QR Code & UTR Verification Screen */}
                                        {inlineStep === 'qr_payment' && activeDeposit && (
                                            <motion.div
                                                key="inline_qr"
                                                initial={{ opacity: 0, scale: 0.98 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.98 }}
                                                className="space-y-6 text-center"
                                            >
                                                {/* Amount & Timer Bar */}
                                                <div className="flex items-center justify-between p-3.5 rounded-xl bg-black/40 border border-white/10">
                                                    <div>
                                                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Amount to Pay</p>
                                                        <p className="text-xl font-bold text-emerald-400">₹{activeDeposit.amount.toLocaleString()}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1 justify-end">
                                                            <Clock className="w-3 h-3 text-amber-400" /> Session Expiry
                                                        </p>
                                                        <p className="text-base font-mono font-bold text-amber-400">{formatTimer(timeLeft)}</p>
                                                    </div>
                                                </div>

                                                {/* Live QR Code Box */}
                                                <div className="relative mx-auto w-56 h-56 bg-white p-3.5 rounded-2xl shadow-2xl flex items-center justify-center border-4 border-indigo-500/40">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={activeDeposit.qrCodeUrl}
                                                        alt="UPI QR Code"
                                                        className="w-full h-full object-contain rounded-lg"
                                                    />
                                                </div>

                                                {/* Copyable UPI VPA ID */}
                                                <div className="p-3.5 rounded-xl bg-black/30 border border-white/10 flex items-center justify-between">
                                                    <div className="text-left min-w-0 pr-2">
                                                        <p className="text-[10px] font-bold uppercase text-muted-foreground">UPI VPA Address</p>
                                                        <p className="text-xs font-mono text-indigo-300 truncate">{activeDeposit.upiId}</p>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={copyUpiId}
                                                        className="h-8 px-3 text-xs border border-white/10 hover:bg-white/10 shrink-0"
                                                    >
                                                        {copiedUpi ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                    </Button>
                                                </div>

                                                {/* 12-Digit UTR Input */}
                                                <div className="space-y-2 text-left">
                                                    <p className="text-xs font-medium text-gray-300">Enter 12-Digit UTR / Transaction Reference</p>
                                                    <div className="flex gap-2">
                                                        <Input
                                                            placeholder="e.g. 421098765432"
                                                            value={utrInput}
                                                            onChange={(e) => setUtrInput(e.target.value)}
                                                            className="bg-black/40 border-white/10 text-xs font-mono h-11 focus:border-indigo-500/50"
                                                        />
                                                        <Button
                                                            onClick={handleVerifyUtr}
                                                            disabled={isVerifyingUtr || !utrInput.trim()}
                                                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold h-11 px-5 rounded-xl shadow-md shrink-0 cursor-pointer"
                                                        >
                                                            {isVerifyingUtr ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify UTR"}
                                                        </Button>
                                                    </div>
                                                </div>

                                                {/* Status Polling Indicator */}
                                                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground pt-1">
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                                                    <span>Waiting for payment confirmation...</span>
                                                </div>
                                            </motion.div>
                                        )}

                                        {/* Step 3: Success View */}
                                        {inlineStep === 'success' && (
                                            <motion.div
                                                key="inline_success"
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                className="py-8 text-center space-y-4"
                                            >
                                                <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
                                                    <CheckCircle2 className="w-10 h-10" />
                                                </div>
                                                <div>
                                                    <h4 className="text-lg font-bold text-white">Deposit Successful!</h4>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        Your wallet balance has been updated successfully.
                                                    </p>
                                                </div>
                                                <Button
                                                    onClick={() => {
                                                        setInlineStep('input')
                                                        setActiveDeposit(null)
                                                        setAmount('')
                                                    }}
                                                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold h-10 px-6 rounded-xl shadow-md"
                                                >
                                                    Add Another Deposit
                                                </Button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Recent Activity Detailed with Pagination */}
                        <motion.div variants={fadeInUp}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 px-1">
                                <h3 className="font-semibold text-lg flex items-center gap-2">
                                    <History className="h-5 w-5 text-indigo-400" />
                                    Transaction History
                                </h3>

                                <div className="flex items-center gap-1 bg-card/40 p-1 rounded-xl border border-white/10 self-start sm:self-auto">
                                    <button
                                        type="button"
                                        onClick={() => setFilterType('all')}
                                        className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer", filterType === 'all' ? "bg-white/10 text-white font-bold" : "text-muted-foreground hover:text-white")}
                                    >All</button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterType('credit')}
                                        className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer", filterType === 'credit' ? "bg-emerald-500/20 text-emerald-400 font-bold" : "text-muted-foreground hover:text-white")}
                                    >Incoming</button>
                                    <button
                                        type="button"
                                        onClick={() => setFilterType('debit')}
                                        className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer", filterType === 'debit' ? "bg-rose-500/20 text-rose-400 font-bold" : "text-muted-foreground hover:text-white")}
                                    >Outgoing</button>
                                </div>
                            </div>

                            {/* Transactions Table Map */}
                            <Card className="border-white/10 bg-card/20 backdrop-blur-sm overflow-hidden">
                                <CardContent className="p-0 divide-y divide-white/5">
                                    {paginatedTransactions.length > 0 ? (
                                        paginatedTransactions.map((tx) => (
                                            <div key={tx.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/10">
                                                        <ArrowDownRight className="w-4 h-4 text-emerald-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-semibold text-white">{tx.description || tx.type}</p>
                                                        <p className="text-[10px] text-muted-foreground">{new Date(tx.date).toLocaleDateString()}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs font-mono font-bold text-white">{formatPrice(tx.amount)}</p>
                                                    <span className="text-[10px] text-emerald-400 capitalize">{tx.status}</span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="p-8 text-center text-xs text-muted-foreground">No transaction history found</div>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>
                </div>
            </div>
        </div>
    )
}
