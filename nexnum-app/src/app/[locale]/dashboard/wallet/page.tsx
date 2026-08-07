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
    RefreshCw,
    CheckCircle2,
    Clock,
    Copy,
    Check,
    Loader2,
    IndianRupee,
    ArrowLeft,
    Coins,
    Lock,
    QrCode,
    ShieldCheck
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

    // Form & Inline Multi-Step Deposit State
    const [amount, setAmount] = useState<string>("10")
    const [customFocused, setCustomFocused] = useState(false)
    const [inlineStep, setInlineStep] = useState<'input' | 'select_method' | 'qr_payment' | 'crypto_payment' | 'success'>('input')
    const [selectedGateway, setSelectedGateway] = useState<'UPI' | 'CRYPTO'>('UPI')
    const [cryptoNetwork, setCryptoNetwork] = useState<'TRC20' | 'BEP20'>('TRC20')

    const [activeDeposit, setActiveDeposit] = useState<any>(null)
    const [timeLeft, setTimeLeft] = useState(900)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isCancelling, setIsCancelling] = useState(false)
    const [copiedCrypto, setCopiedCrypto] = useState(false)
    const [resolvedQrImage, setResolvedQrImage] = useState<string | null>(null)

    // Resolve QR Worker JSON to direct image URL if needed
    useEffect(() => {
        if (!activeDeposit?.qrCodeUrl) {
            setResolvedQrImage(null)
            return
        }

        const rawUrl = activeDeposit.qrCodeUrl as string

        // Direct image URLs — no JSON parsing needed, use as-is
        const isDirectImage =
            rawUrl.includes('api.qrserver.com') ||
            rawUrl.includes('qrcode-monkey.com') ||
            /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(rawUrl)

        if (isDirectImage) {
            setResolvedQrImage(rawUrl)
            return
        }

        // Cloudflare QR worker returns JSON { image: "..." } — resolve to direct URL
        if (rawUrl.includes('qr.udayscriptsx.workers.dev')) {
            fetch(rawUrl)
                .then(r => r.json())
                .then(data => {
                    if (data.image) setResolvedQrImage(data.image)
                    else setResolvedQrImage(rawUrl)
                })
                .catch(() => {
                    const upiString = encodeURIComponent(`upi://pay?pa=paytmqr281005050101nbxw0hx35cpo@paytm&pn=NexNum&tr=${activeDeposit.depositId || activeDeposit.orderId}&tn=Adding Fund`)
                    setResolvedQrImage(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${upiString}`)
                })
            return
        }

        // Fallback: use URL as-is
        setResolvedQrImage(rawUrl)
    }, [activeDeposit?.qrCodeUrl, activeDeposit?.depositId, activeDeposit?.orderId])

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
            let rounded = Math.round(raw)
            const val = Math.max(1, rounded)
            return {
                value: val,
                label: `${currencySym}${val.toLocaleString()}`
            }
        })
    }, [preferredCurrency, currencySym, currencyRate])

    const userCardLast4 = user?.id ? user.id.slice(-4).toUpperCase() : "8888"

    // Estimated INR converted amount for display
    const calculatedInrAmount = useMemo(() => {
        const val = parseFloat(amount) || 0
        if (preferredCurrency === 'INR') return val
        if (preferredCurrency === 'USD') return Math.round(val * 88.5 * 100) / 100
        if (preferredCurrency === 'EUR') return Math.round(val * 96.0 * 100) / 100
        if (preferredCurrency === 'GBP') return Math.round(val * 112.0 * 100) / 100
        if (preferredCurrency === 'RUB') return Math.round(val * 0.95 * 100) / 100
        return Math.round(val * (currencyRate || 88.5) * 100) / 100
    }, [amount, preferredCurrency, currencyRate])

    // Check for existing pending deposit on page load
    const fetchExistingPendingDeposit = async () => {
        try {
            const result = await api.request<any>('/api/wallet/deposit')
            if (result.success && result.data?.deposits && result.data.deposits.length > 0) {
                const pending = result.data.deposits[0]
                const depId = pending.depositId || pending.orderId
                const defaultQr = `https://qr.udayscriptsx.workers.dev/?data=upi%3A%2F%2Fpay%3Fpa%3Dpaytmqr281005050101nbxw0hx35cpo%40paytm%26pn%3DPaytm%2520Merchant%26tr%3D${depId}%26tn%3DAdding%2520Fund&body=dot&eye=frame13&eyeball=ball14&col1=121f28&col2=121f28&logo=https://i.postimg.cc/cCrHr3TQ/1000011838-removebg.png`

                // Calculate real remaining seconds from expiresAt
                const remainingSecs = pending.expiresIn
                    ? Math.max(0, Math.floor(
                        (new Date(pending.expiresAt).getTime() - Date.now()) / 1000
                      ))
                    : 900

                setActiveDeposit({
                    depositId: depId,
                    amount: pending.amount,
                    originalAmount: pending.amount,
                    originalCurrency: 'INR',
                    qrCodeUrl: pending.qrCodeUrl || defaultQr,
                    upiId: 'paytmqr281005050101nbxw0hx35cpo@paytm',
                    expiresIn: remainingSecs
                })
                setTimeLeft(remainingSecs)
                setInlineStep('qr_payment')
                startPolling(depId)
                startCountdown()
            }
        } catch (e) {}
    }

    // Handle Amount Continue -> Select Method
    const handleContinueToMethod = () => {
        const val = parseFloat(amount)
        if (isNaN(val) || val < 1) {
            toast.error("Minimum deposit amount is $1.00")
            return
        }
        setInlineStep('select_method')
    }

    // Cancel active deposit so user can generate a new one
    const handleCancelDeposit = async () => {
        if (!activeDeposit?.depositId) return
        setIsCancelling(true)
        try {
            const result = await api.request<any>('/api/wallet/deposit/cancel', 'POST', {
                depositId: activeDeposit.depositId,
                reason: 'user_cancelled',
            })
            if (result.success || result.data?.status === 'cancelled') {
                cleanup()
                setActiveDeposit(null)
                setResolvedQrImage(null)
                setInlineStep('input')
                toast.success('Deposit cancelled. You can now start a new one.')
            } else {
                toast.error(result.error || 'Failed to cancel deposit')
            }
        } catch (e: any) {
            toast.error('Failed to cancel deposit. Please try again.')
        } finally {
            setIsCancelling(false)
        }
    }

    // Create UPI Order & Transition to QR Payment
    const handleSelectUpiPayment = async () => {
        const val = parseFloat(amount)
        if (isNaN(val) || val <= 0) {
            toast.error("Please enter a valid deposit amount")
            return
        }

        // Block if there's already an active deposit — user must cancel first
        if (activeDeposit) {
            setInlineStep('qr_payment')
            toast.info('You have an active deposit. Cancel it first to generate a new one.')
            return
        }

        setSelectedGateway('UPI')
        setIsGenerating(true)
        try {
            const result = await api.request<any>('/api/wallet/deposit', 'POST', {
                amount: val,
                currency: preferredCurrency,
                idempotencyKey: `dep_${user?.id}_${Date.now()}`
            })

            if (result.success && result.data) {
                const depData = result.data
                const depId = depData.depositId || depData.orderId || `dep_${Date.now()}`
                const defaultQr = `https://qr.udayscriptsx.workers.dev/?data=upi%3A%2F%2Fpay%3Fpa%3Dpaytmqr281005050101nbxw0hx35cpo%40paytm%26pn%3DNexNum%26tr%3D${depId}%26tn%3DAdding%2520Fund&body=dot&eye=frame13&eyeball=ball14&col1=121f28&col2=121f28&logo=https://i.postimg.cc/cCrHr3TQ/1000011838-removebg.png`

                setActiveDeposit({
                    depositId: depId,
                    orderId: depData.orderId,
                    amount: depData.amount || calculatedInrAmount,
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

    // Select Crypto Payment -> Transition to Crypto Screen
    const handleSelectCryptoPayment = () => {
        setSelectedGateway('CRYPTO')
        setInlineStep('crypto_payment')
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
                    setInlineStep('input')
                    setActiveDeposit(null)
                    toast.error("Payment session expired. Please start a new deposit.")
                    return 0
                }
                return prev - 1
            })
        }, 1000)
    }


    const cryptoAddress = cryptoNetwork === 'TRC20' 
        ? "TQn9Y2khEsLJW1ChVWFMSMeSTow5K3wSE4" 
        : "0x71C7656EC7ab88b098defB751B7401B5f6d8976F"

    const copyCryptoAddress = () => {
        navigator.clipboard.writeText(cryptoAddress)
        setCopiedCrypto(true)
        toast.success(`USDT ${cryptoNetwork} address copied`)
        setTimeout(() => setCopiedCrypto(false), 2000)
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
                            className="border-white/10 bg-card/40 hover:bg-white/10 text-xs font-semibold h-10 px-4 cursor-pointer"
                        >
                            <RefreshCw className="w-3.5 h-3.5 mr-2" />
                            Refresh
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={downloadReport}
                            className="border-white/10 bg-card/40 hover:bg-white/10 text-xs font-semibold h-10 px-4 cursor-pointer"
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
                                className="h-16 rounded-xl bg-card/40 border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 backdrop-blur-sm group transition-all cursor-pointer"
                                variant="outline"
                                onClick={handleDepositClick}
                            >
                                <ArrowDownRight className="mr-2 h-5 w-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                                <div className="text-left">
                                    <div className="font-semibold text-white">Deposit</div>
                                    <div className="text-[10px] text-muted-foreground">Add funds via UPI/Crypto</div>
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
                                        <h4 className="text-xs font-semibold text-white">Bank-Grade Encrypted Security</h4>
                                        <p className="text-[11px] text-muted-foreground">All transactions pass anti-bot HMAC signature checks and 256-bit encryption.</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>

                    {/* Right Column: Inline Multi-Step Add Funds Panel (7/12) */}
                    <div className="lg:col-span-12 xl:col-span-7 space-y-8">
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
                                                <CardTitle className="text-xl font-bold text-white">
                                                    {inlineStep === 'input' && "Add Funds"}
                                                    {inlineStep === 'select_method' && "Select Payment Method"}
                                                    {inlineStep === 'qr_payment' && "Add Funds via UPI"}
                                                    {inlineStep === 'crypto_payment' && "Crypto USDT Deposit"}
                                                    {inlineStep === 'success' && "Deposit Completed"}
                                                </CardTitle>
                                                <CardDescription className="text-xs text-muted-foreground">
                                                    {inlineStep === 'input' && "Enter amount to deposit"}
                                                    {inlineStep === 'select_method' && "Choose your preferred payment method"}
                                                    {inlineStep === 'qr_payment' && "Instant top-up via secure UPI QR gateway"}
                                                    {inlineStep === 'crypto_payment' && "Send USDT via TRC20 or BEP20 network"}
                                                    {inlineStep === 'success' && "Wallet balance updated successfully"}
                                                </CardDescription>
                                            </div>
                                        </div>

                                        {inlineStep === 'select_method' && (
                                            <Button
                                                onClick={() => setInlineStep('input')}
                                                variant="ghost"
                                                size="sm"
                                                className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 bg-indigo-500/10 h-8 cursor-pointer"
                                            >
                                                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Amount
                                            </Button>
                                        )}

                                        {(inlineStep === 'qr_payment' || inlineStep === 'crypto_payment') && (
                                            <Button
                                                onClick={() => { setInlineStep('select_method'); cleanup(); }}
                                                variant="ghost"
                                                size="sm"
                                                className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 bg-indigo-500/10 h-8 cursor-pointer"
                                            >
                                                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to Payment Method
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>

                                <CardContent className="p-6 relative z-10">
                                    <AnimatePresence mode="wait">
                                        {/* STEP 1: Enter Amount & Select Presets */}
                                        {inlineStep === 'input' && (
                                            <motion.div
                                                key="step_input"
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
                                                            placeholder={`10`}
                                                            value={amount}
                                                            onChange={(e) => setAmount(e.target.value)}
                                                            onFocus={() => setCustomFocused(true)}
                                                            onBlur={() => setCustomFocused(false)}
                                                            className="border-none bg-transparent h-full text-2xl font-bold placeholder:font-normal placeholder:text-muted-foreground/60 focus-visible:ring-0 p-0"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Continue Button */}
                                                <Button
                                                    onClick={handleContinueToMethod}
                                                    disabled={!amount || parseFloat(amount) <= 0}
                                                    className={cn(
                                                        "w-full h-14 text-base md:text-lg font-semibold border-none shadow-lg transition-all duration-300 rounded-xl cursor-pointer",
                                                        "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    )}
                                                >
                                                    Continue to Select Payment Method
                                                </Button>
                                            </motion.div>
                                        )}

                                        {/* STEP 2: Select Payment Method Screen */}
                                        {inlineStep === 'select_method' && (
                                            <motion.div
                                                key="step_select_method"
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                className="space-y-4"
                                            >
                                                <div className="grid grid-cols-1 gap-3">
                                                    {/* UPI Method Selection Option */}
                                                    <button
                                                        type="button"
                                                        onClick={handleSelectUpiPayment}
                                                        disabled={isGenerating}
                                                        className="w-full p-4 rounded-2xl bg-black/40 border-2 border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all text-left flex items-center justify-between group cursor-pointer"
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
                                                                <IndianRupee className="w-6 h-6" />
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-bold text-white">UPI / Paytm</span>
                                                                    <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px] border-emerald-500/40">
                                                                        Local Currency (INR)
                                                                    </Badge>
                                                                </div>
                                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                                    Instant QR Code top-up via Paytm, PhonePe & Google Pay
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {isGenerating ? (
                                                            <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                                                        ) : (
                                                            <ArrowDownRight className="w-5 h-5 text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                                                        )}
                                                    </button>

                                                    {/* Crypto USDT Selection Option */}
                                                    <button
                                                        type="button"
                                                        onClick={handleSelectCryptoPayment}
                                                        className="w-full p-4 rounded-2xl bg-black/40 border-2 border-white/10 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all text-left flex items-center justify-between group cursor-pointer"
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-105 transition-transform">
                                                                <Coins className="w-6 h-6" />
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-bold text-white">Crypto</span>
                                                                    <Badge className="bg-indigo-500/20 text-indigo-400 text-[10px] border-indigo-500/40">
                                                                        USDT (Global)
                                                                    </Badge>
                                                                </div>
                                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                                    Instant USDT TRC20 / BEP20 network deposit
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <ArrowDownRight className="w-5 h-5 text-zinc-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                                                    </button>
                                                </div>

                                                {/* Security Footer Note */}
                                                <div className="pt-2 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                                                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                                                    <span>All payments are secure and encrypted</span>
                                                </div>
                                            </motion.div>
                                        )}

                                        {/* STEP 3A: Live UPI QR Payment Screen */}
                                        {inlineStep === 'qr_payment' && activeDeposit && (
                                            <motion.div
                                                key="step_qr_payment"
                                                initial={{ opacity: 0, scale: 0.98 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.98 }}
                                                className="space-y-4"
                                            >
                                                {/* Amount + Timer Banner */}
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                                                        <p className="text-[10px] uppercase font-bold text-emerald-400/70 tracking-widest mb-1">Amount to Pay</p>
                                                        <p className="text-xl font-bold text-emerald-400 tabular-nums">
                                                            ₹{activeDeposit.amount?.toLocaleString('en-IN') ?? '—'}
                                                        </p>
                                                        {preferredCurrency !== 'INR' && (
                                                            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                                                                ≈ {currencySym}{parseFloat(amount).toFixed(2)} {preferredCurrency}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                                        <p className="text-[10px] uppercase font-bold text-amber-400/70 tracking-widest mb-1 flex items-center gap-1">
                                                            <Clock className="w-3 h-3" /> Session Expiry
                                                        </p>
                                                        <p className={`text-xl font-mono font-bold tabular-nums ${timeLeft < 120 ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`}>
                                                            {formatTimer(timeLeft)}
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground mt-0.5">
                                                            {timeLeft < 60 ? 'Expiring soon!' : 'Complete payment before expiry'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* QR Code Container — premium glassmorphic */}
                                                <div className="relative flex flex-col items-center">
                                                    {/* Outer glow ring */}
                                                    <div className="absolute inset-0 rounded-3xl bg-emerald-500/10 blur-xl pointer-events-none" />

                                                    <div className="relative w-full max-w-[260px] mx-auto">
                                                        {/* QR Card */}
                                                        <div className="relative bg-white rounded-2xl p-4 shadow-2xl shadow-emerald-500/20 border-2 border-emerald-500/40 overflow-hidden">
                                                            {/* Scan-line animation overlay */}
                                                            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
                                                                <motion.div
                                                                    animate={{ y: ['-100%', '200%'] }}
                                                                    transition={{ duration: 2.5, repeat: Infinity, ease: 'linear', repeatDelay: 1 }}
                                                                    className="absolute left-0 right-0 h-8 bg-gradient-to-b from-transparent via-emerald-400/25 to-transparent"
                                                                />
                                                            </div>

                                                            {/* QR Image or Skeleton */}
                                                            {resolvedQrImage ? (
                                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                                <img
                                                                    src={resolvedQrImage}
                                                                    alt="UPI QR Code — Scan with Paytm / PhonePe / GPay"
                                                                    className="w-full h-full object-contain"
                                                                    style={{ minHeight: 200 }}
                                                                />
                                                            ) : (
                                                                <div className="w-full flex flex-col items-center justify-center gap-3 py-10">
                                                                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                                                                    <p className="text-xs text-gray-400 font-medium">Generating QR code...</p>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Corner accent marks */}
                                                        <div className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-emerald-400 rounded-tl-md" />
                                                        <div className="absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 border-emerald-400 rounded-tr-md" />
                                                        <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 border-emerald-400 rounded-bl-md" />
                                                        <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-emerald-400 rounded-br-md" />
                                                    </div>

                                                    <p className="mt-3 text-[11px] text-muted-foreground text-center">
                                                        Scan with <span className="text-white font-semibold">Paytm</span> · <span className="text-white font-semibold">PhonePe</span> · <span className="text-white font-semibold">GPay</span>
                                                    </p>
                                                </div>

                                                {/* Auto-detection status bar */}
                                                <div className="flex items-center justify-center gap-2.5 p-3 rounded-xl bg-emerald-500/8 border border-emerald-500/15">
                                                    <div className="relative flex h-2.5 w-2.5 shrink-0">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                                                    </div>
                                                    <p className="text-xs text-emerald-400 font-medium">
                                                        Auto-detecting payment — no action needed after scanning
                                                    </p>
                                                </div>

                                                {/* Cancel Deposit — prominent, safe destructive styling */}
                                                <div className="pt-1 border-t border-white/5">
                                                    <button
                                                        type="button"
                                                        onClick={handleCancelDeposit}
                                                        disabled={isCancelling}
                                                        className="w-full h-11 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer flex items-center justify-center gap-2 border border-rose-500/30 bg-rose-500/8 text-rose-400 hover:bg-rose-500/15 hover:border-rose-500/50 hover:text-rose-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {isCancelling ? (
                                                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cancelling...</>
                                                        ) : (
                                                            <><ArrowLeft className="w-3.5 h-3.5" /> Cancel & Generate New Deposit</>
                                                        )}
                                                    </button>
                                                    <p className="text-center text-[10px] text-muted-foreground mt-1.5">
                                                        Only one active deposit allowed at a time
                                                    </p>
                                                </div>
                                            </motion.div>
                                        )}


                                        {/* STEP 3B: Crypto USDT Payment Screen */}
                                        {inlineStep === 'crypto_payment' && (
                                            <motion.div
                                                key="step_crypto_payment"
                                                initial={{ opacity: 0, scale: 0.98 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.98 }}
                                                className="space-y-6 text-center"
                                            >
                                                {/* Amount Header */}
                                                <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between text-left">
                                                    <div>
                                                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Deposit Amount</p>
                                                        <p className="text-xl font-bold text-indigo-400">{parseFloat(amount).toFixed(2)} USDT</p>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => setCryptoNetwork('TRC20')}
                                                            className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border", cryptoNetwork === 'TRC20' ? "bg-indigo-600 text-white border-indigo-500" : "bg-black/40 text-zinc-400 border-white/10")}
                                                        >TRC20</button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setCryptoNetwork('BEP20')}
                                                            className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border", cryptoNetwork === 'BEP20' ? "bg-indigo-600 text-white border-indigo-500" : "bg-black/40 text-zinc-400 border-white/10")}
                                                        >BEP20</button>
                                                    </div>
                                                </div>

                                                {/* Deposit Wallet Address */}
                                                <div className="p-3.5 rounded-xl bg-black/30 border border-white/10 flex items-center justify-between">
                                                    <div className="text-left min-w-0 pr-2">
                                                        <p className="text-[10px] font-bold uppercase text-muted-foreground">USDT ({cryptoNetwork}) Address</p>
                                                        <p className="text-xs font-mono text-indigo-300 truncate">{cryptoAddress}</p>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={copyCryptoAddress}
                                                        className="h-8 px-3 text-xs border border-white/10 hover:bg-white/10 shrink-0 cursor-pointer"
                                                    >
                                                        {copiedCrypto ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                                    </Button>
                                                </div>

                                                <p className="text-xs text-zinc-400">
                                                    Send exactly <strong className="text-white">{parseFloat(amount).toFixed(2)} USDT</strong> on the <strong className="text-indigo-400">{cryptoNetwork}</strong> network. Credits automatically after 3 confirmations.
                                                </p>
                                            </motion.div>
                                        )}

                                        {/* STEP 4: Success View */}
                                        {inlineStep === 'success' && (
                                            <motion.div
                                                key="step_success"
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
                                                        Your wallet balance has been credited with Points successfully.
                                                    </p>
                                                </div>
                                                <Button
                                                    onClick={() => {
                                                        setInlineStep('input')
                                                        setActiveDeposit(null)
                                                        setAmount('10')
                                                    }}
                                                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold h-10 px-6 rounded-xl shadow-md cursor-pointer"
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
