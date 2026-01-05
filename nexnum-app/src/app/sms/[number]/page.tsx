"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
    ArrowLeft,
    ArrowDownRight,
    ArrowUpRight,
    Plus,
    XCircle,
    RefreshCw,
    Inbox,
    Sparkles,
    Phone,
    Shield,
    MoreHorizontal,
    Check,
    Trash2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useGlobalStore } from "@/store"
import { toast } from "sonner"

// Import new premium components
import { SMSBackground, SMSNumberCard, SMSMessageCard } from "./components"
import { useSMS } from "@/hooks/use-sms"
import LoadingScreen from "@/components/ui/LoadingScreen"

const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08 }
    }
}

const fadeInUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }
}

export default function SMSPage() {
    const params = useParams()
    const router = useRouter()
    const { activeNumbers, _hasHydrated } = useGlobalStore()
    const [timeLeft, setTimeLeft] = useState(0)
    const [isMenuOpen, setIsMenuOpen] = useState(false)

    const phoneNumber = decodeURIComponent(params.number as string)
    const virtualNumber = activeNumbers.find(n => n.number === phoneNumber)

    // Use Professional Backend Hook
    // This replaces client-side simulation with real API polling
    const { messages, refresh, isValidating } = useSMS(virtualNumber?.number || '')

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

    const handleRefresh = async () => {
        toast.promise(refresh(), {
            loading: 'Checking for new messages...',
            success: 'Inbox updated',
            error: 'Failed to refresh'
        })
    }

    const minutesLeft = Math.floor(timeLeft / 60)
    const secondsLeft = timeLeft % 60

    // Loading state with LoadingScreen
    if (!_hasHydrated) {
        return <LoadingScreen status="Opening Secure Channel" />
    }

    // Number not found
    if (!virtualNumber) {
        return (
            <div className="min-h-screen relative">
                <SMSBackground />
                <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="max-w-md w-full"
                    >
                        <Card className="border-white/10 bg-[#12141a]/80 backdrop-blur-xl">
                            <CardContent className="p-8 text-center">
                                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-red-500/10 to-orange-500/10 flex items-center justify-center border border-red-500/20">
                                    <Phone className="h-10 w-10 text-red-500/50" />
                                </div>
                                <h2 className="text-2xl font-bold mb-2 text-white">Number Not Found</h2>
                                <p className="text-gray-500 mb-6">
                                    This number is no longer active or doesn't exist in your account.
                                </p>
                                <Button
                                    onClick={() => router.push("/dashboard")}
                                    className="gap-2 rounded-xl bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(72,100%,55%)]"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    Back to Dashboard
                                </Button>
                            </CardContent>
                        </Card>
                    </motion.div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen relative">
            <SMSBackground />

            <div className="relative z-10 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={staggerContainer}
                    className="space-y-6 lg:space-y-8"
                >
                    {/* Header - Full Width */}
                    <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center justify-between w-full sm:w-auto sm:justify-start gap-4">
                            <div className="flex items-center gap-4">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => router.push("/dashboard")}
                                    className="rounded-xl hover:bg-white/10 text-gray-400 hover:text-white shrink-0"
                                >
                                    <ArrowLeft className="h-5 w-5" />
                                </Button>
                                <div>
                                    <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                                        <span className="relative flex h-3 w-3">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--neon-lime))] opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-3 w-3 bg-[hsl(var(--neon-lime))]"></span>
                                        </span>
                                        SMS Inbox
                                    </h1>
                                    <p className="text-sm text-gray-500 mt-1">
                                        Real-time message viewer
                                    </p>
                                </div>
                            </div>

                            {/* Mobile Refresh Button */}
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handleRefresh}
                                disabled={isValidating}
                                className="sm:hidden rounded-xl border-white/10 bg-white/[0.03] hover:bg-white/10 text-gray-300 shadow-sm"
                            >
                                <RefreshCw className={`h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto hidden sm:flex">
                            <Badge variant="outline" className="hidden md:flex border-white/10 text-gray-400 px-3 py-1.5 gap-2">
                                <Shield className="w-3.5 h-3.5" />
                                End-to-End Encrypted
                            </Badge>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleRefresh}
                                disabled={isValidating}
                                className="rounded-xl border-white/10 bg-white/[0.03] hover:bg-white/10 text-gray-300 gap-2 px-4 shadow-sm"
                            >
                                <RefreshCw className={`h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} />
                                <span className="hidden sm:inline">Refresh</span>
                            </Button>
                        </div>
                    </motion.div>

                    {/* Main Content Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 lg:gap-8 items-start">

                        {/* Left Column: Number Details & Tips */}
                        <div className="space-y-3 lg:sticky lg:top-8">
                            <motion.div variants={fadeInUp}>
                                <SMSNumberCard
                                    phoneNumber={phoneNumber}
                                    serviceName={virtualNumber.serviceName}
                                    countryName={virtualNumber.countryName}
                                    minutesLeft={minutesLeft}
                                    secondsLeft={secondsLeft}
                                    messageCount={messages.length}
                                />
                            </motion.div>

                            {/* Action Buttons */}
                            <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-3">
                                <button className="inline-flex items-center justify-center text-sm font-medium h-12 rounded-xl bg-card/40 border border-emerald-500/20 hover:bg-emerald-500/10 backdrop-blur-sm transition-colors text-white">
                                    <Plus className="mr-2 h-4 w-4 text-emerald-400" />
                                    Next Number
                                </button>
                                <button className="inline-flex items-center justify-center text-sm font-medium h-12 rounded-xl bg-card/40 border border-red-500/20 hover:bg-red-500/10 backdrop-blur-sm transition-colors text-white">
                                    <XCircle className="mr-2 h-4 w-4 text-red-400" />
                                    Cancel Number
                                </button>
                            </motion.div>

                            <motion.div variants={fadeInUp} className="hidden lg:block">
                                <Card className="border-amber-500/10 bg-gradient-to-br from-amber-500/[0.02] to-transparent backdrop-blur-xl">
                                    <CardContent className="p-5 flex gap-4">
                                        <div className="p-2.5 h-fit rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500">
                                            <Sparkles className="h-4.5 w-4.5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-amber-100 mb-1">Pro Tip</p>
                                            <p className="text-xs leading-relaxed text-amber-500/70">
                                                Messages auto-refresh every 10s. Click on any verification code to copy it instantly.
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        </div>

                        {/* Right Column: Messages Feed */}
                        <motion.div variants={fadeInUp} className="min-h-[500px]">
                            <Card className="border-white/[0.06] bg-[#0f1115]/50 backdrop-blur-xl h-full shadow-2xl overflow-hidden flex flex-col">
                                <CardHeader className="border-b border-white/[0.04] p-5 md:p-6 bg-white/[0.01] flex flex-row items-center justify-between sticky top-0 z-20 backdrop-blur-md">
                                    <div className="flex items-center gap-3">
                                        <CardTitle className="flex items-center gap-3 text-lg font-medium text-white">
                                            <Inbox className="h-5 w-5 text-gray-400" />
                                            Received Messages
                                        </CardTitle>
                                        <Badge variant="secondary" className="bg-white/[0.06] text-gray-300 pointer-events-none">
                                            {messages.length} New
                                        </Badge>
                                    </div>

                                    {/* Professional 3-Dot Menu */}
                                    <div className="relative">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                                        >
                                            <MoreHorizontal className="h-5 w-5" />
                                        </Button>

                                        {/* Dropdown Backdrop (Click outside to close) */}
                                        {isMenuOpen && (
                                            <div
                                                className="fixed inset-0 z-40 bg-transparent"
                                                onClick={() => setIsMenuOpen(false)}
                                            />
                                        )}

                                        {/* Dropdown Content */}
                                        <AnimatePresence>
                                            {isMenuOpen && (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                                    transition={{ duration: 0.1 }}
                                                    className="absolute right-0 mt-2 w-48 rounded-xl border border-white/10 bg-[#1a1d24] shadow-xl z-50 overflow-hidden"
                                                >
                                                    <div className="p-1">
                                                        <button
                                                            onClick={() => {
                                                                toast.success("All messages marked as read")
                                                                setIsMenuOpen(false)
                                                            }}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-left"
                                                        >
                                                            <Check className="h-4 w-4" />
                                                            Mark all as read
                                                        </button>
                                                        <div className="h-px bg-white/5 my-1" />
                                                        <button
                                                            onClick={() => {
                                                                toast.error("Cannot clear history in demo mode")
                                                                setIsMenuOpen(false)
                                                            }}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors text-left"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                            Clear history
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {/* p-0 to allow scrollbar to hug edges, padding added inside */}

                                    {/* Scrollable Container (Limit to ~3 items height, approx 400px) */}
                                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-5 md:p-6 space-y-4">
                                        {messages.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-10 text-center">
                                                <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-4">
                                                    <div className="relative">
                                                        <Inbox className="h-6 w-6 text-gray-600" />
                                                        <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                        </span>
                                                    </div>
                                                </div>
                                                <h3 className="text-base font-medium text-white mb-1">Waiting for Messages</h3>
                                                <p className="text-xs text-gray-500 max-w-xs leading-relaxed">
                                                    We're listening for incoming SMS...
                                                </p>
                                            </div>
                                        ) : (
                                            <AnimatePresence mode="popLayout">
                                                {[...messages].map((sms, i) => (
                                                    <SMSMessageCard key={sms.id} sms={sms} index={i} />
                                                ))}
                                            </AnimatePresence>
                                        )}
                                    </div>

                                    {/* CSS for custom scrollbar injected here for simplicity */}
                                    <style jsx global>{`
                                        .custom-scrollbar::-webkit-scrollbar {
                                            width: 6px;
                                        }
                                        .custom-scrollbar::-webkit-scrollbar-track {
                                            background: rgba(255, 255, 255, 0.02);
                                        }
                                        .custom-scrollbar::-webkit-scrollbar-thumb {
                                            background: rgba(255, 255, 255, 0.1);
                                            border-radius: 10px;
                                        }
                                        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                                            background: rgba(255, 255, 255, 0.2);
                                        }
                                    `}</style>
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Mobile Tip (visible only on mobile) */}
                        <motion.div variants={fadeInUp} className="lg:hidden">
                            <Card className="border-amber-500/10 bg-amber-500/[0.02]">
                                <CardContent className="p-4 flex items-center gap-3">
                                    <Sparkles className="h-4 w-4 text-amber-500/70" />
                                    <p className="text-xs text-amber-500/70">
                                        Auto-refreshing every 10s • Click codes to copy
                                    </p>
                                </CardContent>
                            </Card>
                        </motion.div>

                    </div>
                </motion.div>
            </div>
        </div>
    )
}
