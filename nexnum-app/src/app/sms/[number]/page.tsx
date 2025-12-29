"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
    Phone,
    MessageSquare,
    Clock,
    Copy,
    Check,
    ArrowLeft,
    RefreshCw,
    Inbox,
    Sparkles,
    Shield,
    Zap,
    Bell,
    MoreHorizontal
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useGlobalStore } from "@/store"
import { formatRelativeTime } from "@/lib/utils"
import { toast } from "sonner"

const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } }
}

const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08 }
    }
}

// OTP Code Extractor
function extractOTPCode(text: string): string | null {
    const patterns = [
        /\b(\d{4,8})\b/,  // 4-8 digit codes
        /code[:\s]+(\d{4,8})/i,
        /is[:\s]+(\d{4,8})/i,
        /G-(\d{4,8})/i,  // Google format
    ]

    for (const pattern of patterns) {
        const match = text.match(pattern)
        if (match) return match[1]
    }
    return null
}

// Premium SMS Message Component
function SMSMessageCard({ sms, index }: { sms: any; index: number }) {
    const [copied, setCopied] = useState(false)
    const otpCode = extractOTPCode(sms.text)

    const handleCopyCode = () => {
        if (otpCode) {
            navigator.clipboard.writeText(otpCode)
            setCopied(true)
            toast.success("Code copied!", { description: otpCode })
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const handleCopyFull = () => {
        navigator.clipboard.writeText(sms.text)
        toast.success("Message copied!")
    }

    // Determine service color based on sender
    const getServiceColor = () => {
        const from = sms.from.toLowerCase()
        if (from.includes('whatsapp') || sms.text.toLowerCase().includes('whatsapp')) {
            return { bg: 'from-green-500/20 to-emerald-500/20', border: 'border-green-500/30', icon: 'text-green-500' }
        }
        if (from.includes('google') || sms.text.toLowerCase().includes('google') || sms.text.startsWith('G-')) {
            return { bg: 'from-blue-500/20 to-cyan-500/20', border: 'border-blue-500/30', icon: 'text-blue-500' }
        }
        if (from.includes('telegram') || sms.text.toLowerCase().includes('telegram')) {
            return { bg: 'from-indigo-500/20 to-violet-500/20', border: 'border-indigo-500/30', icon: 'text-indigo-500' }
        }
        return { bg: 'from-slate-500/20 to-gray-500/20', border: 'border-slate-500/30', icon: 'text-slate-500' }
    }

    const colors = getServiceColor()

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: index * 0.05, type: "spring", stiffness: 300 }}
            className="group"
        >
            <div className={`relative p-4 rounded-2xl bg-gradient-to-r ${colors.bg} ${colors.border} border backdrop-blur-sm overflow-hidden transition-all duration-300 hover:border-opacity-50`}>
                {/* Shimmer on hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />

                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg bg-background/50 ${colors.icon}`}>
                            <MessageSquare className="h-4 w-4" />
                        </div>
                        <div>
                            <Badge variant="outline" className="font-mono text-xs">
                                {sms.from}
                            </Badge>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(sms.receivedAt)}
                        </span>
                        <button
                            onClick={handleCopyFull}
                            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                        >
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                        </button>
                    </div>
                </div>

                {/* Message Content */}
                <p className="text-sm leading-relaxed mb-3">{sms.text}</p>

                {/* OTP Code Section */}
                {otpCode && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="flex items-center justify-between p-3 rounded-xl bg-background/50 border border-white/10"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-500/20">
                                <Zap className="h-4 w-4 text-emerald-500" />
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Verification Code</p>
                                <p className="font-mono font-bold text-lg tracking-widest text-emerald-400">
                                    {otpCode}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="emerald"
                            size="sm"
                            onClick={handleCopyCode}
                            className="gap-2 rounded-xl"
                        >
                            {copied ? (
                                <>
                                    <Check className="h-4 w-4" />
                                    Copied!
                                </>
                            ) : (
                                <>
                                    <Copy className="h-4 w-4" />
                                    Copy Code
                                </>
                            )}
                        </Button>
                    </motion.div>
                )}
            </div>
        </motion.div>
    )
}

