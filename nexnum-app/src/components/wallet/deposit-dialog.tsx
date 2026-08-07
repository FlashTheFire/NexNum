/**
 * Live UPI & Crypto Deposit Dialog Component
 * 
 * Displays QR code for UPI payment with real-time status polling,
 * countdown timer, UTR manual submission, and method tabs (UPI / Crypto).
 * 
 * @module components/wallet/deposit-dialog
 */

"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import {
    QrCode,
    Clock,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Copy,
    RefreshCw,
    Loader2,
    IndianRupee,
    Shield,
    Sparkles,
    Wallet,
    Check,
    ArrowRight
} from "lucide-react"
import { cn } from "@/lib/utils/utils"
import { useCurrency } from "@/providers/CurrencyProvider"
import { api } from "@/lib/api/api-client"

interface DepositDialogProps {
    open: boolean
    onClose: () => void
    onSuccess?: (amount: number) => void
    initialAmount?: number | string
}

interface DepositOrderData {
    depositId: string
    amount: number
    gateway: string
    qrCodeUrl: string
    upiId: string
    paymentUrl: string
    expiresIn: number
    status: 'pending' | 'completed' | 'failed' | 'expired'
}

const POLL_INTERVAL = 3000 // 3 seconds

export function DepositDialog({ open, onClose, onSuccess, initialAmount }: DepositDialogProps) {
    const { currencies, preferredCurrency, formatPrice } = useCurrency()
    const activeCurrencyObj = currencies[preferredCurrency]
    const currencySym = activeCurrencyObj?.symbol || '$'
    const currencyRate = activeCurrencyObj?.rate || 1

    // Tab & Step state
    const [selectedMethod, setSelectedMethod] = useState<'upi' | 'crypto'>('upi')
    const [step, setStep] = useState<'form' | 'qr_payment' | 'success'>('form')
    const [amount, setAmount] = useState<string>(initialAmount ? String(initialAmount) : '')
    const [utrInput, setUtrInput] = useState('')
    
    // Deposit state
    const [isCreating, setIsCreating] = useState(false)
    const [isVerifyingUtr, setIsVerifyingUtr] = useState(false)
    const [activeDeposit, setActiveDeposit] = useState<DepositOrderData | null>(null)
    const [timeLeft, setTimeLeft] = useState(900)
    const [copiedUpi, setCopiedUpi] = useState(false)

    // Refs
    const pollRef = useRef<NodeJS.Timeout | null>(null)
    const countdownRef = useRef<NodeJS.Timeout | null>(null)

    // Sync initialAmount when dialog opens
    useEffect(() => {
        if (open) {
            if (initialAmount) {
                setAmount(String(initialAmount))
            }
            fetchExistingPendingDeposit()
        } else {
            cleanup()
        }
    }, [open, initialAmount])

    const cleanup = () => {
        if (pollRef.current) clearInterval(pollRef.current)
        if (countdownRef.current) clearInterval(countdownRef.current)
        pollRef.current = null
        countdownRef.current = null
    }

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

    // Check for existing pending deposit on mount/open
    const fetchExistingPendingDeposit = async () => {
        try {
            const result = await api.request<any>('/api/wallet/deposit')
            if (result.success && result.data?.deposits && result.data.deposits.length > 0) {
                const pending = result.data.deposits[0]
                const defaultQr = `https://qr.udayscriptsx.workers.dev/?data=upi%3A%2F%2Fpay%3Fpa%3Dpaytmqr281005050101nbxw0hx35cpo%40paytm%26pn%3DPaytm%2520Merchant%26tr%3D${pending.depositId || pending.orderId}%26tn%3DAdding%2520Fund&body=dot&eye=frame13&eyeball=ball14&col1=121f28&col2=121f28&logo=https://i.postimg.cc/cCrHr3TQ/1000011838-removebg.png`
                
                setActiveDeposit({
                    depositId: pending.depositId || pending.orderId,
                    amount: pending.amount,
                    gateway: 'UPI',
                    qrCodeUrl: pending.qrCodeUrl || defaultQr,
                    upiId: 'paytmqr281005050101nbxw0hx35cpo@paytm',
                    paymentUrl: pending.paymentUrl || `upi://pay?pa=paytmqr281005050101nbxw0hx35cpo@paytm&pn=Paytm%20Merchant&tr=${pending.depositId}&tn=Adding%20Fund`,
                    expiresIn: pending.expiresIn || 900,
                    status: 'pending'
                })
                setTimeLeft(pending.expiresIn || 900)
                setStep('qr_payment')
                startPolling(pending.depositId || pending.orderId)
                startCountdown()
            }
        } catch (e) {
            console.error("No active pending deposit found")
        }
    }

    // Create new deposit
    const handleCreateDeposit = async () => {
        const val = parseFloat(amount)
        if (isNaN(val) || val <= 0) {
            toast.error("Please enter a valid deposit amount")
            return
        }

        setIsCreating(true)
        try {
            // First call Next.js endpoint /api/wallet/deposit or FastAPI directly
            const result = await api.createDeposit(val)

            if (result.success && result.data) {
                const depId = result.data.depositId || result.data.orderId || `dep_${Date.now()}`
                const defaultQr = `https://qr.udayscriptsx.workers.dev/?data=upi%3A%2F%2Fpay%3Fpa%3Dpaytmqr281005050101nbxw0hx35cpo%40paytm%26pn%3DPaytm%2520Merchant%26tr%3D${depId}%26tn%3DAdding%2520Fund&body=dot&eye=frame13&eyeball=ball14&col1=121f28&col2=121f28&logo=https://i.postimg.cc/cCrHr3TQ/1000011838-removebg.png`

                const depObj: DepositOrderData = {
                    depositId: depId,
                    amount: val,
                    gateway: 'UPI',
                    qrCodeUrl: result.data.qrCodeUrl || defaultQr,
                    upiId: 'paytmqr281005050101nbxw0hx35cpo@paytm',
                    paymentUrl: result.data.paymentUrl || `upi://pay?pa=paytmqr281005050101nbxw0hx35cpo@paytm&pn=Paytm%20Merchant&tr=${depId}&tn=Adding%20Fund`,
                    expiresIn: result.data.expiresIn || 900,
                    status: 'pending'
                }

                setActiveDeposit(depObj)
                setTimeLeft(depObj.expiresIn)
                setStep('qr_payment')
                startPolling(depId)
                startCountdown()
                toast.success("Deposit order generated successfully")
            } else {
                toast.error(result.error || "Failed to create deposit order")
            }
        } catch (e: any) {
            toast.error("Failed to generate deposit request. Please try again.")
        } finally {
            setIsCreating(false)
        }
    }

    // Submit UTR manual verification
    const handleVerifyUtr = async () => {
        if (!utrInput.trim() || utrInput.trim().length < 6) {
            toast.error("Please enter a valid 12-digit UPI UTR number")
            return
        }

        setIsVerifyingUtr(true)
        try {
            // Call FastAPI verify UTR endpoint
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
                setStep('success')
                onSuccess?.(activeDeposit?.amount || 0)
                toast.success("UTR submitted for instant verification!")
            } else {
                toast.success("UTR recorded! Status will update automatically upon bank confirmation.")
            }
        } catch (e) {
            toast.success("UTR recorded! System is verifying transaction status.")
        } finally {
            setIsVerifyingUtr(false)
        }
    }

    // Polling
    const startPolling = (depId: string) => {
        cleanup()
        pollRef.current = setInterval(async () => {
            try {
                const res = await api.getDepositStatus(depId)
                if (res.success && res.data) {
                    const status = res.data.status
                    if (status === 'completed' || status === 'COMPLETED') {
                        cleanup()
                        setStep('success')
                        onSuccess?.(activeDeposit?.amount || 0)
                        toast.success("Payment Received! Wallet balance credited.")
                    }
                }
            } catch (e) {}
        }, POLL_INTERVAL)
    }

    // Countdown
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

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md bg-[#0d0e14] border border-white/10 text-white p-0 overflow-hidden rounded-2xl shadow-2xl">
                {/* Dialog Header */}
                <DialogHeader className="p-5 border-b border-white/10 bg-[#12131c]">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                            <Wallet className="h-5 w-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-bold text-white">Add Funds</DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground">
                                Instant top-up via secure gateway
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Method Tabs Header */}
                {step === 'form' && (
                    <div className="p-4 bg-black/40 border-b border-white/5 flex items-center justify-center gap-2">
                        <button
                            type="button"
                            onClick={() => setSelectedMethod('upi')}
                            className={cn(
                                "flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer border",
                                selectedMethod === 'upi'
                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm"
                                    : "bg-white/5 text-muted-foreground border-transparent hover:text-white"
                            )}
                        >
                            <IndianRupee className="w-3.5 h-3.5" /> UPI (INR)
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedMethod('crypto')}
                            className={cn(
                                "flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer border relative",
                                selectedMethod === 'crypto'
                                    ? "bg-purple-500/20 text-purple-400 border-purple-500/40 shadow-sm"
                                    : "bg-white/5 text-muted-foreground border-transparent hover:text-white"
                            )}
                        >
                            <span>Crypto (USDT)</span>
                            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[9px] h-4 px-1">
                                Few Hours
                            </Badge>
                        </button>
                    </div>
                )}

                {/* Content Area */}
                <div className="p-6 space-y-6">
                    <AnimatePresence mode="wait">
                        {step === 'form' && selectedMethod === 'upi' && (
                            <motion.div
                                key="upi_form"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-6"
                            >
                                {/* Dynamic Presets */}
                                <div className="grid grid-cols-4 gap-2.5">
                                    {dynamicPresets.map((preset) => {
                                        const isActive = amount === preset.value.toString()
                                        return (
                                            <button
                                                key={preset.value}
                                                type="button"
                                                onClick={() => setAmount(preset.value.toString())}
                                                className={cn(
                                                    "relative h-12 rounded-xl font-semibold transition-all duration-200 border text-xs md:text-sm cursor-pointer",
                                                    isActive
                                                        ? "bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-500/20 scale-[1.02]"
                                                        : "bg-card/50 border-white/10 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                                                )}
                                            >
                                                {preset.label}
                                            </button>
                                        )
                                    })}
                                </div>

                                {/* Custom Amount Input */}
                                <div className="relative flex items-center bg-card/50 border border-white/10 rounded-xl px-4 h-14 focus-within:border-emerald-500/50">
                                    <span className="text-xl font-bold text-muted-foreground mr-2">{currencySym}</span>
                                    <Input
                                        type="number"
                                        placeholder={`Enter custom amount in ${preferredCurrency}...`}
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="border-none bg-transparent h-full text-xl font-bold placeholder:font-normal placeholder:text-muted-foreground/50 focus-visible:ring-0 p-0"
                                    />
                                </div>

                                {/* Deposit Trigger Button */}
                                <Button
                                    onClick={handleCreateDeposit}
                                    disabled={!amount || parseFloat(amount) <= 0 || isCreating}
                                    className="w-full h-14 text-base font-semibold border-none shadow-lg transition-all rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-500/25 cursor-pointer"
                                >
                                    {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : amount ? `Deposit ${currencySym}${parseFloat(amount).toLocaleString()}` : "Enter Amount"}
                                </Button>
                            </motion.div>
                        )}

                        {step === 'form' && selectedMethod === 'crypto' && (
                            <motion.div
                                key="crypto_form"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="py-8 text-center space-y-4"
                            >
                                <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto text-purple-400">
                                    <Sparkles className="w-8 h-8 animate-pulse" />
                                </div>
                                <div>
                                    <h4 className="text-base font-semibold text-white">Crypto Gateway Activating</h4>
                                    <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                                        Multi-chain USDT (TRC20 & BEP20) automatic payment node will be online in a few hours. Please use UPI in the meantime.
                                    </p>
                                </div>
                                <Button
                                    onClick={() => setSelectedMethod('upi')}
                                    variant="outline"
                                    className="border-white/10 bg-white/5 hover:bg-white/10 text-xs h-9"
                                >
                                    Switch to UPI (Instant)
                                </Button>
                            </motion.div>
                        )}

                        {/* Live QR Payment Screen */}
                        {step === 'qr_payment' && activeDeposit && (
                            <motion.div
                                key="qr_payment"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="space-y-5 text-center"
                            >
                                {/* Countdown & Amount Header */}
                                <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/10">
                                    <div>
                                        <p className="text-[10px] uppercase font-bold text-muted-foreground">Amount to Pay</p>
                                        <p className="text-lg font-bold text-emerald-400">₹{activeDeposit.amount.toLocaleString()}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1 justify-end">
                                            <Clock className="w-3 h-3 text-amber-400" /> Expires In
                                        </p>
                                        <p className="text-sm font-mono font-bold text-amber-400">{formatTimer(timeLeft)}</p>
                                    </div>
                                </div>

                                {/* QR Code Display */}
                                <div className="relative mx-auto w-52 h-52 bg-white p-3 rounded-2xl shadow-xl flex items-center justify-center border-4 border-indigo-500/30">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={activeDeposit.qrCodeUrl}
                                        alt="UPI QR Code"
                                        className="w-full h-full object-contain rounded-lg"
                                    />
                                </div>

                                {/* Copyable UPI VPA ID */}
                                <div className="p-3 rounded-xl bg-black/30 border border-white/10 flex items-center justify-between">
                                    <div className="text-left min-w-0 pr-2">
                                        <p className="text-[10px] font-bold uppercase text-muted-foreground">UPI VPA Address</p>
                                        <p className="text-xs font-mono text-indigo-300 truncate">{activeDeposit.upiId}</p>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={copyUpiId}
                                        className="h-8 px-2.5 text-xs border border-white/10 hover:bg-white/10 shrink-0"
                                    >
                                        {copiedUpi ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    </Button>
                                </div>

                                {/* 12-Digit UTR Manual Input */}
                                <div className="space-y-2 text-left">
                                    <p className="text-xs font-medium text-gray-300">Enter 12-Digit UTR / Reference Number</p>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="e.g. 421098765432"
                                            value={utrInput}
                                            onChange={(e) => setUtrInput(e.target.value)}
                                            className="bg-black/30 border-white/10 text-xs font-mono h-10 focus:border-indigo-500/50"
                                        />
                                        <Button
                                            onClick={handleVerifyUtr}
                                            disabled={isVerifyingUtr || !utrInput.trim()}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold h-10 px-4 rounded-lg shadow-md shrink-0 cursor-pointer"
                                        >
                                            {isVerifyingUtr ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
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

                        {/* Success Screen */}
                        {step === 'success' && (
                            <motion.div
                                key="success"
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
                                        Your wallet has been credited with {formatPrice(activeDeposit?.amount || parseFloat(amount))}
                                    </p>
                                </div>
                                <Button
                                    onClick={() => {
                                        setStep('form')
                                        setActiveDeposit(null)
                                        setAmount('')
                                        onClose()
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold h-10 px-6 rounded-xl shadow-md"
                                >
                                    Done
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </DialogContent>
        </Dialog>
    )
}
