/**
 * UPI Deposit Dialog Component
 * 
 * Displays QR code for UPI payment with real-time status polling.
 * Shows countdown timer, payment instructions, and handles completion.
 * 
 * @module components/wallet/deposit-dialog
 */

"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import {
    QrCode,
    Clock,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Copy,
    ExternalLink,
    RefreshCw,
    Loader2,
    IndianRupee,
    Smartphone,
    Shield,
    Gift,
    Sparkles
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useCurrency } from "@/providers/CurrencyProvider"

// Types
interface DepositConfig {
    minAmount: number
    maxAmount: number
    timeoutMinutes: number
    bonusPercent?: number
}

interface Deposit {
    depositId: string
    orderId: string
    amount: number
    status: 'pending' | 'completed' | 'failed' | 'expired'
    qrCodeUrl: string
    paymentUrl: string
    expiresAt: string
    expiresIn: number
}

interface DepositDialogProps {
    open: boolean
    onClose: () => void
    onSuccess?: (amount: number) => void
}

// Preset amounts
const PRESETS = [100, 500, 1000, 2000]
const POLL_INTERVAL = 3000 // 3 seconds

export function DepositDialog({ open, onClose, onSuccess }: DepositDialogProps) {
    const { formatPrice, settings } = useCurrency()
    const pointsRate = Number(settings?.pointsRate) || 100

    // State
    const [step, setStep] = useState<'amount' | 'payment' | 'success' | 'failed'>('amount')
    const [amount, setAmount] = useState<string>('')
    const [isCreating, setIsCreating] = useState(false)
    const [config, setConfig] = useState<DepositConfig>({ minAmount: 10, maxAmount: 50000, timeoutMinutes: 30, bonusPercent: 0 })
    const [deposit, setDeposit] = useState<Deposit | null>(null)
    const [timeLeft, setTimeLeft] = useState(0)
    const [utr, setUtr] = useState<string | null>(null)

    // Polling refs
    const pollRef = useRef<NodeJS.Timeout | null>(null)
    const countdownRef = useRef<NodeJS.Timeout | null>(null)

    // Fetch config on mount
    useEffect(() => {
        if (open) {
            fetchConfig()
        }
        return () => {
            cleanup()
        }
    }, [open])

    const cleanup = () => {
        if (pollRef.current) clearInterval(pollRef.current)
        if (countdownRef.current) clearInterval(countdownRef.current)
        pollRef.current = null
        countdownRef.current = null
    }

    const fetchConfig = async () => {
        try {
            const res = await fetch('/api/wallet/deposit')
            if (res.ok) {
                const data = await res.json()
                if (data.success && data.data.config) {
                    setConfig(data.data.config)
                }
            }
        } catch (error) {
            console.error('Failed to fetch deposit config', error)
        }
    }

    // Calculate bonus amount
    const numAmount = parseFloat(amount) || 0
    const bonusPercent = config.bonusPercent || 0
    const bonusAmount = bonusPercent > 0 ? Math.floor((numAmount * bonusPercent) / 100) : 0
    const totalAmount = numAmount + bonusAmount

    // Create deposit
    const handleCreateDeposit = async () => {
        if (isNaN(numAmount) || numAmount < config.minAmount || numAmount > config.maxAmount) {
            toast.error(`Amount must be between ₹${config.minAmount} and ₹${config.maxAmount}`)
            return
        }

        setIsCreating(true)
        try {
            const res = await fetch('/api/wallet/deposit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: numAmount }),
            })

            const data = await res.json()

            if (!data.success) {
                toast.error(data.error || 'Failed to create deposit')
                return
            }

            setDeposit(data.data)
            setTimeLeft(data.data.expiresIn)
            setStep('payment')

            // Start polling for status
            startPolling(data.data.depositId)

            // Start countdown
            startCountdown()

        } catch (error) {
            toast.error('Failed to create deposit. Please try again.')
        } finally {
            setIsCreating(false)
        }
    }

    // Start status polling
    const startPolling = (depositId: string) => {
        cleanup() // Clear any existing polls

        const poll = async () => {
            try {
                const res = await fetch(`/api/wallet/deposit/status?id=${depositId}`)
                const data = await res.json()

                if (data.success) {
                    const { status, utr: paymentUtr, deposit: updatedDeposit } = data.data

                    if (status === 'completed') {
                        cleanup()
                        setUtr(paymentUtr)
                        setStep('success')
                        onSuccess?.(updatedDeposit?.amount || numAmount)
                        toast.success(`₹${updatedDeposit?.amount || amount} added to wallet!`)
                    } else if (status === 'failed' || status === 'expired') {
                        cleanup()
                        setStep('failed')
                        toast.error(status === 'expired' ? 'Payment expired' : 'Payment failed')
                    } else if (updatedDeposit) {
                        setTimeLeft(updatedDeposit.expiresIn)
                    }
                }
            } catch (error) {
                console.error('Status check failed', error)
            }
        }

        pollRef.current = setInterval(poll, POLL_INTERVAL)
        poll() // Initial check
    }

    // Start countdown timer
    const startCountdown = () => {
        if (countdownRef.current) clearInterval(countdownRef.current)

        countdownRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    cleanup()
                    setStep('failed')
                    return 0
                }
                return prev - 1
            })
        }, 1000)
    }

    // Format time
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    // Copy to clipboard
    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text)
        toast.success(`${label} copied!`)
    }

    // Reset dialog
    const handleReset = () => {
        cleanup()
        setStep('amount')
        setAmount('')
        setDeposit(null)
        setTimeLeft(0)
        setUtr(null)
    }

    // Close handler
    const handleClose = () => {
        if (step === 'payment') {
            // Warn user about active payment
            const confirmed = window.confirm('You have an active payment. Are you sure you want to close?')
            if (!confirmed) return
        }
        cleanup()
        handleReset()
        onClose()
    }

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
            <DialogContent className="w-[95vw] max-w-md sm:max-w-lg bg-gradient-to-b from-slate-900 to-slate-950 border-white/10 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-white">
                        <div className="p-2 rounded-lg bg-emerald-500/10">
                            <IndianRupee className="h-5 w-5 text-emerald-400" />
                        </div>
                        Add Funds via UPI
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                        {step === 'amount' && 'Enter amount to deposit via UPI payment'}
                        {step === 'payment' && 'Scan QR code or click to pay'}
                        {step === 'success' && 'Payment successful!'}
                        {step === 'failed' && 'Payment could not be completed'}
                    </DialogDescription>
                </DialogHeader>

                <AnimatePresence mode="wait">
                    {/* Amount Selection Step */}
                    {step === 'amount' && (
                        <motion.div
                            key="amount"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="space-y-5 py-4"
                        >
                            {/* Deposit Bonus Banner */}
                            {bonusPercent > 0 && (
                                <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30">
                                    <div className="p-2 rounded-lg bg-amber-500/20">
                                        <Gift className="h-5 w-5 text-amber-400" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-semibold text-amber-300 text-sm">
                                            🎁 {bonusPercent}% Deposit Bonus!
                                        </p>
                                        <p className="text-xs text-amber-400/70">
                                            Extra credits on every deposit
                                        </p>
                                    </div>
                                    <Sparkles className="h-5 w-5 text-amber-400 animate-pulse" />
                                </div>
                            )}

                            {/* Preset Amounts */}
                            <div className="grid grid-cols-4 gap-2">
                                {PRESETS.map(preset => (
                                    <button
                                        key={preset}
                                        onClick={() => setAmount(preset.toString())}
                                        className={cn(
                                            "py-4 px-2 rounded-xl font-semibold text-sm transition-all border min-h-[52px] touch-manipulation",
                                            amount === preset.toString()
                                                ? "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/25"
                                                : "bg-slate-800/50 border-white/10 text-slate-300 hover:bg-slate-800 active:bg-slate-700"
                                        )}
                                    >
                                        ₹{preset}
                                    </button>
                                ))}
                            </div>

                            {/* Custom Amount Input */}
                            <div className="relative">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-slate-400">
                                    ₹
                                </div>
                                <Input
                                    type="number"
                                    inputMode="numeric"
                                    placeholder="Enter amount"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    className="h-16 pl-10 text-xl font-semibold bg-slate-800/50 border-white/10 focus:border-emerald-500 rounded-xl"
                                    min={config.minAmount}
                                    max={config.maxAmount}
                                />
                            </div>

                            {/* Amount Info with Bonus */}
                            {numAmount > 0 && (
                                <div className="space-y-2">
                                    {/* Points Calculation */}
                                    <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-400">You'll receive</span>
                                            <span className="font-semibold text-indigo-300">
                                                {(totalAmount * pointsRate).toLocaleString()} Points
                                            </span>
                                        </div>
                                    </div>

                                    {/* Bonus Breakdown */}
                                    {bonusPercent > 0 && bonusAmount > 0 && (
                                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                                            <div className="space-y-1 text-sm">
                                                <div className="flex justify-between text-slate-400">
                                                    <span>Deposit amount</span>
                                                    <span>₹{numAmount.toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between text-amber-300">
                                                    <span>+ {bonusPercent}% Bonus</span>
                                                    <span className="font-semibold">+₹{bonusAmount.toLocaleString()}</span>
                                                </div>
                                                <div className="border-t border-white/10 pt-1 mt-1 flex justify-between font-semibold text-white">
                                                    <span>Total credit</span>
                                                    <span className="text-emerald-400">₹{totalAmount.toLocaleString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Min/Max Info */}
                            <p className="text-xs text-slate-500 text-center">
                                Min: ₹{config.minAmount} • Max: ₹{config.maxAmount.toLocaleString()}
                            </p>

                            {/* Continue Button - Bottom-sticky on mobile */}
                            <div className="sticky bottom-0 pt-2 bg-gradient-to-t from-slate-950 to-transparent -mb-4 pb-4">
                                <Button
                                    onClick={handleCreateDeposit}
                                    disabled={!amount || numAmount < config.minAmount || numAmount > config.maxAmount || isCreating}
                                    className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 rounded-xl touch-manipulation"
                                >
                                    {isCreating ? (
                                        <>
                                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                            Creating Payment...
                                        </>
                                    ) : (
                                        <>Continue to Pay ₹{amount || '0'}</>
                                    )}
                                </Button>
                            </div>
                        </motion.div>
                    )}

                    {/* Payment Step - QR Code Display */}
                    {step === 'payment' && deposit && (
                        <motion.div
                            key="payment"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="space-y-4 py-4"
                        >
                            {/* Timer */}
                            <div className={cn(
                                "flex items-center justify-center gap-2 py-2 px-4 rounded-full mx-auto w-fit",
                                timeLeft > 120 ? "bg-emerald-500/10 text-emerald-400" :
                                    timeLeft > 60 ? "bg-amber-500/10 text-amber-400" :
                                        "bg-red-500/10 text-red-400 animate-pulse"
                            )}>
                                <Clock className="h-4 w-4" />
                                <span className="font-mono font-semibold">
                                    {formatTime(timeLeft)}
                                </span>
                            </div>

                            {/* QR Code Container */}
                            <div className="relative bg-white rounded-2xl p-4 mx-auto w-fit">
                                <img
                                    src={deposit.qrCodeUrl}
                                    alt="UPI QR Code"
                                    className="w-56 h-56 sm:w-64 sm:h-64"
                                />
                                {/* Amount Badge */}
                                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-slate-900 text-white font-bold px-4 py-1 rounded-full border border-white/20 text-sm">
                                    ₹{deposit.amount}
                                </div>
                            </div>

                            {/* Order ID */}
                            <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                                <span>Order: {deposit.orderId}</span>
                                <button
                                    onClick={() => copyToClipboard(deposit.orderId, 'Order ID')}
                                    className="p-1 hover:bg-white/10 rounded touch-manipulation"
                                >
                                    <Copy className="h-3 w-3" />
                                </button>
                            </div>

                            {/* Pay Button - Sticky on mobile */}
                            <div className="sticky bottom-0 pt-2 bg-gradient-to-t from-slate-950 to-transparent">
                                <a
                                    href={deposit.paymentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block"
                                >
                                    <Button className="w-full h-14 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-semibold touch-manipulation">
                                        <Smartphone className="mr-2 h-5 w-5" />
                                        Open in UPI App
                                        <ExternalLink className="ml-2 h-4 w-4" />
                                    </Button>
                                </a>
                            </div>

                            {/* Instructions */}
                            <div className="space-y-2 p-3 rounded-xl bg-slate-800/50 border border-white/5">
                                <h4 className="font-medium text-sm text-slate-300 flex items-center gap-2">
                                    <Shield className="h-4 w-4 text-emerald-400" />
                                    Payment Instructions
                                </h4>
                                <ol className="text-xs text-slate-400 space-y-1 list-decimal list-inside">
                                    <li>Open any UPI app (GPay, PhonePe, Paytm)</li>
                                    <li>Scan the QR code or click "Open in UPI App"</li>
                                    <li>Complete the payment of ₹{deposit.amount}</li>
                                    <li>Wait for confirmation (automatically detected)</li>
                                </ol>
                            </div>

                            {/* Status Indicator */}
                            <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
                                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                Waiting for payment...
                            </div>
                        </motion.div>
                    )}

                    {/* Success Step */}
                    {step === 'success' && (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center py-8 space-y-4"
                        >
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', bounce: 0.5 }}
                                className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center"
                            >
                                <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                            </motion.div>
                            <div className="text-center space-y-1">
                                <h3 className="text-xl font-bold text-white">Payment Successful!</h3>
                                <p className="text-emerald-400 font-semibold text-lg">
                                    ₹{deposit?.amount || amount} added to wallet
                                </p>
                                {bonusPercent > 0 && bonusAmount > 0 && (
                                    <p className="text-amber-300 text-sm flex items-center justify-center gap-1">
                                        <Gift className="h-4 w-4" />
                                        Including ₹{bonusAmount} bonus!
                                    </p>
                                )}
                                {utr && (
                                    <p className="text-xs text-slate-500">UTR: {utr}</p>
                                )}
                            </div>
                            <Button
                                onClick={handleClose}
                                className="mt-4 h-12 px-8 bg-emerald-600 hover:bg-emerald-500 touch-manipulation"
                            >
                                Done
                            </Button>
                        </motion.div>
                    )}

                    {/* Failed/Expired Step */}
                    {step === 'failed' && (
                        <motion.div
                            key="failed"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center py-8 space-y-4"
                        >
                            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
                                <XCircle className="h-10 w-10 text-red-400" />
                            </div>
                            <div className="text-center space-y-1">
                                <h3 className="text-xl font-bold text-white">Payment Failed</h3>
                                <p className="text-slate-400 text-sm">
                                    The payment could not be completed or has expired.
                                </p>
                            </div>
                            <div className="flex gap-3 mt-4">
                                <Button variant="outline" onClick={handleClose} className="h-12 touch-manipulation">
                                    Cancel
                                </Button>
                                <Button onClick={handleReset} className="h-12 bg-indigo-600 hover:bg-indigo-500 touch-manipulation">
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Try Again
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    )
}
