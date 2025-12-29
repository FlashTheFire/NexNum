"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    Wallet,
    CreditCard as CreditCardIcon,
    Plus,
    Loader2,
    Shield,
    ArrowUpRight,
    ArrowDownRight,
    History,
    CheckCircle2,
    Sparkles,
    ChevronRight,
    Lock,
    Smartphone,
    Copy
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useGlobalStore } from "@/store"
import { formatPrice, formatRelativeTime, cn } from "@/lib/utils"

// Animation Variants
const fadeInUp: any = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
}

const containerVariants: any = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
}

const cardTilt: any = {
    rest: { rotateX: 0, rotateY: 0, scale: 1 },
    hover: {
        rotateX: 2,
        rotateY: 2,
        scale: 1.02,
        transition: { duration: 0.4, type: "spring" }
    }
}

const presets = [10, 25, 50, 100]

export default function WalletPage() {
    const { user, transactions, topUp } = useGlobalStore()
    const [amount, setAmount] = useState<string>("")
    const [isLoading, setIsLoading] = useState(false)
    const [selectedMethod, setSelectedMethod] = useState("upi")
    const [customFocused, setCustomFocused] = useState(false)

    // Calculate simulated "Card Number" based on User ID for consistent personalization
    const userCardLast4 = user?.id ? user.id.slice(-4).toUpperCase() : "8888"

    const recentTransactions = transactions.slice(0, 4)

    const handleTopUp = () => {
        const value = parseFloat(amount)
        if (isNaN(value) || value < 5) {
            toast.error("Minimum top-up is $5.00")
            return
        }
        setIsLoading(true)
    }

    return (
        <div className="min-h-full p-4 md:p-6 lg:p-8 relative overflow-hidden">
            {/* Background Ambience */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-20 right-20 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-20 left-20 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px]" />
            </div>

            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="relative z-10 max-w-6xl mx-auto space-y-8"
            >
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
                            My Wallet
                        </h1>
                        <p className="text-muted-foreground mt-1">Manage funds & payment methods</p>
                    </div>
                    <Button variant="outline" className="bg-card/50 backdrop-blur-xl border-white/10 hidden md:flex">
                        <History className="mr-2 h-4 w-4" />
                        Download Report
                    </Button>
                </div>

                <div className="grid lg:grid-cols-12 gap-6 md:gap-8">
                    {/* Left Column: Digital Card & Actions (5/12) */}
                    <div className="lg:col-span-12 xl:col-span-5 space-y-6">
                        {/* 3D Digital Card */}
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
                                {/* Card Background */}
                                <div className="absolute inset-0 bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4338ca]" />
                                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />

                                {/* Geometric Shapes */}
                                <div className="absolute top-0 right-0 w-[80%] h-[80%] bg-gradient-to-b from-white/10 to-transparent rounded-bl-full blur-2xl transform translate-x-1/4 -translate-y-1/4" />
                                <div className="absolute bottom-0 left-0 w-[60%] h-[60%] bg-gradient-to-t from-cyan-500/20 to-transparent rounded-tr-full blur-3xl transform -translate-x-1/4 translate-y-1/4" />

                                {/* Glass Overlay */}
                                <div className="absolute inset-0 bg-white/5 backdrop-blur-[2px] border border-white/10 rounded-3xl" />

                                {/* Card Content */}
                                <div className="relative h-full p-6 md:p-8 flex flex-col justify-between">
                                    <div className="flex justify-between items-start">
                                        <div className="space-y-1">
                                            <p className="text-xs font-medium text-indigo-200 tracking-[0.2em]">CURRENT BALANCE</p>
                                            <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight drop-shadow-lg">
                                                {formatPrice(user?.balance || 0)}
                                            </h2>
                                        </div>
                                        <div className="h-10 w-10 md:h-12 md:w-12 rounded-xl bg-gradient-to-br from-white/20 to-white/5 backdrop-blur-md border border-white/20 flex items-center justify-center">
                                            <Sparkles className="h-5 w-5 md:h-6 md:w-6 text-indigo-100" />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {/* Chip */}
                                        <div className="w-12 h-9 rounded-lg bg-gradient-to-br from-amber-200 to-amber-400 opacity-80 shadow-inner border border-amber-300/30 flex items-center justify-center">
                                            <div className="w-8 h-5 border border-black/10 rounded opacity-50" />
                                        </div>

                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-sm text-indigo-200 font-mono tracking-widest mb-1">
                                                    **** **** **** {userCardLast4}
                                                </p>
                                                <p className="text-sm font-medium text-white tracking-wide uppercase">
                                                    {user?.name || "NEXNUM MEMBER"}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-indigo-300 font-bold tracking-widest">VALID THRU</p>
                                                <p className="text-sm font-mono text-white">12/28</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>

                        {/* Quick Actions Grid */}
                        <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-3">
                            <Button className="h-12 rounded-xl bg-card/40 border border-white/5 hover:bg-white/5 backdrop-blur-sm" variant="outline">
                                <ArrowDownRight className="mr-2 h-4 w-4 text-emerald-400" />
                                Request
                            </Button>
                            <Button className="h-12 rounded-xl bg-card/40 border border-white/5 hover:bg-white/5 backdrop-blur-sm" variant="outline">
                                <ArrowUpRight className="mr-2 h-4 w-4 text-rose-400" />
                                Withdraw
                            </Button>
                        </motion.div>
                    </div>

                    {/* Right Column: Top-Up & History (7/12) */}
                    <div className="lg:col-span-12 xl:col-span-7 space-y-6">
                        {/* Top Up Panel */}
                        <motion.div variants={fadeInUp}>
                            <Card className="border-white/10 bg-card/30 backdrop-blur-xl overflow-hidden shadow-xl shadow-black/5">
                                <CardHeader>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500">
                                            <Wallet className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <CardTitle>Add Funds</CardTitle>
                                            <CardDescription>Instant top-up via secure gateway</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <AnimatePresence mode="wait">
                                        {!isLoading ? (
                                            <motion.div
                                                key="selection"
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 20 }}
                                                className="space-y-6"
                                            >
                                                {/* Presets */}
                                                <div className="grid grid-cols-4 gap-3">
                                                    {presets.map((preset) => {
                                                        const isActive = amount === preset.toString()
                                                        return (
                                                            <button
                                                                key={preset}
                                                                onClick={() => setAmount(preset.toString())}
                                                                className={cn(
                                                                    "relative h-14 rounded-xl font-semibold transition-all duration-300 border",
                                                                    isActive
                                                                        ? "bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/25 scale-[1.02]"
                                                                        : "bg-card/50 border-white/5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                                                                )}
                                                            >
                                                                ${preset}
                                                            </button>
                                                        )
                                                    })}
                                                </div>

                                                {/* Custom Amount */}
                                                <div className="relative group">
                                                    <div className={cn(
                                                        "absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-xl blur transition-opacity duration-500",
                                                        customFocused ? "opacity-100" : "opacity-0"
                                                    )} />
                                                    <div className="relative flex items-center bg-card/50 border border-white/10 rounded-xl px-4 h-16 transition-colors group-hover:border-white/20">
                                                        <span className="text-xl font-medium text-muted-foreground mr-2">$</span>
                                                        <Input
                                                            type="number"
                                                            placeholder="Enter custom amount..."
                                                            value={amount}
                                                            onChange={(e) => setAmount(e.target.value)}
                                                            onFocus={() => setCustomFocused(true)}
                                                            onBlur={() => setCustomFocused(false)}
                                                            className="border-none bg-transparent h-full text-2xl font-bold placeholder:font-normal focus-visible:ring-0 p-0"
                                                        />
                                                        {amount && (
                                                            <button
                                                                onClick={() => setAmount("")}
                                                                className="p-1 rounded-full hover:bg-white/10 text-muted-foreground transition-colors"
                                                            >
                                                                <span className="sr-only">Clear</span>
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Payment Methods Selection */}
                                                <div className="space-y-3">
                                                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Payment Method</label>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div
                                                            onClick={() => setSelectedMethod("upi")}
                                                            className={cn(
                                                                "relative p-4 rounded-xl border cursor-pointer transition-all duration-300 overflow-hidden group",
                                                                selectedMethod === "upi"
                                                                    ? "bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border-indigo-500/50"
                                                                    : "bg-card/30 border-white/5 hover:border-white/10"
                                                            )}
                                                        >
                                                            <div className={cn(
                                                                "absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 opacity-0 transition-opacity duration-300",
                                                                selectedMethod === "upi" && "opacity-100"
                                                            )} />
                                                            <div className="relative flex flex-col items-center gap-3 text-center">
                                                                <div className={cn(
                                                                    "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300",
                                                                    selectedMethod === "upi" ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30" : "bg-white/5 text-muted-foreground group-hover:bg-white/10"
                                                                )}>
                                                                    <Smartphone className="h-6 w-6" />
                                                                </div>
                                                                <div>
                                                                    <p className={cn("font-bold text-sm", selectedMethod === "upi" ? "text-white" : "text-muted-foreground")}>UPI Payment</p>
                                                                    <p className="text-[10px] text-muted-foreground/60">GPay, PhonePe, Paytm</p>
                                                                </div>
                                                            </div>
                                                            {selectedMethod === "upi" && (
                                                                <div className="absolute top-3 right-3">
                                                                    <CheckCircle2 className="h-5 w-5 text-indigo-400" />
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div
                                                            onClick={() => setSelectedMethod("crypto")}
                                                            className={cn(
                                                                "relative p-4 rounded-xl border cursor-pointer transition-all duration-300 overflow-hidden group",
                                                                selectedMethod === "crypto"
                                                                    ? "bg-gradient-to-br from-amber-500/20 to-orange-500/20 border-amber-500/50"
                                                                    : "bg-card/30 border-white/5 hover:border-white/10"
                                                            )}
                                                        >
                                                            <div className={cn(
                                                                "absolute inset-0 bg-gradient-to-br from-amber-500/10 to-orange-500/10 opacity-0 transition-opacity duration-300",
                                                                selectedMethod === "crypto" && "opacity-100"
                                                            )} />
                                                            <div className="relative flex flex-col items-center gap-3 text-center">
                                                                <div className={cn(
                                                                    "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300",
                                                                    selectedMethod === "crypto" ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30" : "bg-white/5 text-muted-foreground group-hover:bg-white/10"
                                                                )}>
                                                                    <Shield className="h-6 w-6" />
                                                                </div>
                                                                <div>
                                                                    <p className={cn("font-bold text-sm", selectedMethod === "crypto" ? "text-white" : "text-muted-foreground")}>Crypto</p>
                                                                    <p className="text-[10px] text-muted-foreground/60">USDT, BTC, ETH</p>
                                                                </div>
                                                            </div>
                                                            {selectedMethod === "crypto" && (
                                                                <div className="absolute top-3 right-3">
                                                                    <CheckCircle2 className="h-5 w-5 text-amber-400" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <Button
                                                    onClick={handleTopUp}
                                                    disabled={!amount || parseFloat(amount) < 5}
                                                    className={cn(
                                                        "w-full h-12 text-base font-semibold border-none shadow-lg transition-all duration-300",
                                                        selectedMethod === "upi"
                                                            ? "bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 shadow-indigo-500/25"
                                                            : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-amber-500/25"
                                                    )}
                                                >
                                                    Continue to Pay {amount && formatPrice(parseFloat(amount))}
                                                </Button>
                                            </motion.div>
                                        ) : (
                                            <motion.div
                                                key="payment"
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.95 }}
                                                className="space-y-6 py-2"
                                            >
                                                {/* Header Step */}
                                                <div className="text-center space-y-2">
                                                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground font-mono">
                                                        <span>Time Remaining:</span>
                                                        <span className="text-white font-bold">14:59</span>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">
                                                        Scan the QR code below to complete your payment of <span className="text-white font-bold">{formatPrice(parseFloat(amount))}</span>
                                                    </p>
                                                </div>

                                                {/* QR Display */}
                                                <div className="flex justify-center">
                                                    <div className="relative p-4 bg-white rounded-2xl shadow-xl shadow-white/5 group">
                                                        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 blur-xl opacity-50 group-hover:opacity-100 transition-opacity" />
                                                        {/* Mock QR */}
                                                        <img
                                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=nexnum-pay-${selectedMethod}-${amount}`}
                                                            alt="Payment QR"
                                                            className="relative w-48 h-48 rounded-lg mix-blend-multiply"
                                                        />

                                                        {selectedMethod === "upi" && (
                                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                                <div className="bg-white p-2 rounded-full shadow-lg">
                                                                    <Smartphone className="h-6 w-6 text-indigo-600" />
                                                                </div>
                                                            </div>
                                                        )}
                                                        {selectedMethod === "crypto" && (
                                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                                <div className="bg-white p-2 rounded-full shadow-lg">
                                                                    <Shield className="h-6 w-6 text-amber-500" />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="space-y-3">
                                                    {selectedMethod === "upi" ? (
                                                        <Button
                                                            onClick={() => toast.info("Redirecting to UPI App...")}
                                                            className="w-full h-12 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-semibold shadow-lg shadow-indigo-500/20"
                                                        >
                                                            Open UPI App
                                                            <ArrowUpRight className="ml-2 h-4 w-4" />
                                                        </Button>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2 p-3 bg-black/20 rounded-xl border border-white/5">
                                                                <p className="flex-1 font-mono text-xs text-muted-foreground truncate">
                                                                    0x71C7656EC7ab88b098defB751B7401B5f6d8976F
                                                                </p>
                                                                <Button
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    className="h-8 w-8 hover:bg-white/10"
                                                                    onClick={() => {
                                                                        navigator.clipboard.writeText("0x71C7656EC7ab88b098defB751B7401B5f6d8976F")
                                                                        toast.success("Wallet Address Copied")
                                                                    }}
                                                                >
                                                                    <Copy className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                            <p className="text-[10px] text-center text-amber-500/80">
                                                                *Send only USDT (ERC20) to this address
                                                            </p>
                                                        </div>
                                                    )}

                                                    <Button
                                                        variant="ghost"
                                                        onClick={() => setIsLoading(false)}
                                                        className="w-full hover:bg-white/5 text-muted-foreground"
                                                    >
                                                        Cancel Payment
                                                    </Button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {!isLoading && (
                                        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/70 border-t border-white/5 pt-4">
                                            <Shield className="h-3 w-3" />
                                            <span>256-bit SSL Encrypted Payment</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Recent Activity Mini */}
                        <motion.div variants={fadeInUp}>
                            <div className="flex items-center justify-between mb-4 px-1">
                                <h3 className="font-semibold text-lg">Recent Activity</h3>
                                <Button variant="link" className="text-muted-foreground hover:text-white h-auto p-0">
                                    View All <ChevronRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                            <div className="space-y-3">
                                {recentTransactions.length > 0 ? (
                                    recentTransactions.map((tx) => (
                                        <div
                                            key={tx.id}
                                            className="flex items-center justify-between p-4 rounded-xl bg-card/30 border border-white/5 hover:bg-card/50 transition-colors"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center",
                                                    tx.type === 'topup' ? "bg-emerald-500/10 text-emerald-500" :
                                                        tx.type === 'purchase' ? "bg-rose-500/10 text-rose-500" :
                                                            "bg-blue-500/10 text-blue-500"
                                                )}>
                                                    {tx.type === 'topup' ? <ArrowDownRight className="h-5 w-5" /> :
                                                        tx.type === 'purchase' ? <ArrowUpRight className="h-5 w-5" /> :
                                                            <Wallet className="h-5 w-5" />}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-sm text-white">{tx.description}</p>
                                                    <p className="text-xs text-muted-foreground">{formatRelativeTime(tx.createdAt)}</p>
                                                </div>
                                            </div>
                                            <span className={cn(
                                                "font-bold font-mono",
                                                tx.amount > 0 ? "text-emerald-400" : "text-white"
                                            )}>
                                                {tx.amount > 0 ? "+" : ""}{formatPrice(tx.amount)}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-muted-foreground text-sm bg-card/20 rounded-xl border border-dashed border-white/10">
                                        No recent transactions
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