export default function SMSPage() {
    const params = useParams()
    const router = useRouter()
    const { activeNumbers, smsMessages, addSMS, _hasHydrated } = useGlobalStore()
    const [copied, setCopied] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [timeLeft, setTimeLeft] = useState(0)

    const phoneNumber = decodeURIComponent(params.number as string)
    const virtualNumber = activeNumbers.find(n => n.number === phoneNumber)
    const messages = virtualNumber ? (smsMessages[virtualNumber.id] || []) : []

    // Update timer every second
    useEffect(() => {
        if (!virtualNumber) return

        const updateTimer = () => {
            const expiresAt = new Date(virtualNumber.expiresAt || Date.now())
            const now = new Date()
            const remaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000))
            setTimeLeft(remaining)
        }

        updateTimer()
        const interval = setInterval(updateTimer, 1000)
        return () => clearInterval(interval)
    }, [virtualNumber])

    // Auto-refresh simulation
    useEffect(() => {
        if (!virtualNumber) return

        const interval = setInterval(() => {
            if (Math.random() < 0.1) {
                const demoMessages = [
                    "Your verification code is: 847293",
                    "G-192847 is your Google verification code.",
                    "Your WhatsApp code: 583921",
                    "Telegram code: 49281",
                    "Your OTP is 673829. Valid for 5 minutes.",
                ]

                const randomMessage = demoMessages[Math.floor(Math.random() * demoMessages.length)]

                addSMS(virtualNumber.id, {
                    id: `sms-${Date.now()}`,
                    numberId: virtualNumber.id,
                    from: `+1${Math.floor(Math.random() * 9000000000 + 1000000000)}`,
                    text: randomMessage,
                    receivedAt: new Date().toISOString(),
                })

                toast.success("New SMS received!", {
                    description: randomMessage.substring(0, 40) + "...",
                    icon: <MessageSquare className="h-4 w-4 text-emerald-500" />
                })
            }
        }, 10000)

        return () => clearInterval(interval)
    }, [virtualNumber, addSMS])

    const handleCopyNumber = () => {
        navigator.clipboard.writeText(phoneNumber)
        setCopied(true)
        toast.success("Number copied!")
        setTimeout(() => setCopied(false), 2000)
    }

    const handleRefresh = () => {
        setIsRefreshing(true)
        toast.info("Checking for new messages...")
        setTimeout(() => {
            setIsRefreshing(false)
            toast.success("Up to date!")
        }, 1000)
    }

    const minutesLeft = Math.floor(timeLeft / 60)
    const secondsLeft = timeLeft % 60

    // Loading state
    if (!_hasHydrated) {
        return (
            <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading...</p>
                </div>
            </div>
        )
    }

    // Number not found
    if (!virtualNumber) {
        return (
            <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-md w-full"
                >
                    <Card className="border-white/10 bg-card/50 backdrop-blur-xl">
                        <CardContent className="p-8 text-center">
                            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-red-500/10 to-orange-500/10 flex items-center justify-center">
                                <Phone className="h-10 w-10 text-red-500/50" />
                            </div>
                            <h2 className="text-2xl font-bold mb-2">Number Not Found</h2>
                            <p className="text-muted-foreground mb-6">
                                This number is no longer active or doesn't exist in your account.
                            </p>
                            <Button onClick={() => router.push("/dashboard")} className="gap-2 rounded-xl">
                                <ArrowLeft className="h-4 w-4" />
                                Back to Dashboard
                            </Button>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>
        )
    }

    return (
        <div className="min-h-full relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-transparent rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-gradient-to-tr from-emerald-500/10 via-teal-500/10 to-transparent rounded-full blur-3xl" />
                <div className="mesh-background absolute inset-0 opacity-20" />
            </div>

            <div className="p-4 md:p-6 lg:p-8 relative z-10">
                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={staggerContainer}
                    className="max-w-4xl mx-auto space-y-6"
                >
                    {/* Header */}
                    <motion.div variants={fadeInUp} className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => router.push("/dashboard")}
                                className="rounded-xl hover:bg-white/10"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                            <div>
                                <h1 className="text-2xl md:text-3xl font-bold">
                                    <span className="gradient-text">SMS</span> Inbox
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    Real-time message viewer
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                                className="rounded-xl border-white/10"
                            >
                                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                    </motion.div>

                    {/* Premium Number Card */}
                    <motion.div variants={fadeInUp}>
                        <Card className="relative overflow-hidden border-white/10 bg-gradient-to-br from-card/80 to-card/50 backdrop-blur-xl">
                            {/* Decorative Elements */}
                            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 rounded-full blur-3xl" />
                            <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 rounded-full blur-3xl" />

                            <CardContent className="p-6 relative">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    {/* Left: Number Info */}
                                    <div className="flex items-center gap-4">
                                        <div className="relative">
                                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                                <Phone className="h-6 w-6 text-white" />
                                            </div>
                                            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-background">
                                                <Check className="h-3 w-3 text-white" />
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="font-mono font-bold text-xl md:text-2xl">
                                                    {phoneNumber}
                                                </p>
                                                <button
                                                    onClick={handleCopyNumber}
                                                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                                                >
                                                    {copied ? (
                                                        <Check className="h-4 w-4 text-emerald-400" />
                                                    ) : (
                                                        <Copy className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <span>{virtualNumber.serviceName}</span>
                                                <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                                                <span>{virtualNumber.countryName}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Stats */}
                                    <div className="flex items-center gap-3">
                                        {/* Timer */}
                                        <div className={`px-4 py-2 rounded-xl ${minutesLeft > 5
                                            ? 'bg-emerald-500/10 border border-emerald-500/20'
                                            : 'bg-red-500/10 border border-red-500/20'
                                            }`}>
                                            <p className="text-xs text-muted-foreground mb-0.5">Time Left</p>
                                            <p className={`font-mono font-bold text-lg ${minutesLeft > 5 ? 'text-emerald-400' : 'text-red-400'
                                                }`}>
                                                {minutesLeft}:{secondsLeft.toString().padStart(2, '0')}
                                            </p>
                                        </div>

                                        {/* SMS Count */}
                                        <div className="px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                                            <p className="text-xs text-muted-foreground mb-0.5">Messages</p>
                                            <p className="font-bold text-lg text-cyan-400">{messages.length}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Status Bar */}
                                <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            Listening for SMS
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <Shield className="h-3 w-3" />
                                            Secure
                                        </span>
                                    </div>
                                    <Badge variant="secondary" className="text-xs gap-1">
                                        <Sparkles className="h-3 w-3" />
                                        Auto-refresh
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Messages Section */}
                    <motion.div variants={fadeInUp}>
                        <Card className="border-white/10 bg-card/50 backdrop-blur-xl">
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20">
                                            <Inbox className="h-4 w-4 text-cyan-500" />
                                        </div>
                                        Received Messages
                                        {messages.length > 0 && (
                                            <Badge variant="secondary" className="ml-2 text-xs">
                                                {messages.length}
                                            </Badge>
                                        )}
                                    </CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {messages.length === 0 ? (
                                    <div className="text-center py-16">
                                        <motion.div
                                            animate={{ y: [0, -10, 0] }}
                                            transition={{ duration: 3, repeat: Infinity }}
                                            className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 flex items-center justify-center border border-cyan-500/20"
                                        >
                                            <Inbox className="h-12 w-12 text-cyan-500/50" />
                                        </motion.div>
                                        <h3 className="text-xl font-semibold mb-2">Waiting for Messages</h3>
                                        <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                                            Use this number to receive verification codes. Messages will appear here instantly.
                                        </p>
                                        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            <span>Auto-refreshing every 10 seconds</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <AnimatePresence>
                                            {[...messages].reverse().map((sms, i) => (
                                                <SMSMessageCard key={sms.id} sms={sms} index={i} />
                                            ))}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Tips Banner */}
                    <motion.div variants={fadeInUp}>
                        <Card className="border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-orange-500/5 backdrop-blur-xl">
                            <CardContent className="p-4 flex items-center gap-4">
                                <div className="p-3 rounded-xl bg-amber-500/20">
                                    <Sparkles className="h-5 w-5 text-amber-500" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium">Pro Tip</p>
                                    <p className="text-sm text-muted-foreground">
                                        Click on any verification code to copy it instantly. Messages auto-refresh while this page is open.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </motion.div>
            </div>
        </div>
    )
}
