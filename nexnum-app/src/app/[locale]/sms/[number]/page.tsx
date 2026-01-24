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
    Trash2,
    Globe,
    Search
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useGlobalStore } from "@/store"
import { toast } from "sonner"
import { cn } from "@/lib/utils/utils"
import { useTranslations } from "next-intl"

// Import new premium components
import { SMSBackground, SMSNumberCard, SMSMessageCard } from "./components"
import { useSMS } from "@/hooks/use-sms"
import LoadingScreen from "@/components/ui/LoadingScreen"
import LanguageSwitcher from "@/components/common/LanguageSwitcher"

const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.08 }
    }
}

const fadeInLeft = {
    hidden: { opacity: 0, x: -30 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } }
}

export default function SMSPage() {
    const params = useParams()
    const router = useRouter()
    const { activeNumbers, _hasHydrated, fetchNumbers, isLoadingNumbers, cancelNumber, purchaseNumber, completeNumber } = useGlobalStore()
    const [timeLeft, setTimeLeft] = useState(0)
    const [isMenuOpen, setIsMenuOpen] = useState(false)

    // Action button states
    const [isNextLoading, setIsNextLoading] = useState(false)
    const [isCancelLoading, setIsCancelLoading] = useState(false)
    const [showCancelConfirm, setShowCancelConfirm] = useState(false)
    const [isCompleting, setIsCompleting] = useState(false)
    const t = useTranslations('smsPage')

    const identifier = decodeURIComponent(params.number as string)
    const virtualNumber = activeNumbers.find(n => n.id === identifier || n.number === identifier)

    // Fallback: If not found in store, try to fetch specific number (could be expired/cancelled)
    const [localNumber, setLocalNumber] = useState<any>(null)
    const [isFetchingLocal, setIsFetchingLocal] = useState(false)

    useEffect(() => {
        if (_hasHydrated && !virtualNumber && !isLoadingNumbers && !localNumber && !isFetchingLocal) {
            // 1. Try refreshing store first (maybe it's just new)
            fetchNumbers()

            // 2. If valid UUID, try fetching specific number details
            if (identifier.includes('-')) {
                setIsFetchingLocal(true)
                import("@/lib/api/api-client").then(({ getNumberDetails }) => {
                    getNumberDetails(identifier).then(num => {
                        if (num) setLocalNumber(num)
                        setIsFetchingLocal(false)
                    })
                })
            }
        }
    }, [_hasHydrated, virtualNumber, isLoadingNumbers, fetchNumbers, identifier, localNumber, isFetchingLocal])

    const displayNumber = virtualNumber || localNumber

    // Use Professional Backend Hook
    // Prefer ID for API calls as it's the unique database key
    const { messages, refresh, isValidating, status: pollStatus } = useSMS(displayNumber?.id || (identifier.includes('-') ? identifier : ''))

    // Sync local number status with polled status
    useEffect(() => {
        if (localNumber && pollStatus && localNumber.status !== pollStatus) {
            setLocalNumber((prev: any) => ({ ...prev, status: pollStatus }))
        }
    }, [pollStatus, localNumber])

    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 10

    // Pagination Logic
    const totalPages = Math.ceil(messages.length / itemsPerPage)
    const paginatedMessages = messages.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    )

    // Reset page when messages change
    useEffect(() => {
        setCurrentPage(1)
    }, [messages.length, identifier])

    // Extract Provider Name (Prioritize DB field)
    const providerName = useMemo(() => {
        if (displayNumber?.provider) return displayNumber.provider.charAt(0).toUpperCase() + displayNumber.provider.slice(1)
        if (!displayNumber?.id) return 'Unknown'
        // Fallback to ID parsing if provider field missing
        const parts = displayNumber.id.split(':')
        return parts.length > 1 ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : 'Unknown'
    }, [displayNumber?.provider, displayNumber?.id])

    // Handle Download History
    const handleDownload = () => {
        if (messages.length === 0) {
            toast.error("No messages to download")
            return
        }

        const content = messages.map(msg =>
            `From: ${msg.from}\nTime: ${new Date(msg.receivedAt).toLocaleString()}\nMessage: ${msg.text}\n-------------------`
        ).join('\n\n')

        const blob = new Blob([content], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `sms_history_${displayNumber?.number || 'unknown'}.txt`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        toast.success("Download started")
        setIsMenuOpen(false)
    }

    // Update timer every second & Sync on Expiry
    useEffect(() => {
        if (!displayNumber) return

        const updateTimer = () => {
            const expiresAt = new Date(displayNumber.expiresAt || Date.now())
            const now = new Date()
            const remaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000))

            // If timer just hit zero, trigger a sync to process refund/status change
            setTimeLeft(prev => {
                if (prev > 0 && remaining === 0) {
                    setTimeout(() => refresh(), 500)
                }
                return remaining
            })
        }

        updateTimer()
        const interval = setInterval(updateTimer, 1000)
        return () => clearInterval(interval)
    }, [displayNumber])

    const handleRefresh = async () => {
        toast.promise(refresh(), {
            loading: 'Checking for new messages...',
            success: 'Inbox updated',
            error: 'Failed to refresh'
        })
    }

    // Handle Next Number - Purchase same service/country again
    const handleNextNumber = async () => {
        if (!displayNumber) return

        setIsNextLoading(true)
        try {
            // Re-purchase uses store action, safe to use properties
            const result = await purchaseNumber(
                displayNumber.countryCode,
                displayNumber.serviceCode || displayNumber.serviceName,
                undefined // provider (optional)
            )

            if (result.success && result.number) {
                toast.success('New number purchased!', {
                    description: result.number.phoneNumber,
                    action: {
                        label: 'View',
                        onClick: () => router.push(`/sms/${result.number!.id}`)
                    }
                })
                // Navigate to the new number
                router.push(`/sms/${result.number.id}`)
            } else {
                toast.error('Failed to get next number', {
                    description: result.error || 'Please try again'
                })
            }
        } catch (err: any) {
            toast.error('Failed to get next number', {
                description: err.message
            })
        } finally {
            setIsNextLoading(false)
        }
    }

    // Handle Cancel Number - Show confirmation
    const handleCancelNumber = () => {
        if (displayNumber?.status === 'cancelled') return
        setShowCancelConfirm(true)
    }

    // Confirm Cancel - Actually cancel and refund
    const confirmCancel = async () => {
        if (!displayNumber) return

        setIsCancelLoading(true)
        try {
            const result = await cancelNumber(displayNumber.id)

            if (result.success) {
                toast.success('Number cancelled', {
                    description: `Refund of $${Number(displayNumber.price || 0).toFixed(2)} processed`
                })
                setShowCancelConfirm(false)
                // Stay on page to show cancelled state
                // router.push('/dashboard')
            } else {
                toast.error('Failed to cancel', {
                    description: result.error || 'Please try again'
                })
            }
        } catch (err: any) {
            toast.error('Failed to cancel', {
                description: err.message
            })
        } finally {
            setIsCancelLoading(false)
        }
    }

    // Handle Manual Complete
    const handleComplete = async () => {
        if (!displayNumber) return

        setIsCompleting(true)
        try {
            const result = await completeNumber(displayNumber.id)

            if (result.success) {
                toast.success('Activation completed', {
                    description: 'Number marked as finished'
                })
            } else {
                toast.error('Failed to complete', {
                    description: result.error || 'Please try again'
                })
            }
        } catch (err: any) {
            toast.error('Failed to complete', {
                description: err.message
            })
        } finally {
            setIsCompleting(false)
        }
    }

    const minutesLeft = Math.floor(timeLeft / 60)
    const secondsLeft = timeLeft % 60

    const isExpired = displayNumber?.status === 'expired' || displayNumber?.status === 'cancelled' || displayNumber?.status === 'timeout' || displayNumber?.status === 'completed' || (minutesLeft === 0 && secondsLeft === 0 && displayNumber?.status !== 'active');

    // Loading state with LoadingScreen
    if (!_hasHydrated || (isLoadingNumbers && !displayNumber && !localNumber)) {
        return <LoadingScreen status="Opening Secure Channel" />
    }

    // Number not found
    if (!displayNumber) {
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
                                <h2 className="text-2xl font-bold mb-2 text-white">{t('inbox.empty.title')}</h2>
                                <p className="text-gray-500 mb-6">
                                    {t('inbox.empty.description')}
                                </p>
                                <Button
                                    onClick={() => router.push("/dashboard")}
                                    className="gap-2 rounded-xl bg-[hsl(var(--neon-lime))] text-black hover:bg-[hsl(72,100%,55%)]"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    {t('actions.backToDashboard')}
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

            <div className="relative z-10 p-4 md:p-6 lg:p-8 max-w-7xl mx-auto -mt-7 md:mt-0">
                <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={staggerContainer}
                    className="space-y-6 lg:space-y-8"
                >
                    {/* Header - Full Width */}
                    <div className="sticky top-0 md:top-4 z-40 bg-[#0a0a0c]/95 backdrop-blur-xl border-b border-white/5 py-2 -mx-4 px-4 md:mx-0 md:bg-[#0a0a0c]/80 md:border md:rounded-2xl md:px-5 md:py-3 mb-6 flex items-center justify-between gap-3 shadow-lg transition-all">
                        <div className="flex items-center gap-3">
                            {/* ... left side content ... */}
                            <button
                                onClick={() => router.push("/dashboard")}
                                className="p-1.5 hover:bg-white/10 rounded-full transition-colors -ml-1 group"
                            >
                                <ArrowLeft className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
                            </button>
                            <div>
                                <h1 className="text-lg font-bold text-white flex items-center gap-2.5">
                                    <span className="relative flex h-2.5 w-2.5">
                                        <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75", isExpired ? "bg-gray-500" : "animate-ping bg-[hsl(var(--neon-lime))]")}></span>
                                        <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5", isExpired ? "bg-gray-500" : "bg-[hsl(var(--neon-lime))]")}></span>
                                    </span>
                                    {/* SMS Inbox Title */}
                                    {t('title')}
                                </h1>
                                <p className="text-sm text-gray-500 mt-1">
                                    {t('subtitle')}
                                </p>
                            </div>
                        </div>


                        {/* Right: Actions */}
                        <div className="flex items-center gap-3">
                            <LanguageSwitcher />

                            {/* Status Badge */}
                            <div className="flex items-center bg-zinc-900 rounded-full border border-white/5 px-3 py-1.5 gap-2">
                                <Shield className="h-3.5 w-3.5 text-[hsl(var(--neon-lime))]" />
                                <span className="text-xs font-medium text-zinc-400 hidden sm:inline">{t('status.encrypted')}</span>
                                <span className="text-xs font-medium text-zinc-400 sm:hidden">{t('status.encryptedMobile')}</span>
                            </div>
                        </div>
                    </div>

                    {/* Main Content Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 lg:gap-8 items-start">

                        {/* Left Column: Number Details & Tips */}
                        <div className="space-y-3 lg:sticky lg:top-8">
                            <motion.div variants={fadeInLeft}>
                                <SMSNumberCard
                                    phoneNumber={displayNumber.number || displayNumber.phoneNumber}
                                    phoneCountryCode={displayNumber.phoneCountryCode}
                                    phoneNationalNumber={displayNumber.phoneNationalNumber}
                                    serviceName={displayNumber.serviceName}
                                    countryName={displayNumber.countryName}
                                    countryCode={displayNumber.countryCode}
                                    countryIconUrl={displayNumber.countryIconUrl}
                                    minutesLeft={minutesLeft}
                                    secondsLeft={secondsLeft}
                                    messageCount={messages.length}
                                    price={displayNumber.price}
                                    status={displayNumber.status || 'active'}
                                    providerName={providerName}
                                    serviceIconUrl={displayNumber.serviceIconUrl}
                                />
                            </motion.div>

                            {/* Action Buttons - Professional Inline Design */}
                            <motion.div variants={fadeInLeft} className="grid grid-cols-2 gap-3">
                                {/* Left Side: Next -> Keep */}
                                <div className="relative h-12 overflow-hidden rounded-xl">
                                    {!showCancelConfirm ? (
                                        <button
                                            onClick={handleNextNumber}
                                            disabled={isNextLoading || isCancelLoading}
                                            className={cn(
                                                "w-full h-full inline-flex items-center justify-center text-sm font-medium rounded-xl bg-card/40 border border-emerald-500/20 backdrop-blur-sm transition-all text-white",
                                                isNextLoading ? "opacity-50 cursor-wait" : "hover:bg-emerald-500/10 active:scale-[0.98]"
                                            )}
                                        >
                                            {isNextLoading ? (
                                                <RefreshCw className="mr-2 h-4 w-4 text-emerald-400 animate-spin" />
                                            ) : (
                                                <Plus className="mr-2 h-4 w-4 text-emerald-400" />
                                            )}
                                            {isNextLoading ? t('actions.getting') : t('actions.nextNumber')}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setShowCancelConfirm(false)}
                                            disabled={isCancelLoading}
                                            className={cn(
                                                "w-full h-full inline-flex items-center justify-center text-sm font-medium rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm transition-all text-gray-300",
                                                isCancelLoading ? "opacity-50 cursor-not-allowed" : "hover:bg-white/10 active:scale-[0.98]"
                                            )}
                                        >
                                            <ArrowLeft className="mr-2 h-4 w-4" />
                                            {t('actions.keepNumber')}
                                        </button>
                                    )}
                                </div>

                                {/* Right Side: Cancel OR Complete */}
                                <div className="relative h-12 overflow-hidden rounded-xl">
                                    {/* TERMINAL STATUS: Show Search Country */}
                                    {['cancelled', 'expired', 'completed', 'timeout'].includes(displayNumber.status || '') ? (
                                        <button
                                            onClick={() => router.push(`/dashboard/buy?service=${displayNumber.serviceName || displayNumber.serviceCode}&selectedCountry=${displayNumber.countryName}`)}
                                            className="w-full h-full inline-flex items-center justify-center text-sm font-medium rounded-xl bg-card/40 border border-blue-500/20 backdrop-blur-sm transition-all text-white hover:bg-blue-500/10 active:scale-[0.98] group"
                                        >
                                            <Search className="mr-2 h-4 w-4 text-blue-400" />
                                            {t('actions.searchCountry')}
                                        </button>
                                    ) : messages.length > 0 ? (
                                        /* HAS SMS: Show Complete Button */
                                        <button
                                            onClick={handleComplete}
                                            disabled={isCompleting}
                                            className={cn(
                                                "w-full h-full inline-flex items-center justify-center text-sm font-medium rounded-xl bg-emerald-500/20 border border-emerald-500/30 backdrop-blur-sm transition-all text-emerald-200",
                                                isCompleting ? "opacity-50 cursor-wait" : "hover:bg-emerald-500/30 active:scale-[0.98]"
                                            )}
                                        >
                                            {isCompleting ? (
                                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <Check className="mr-2 h-4 w-4" />
                                            )}
                                            {/* TODO: Add translation key 'actions.completeNumber' */}
                                            {isCompleting ? 'Finishing...' : 'Complete Order'}
                                        </button>
                                    ) : !showCancelConfirm ? (
                                        /* NO SMS: Show Cancel Button */
                                        <button
                                            onClick={handleCancelNumber}
                                            disabled={isCancelLoading || isNextLoading}
                                            className={cn(
                                                "w-full h-full inline-flex items-center justify-center text-sm font-medium rounded-xl bg-card/40 border border-red-500/20 backdrop-blur-sm transition-all text-white",
                                                (isCancelLoading) ? "opacity-50 cursor-wait" : "hover:bg-red-500/10 active:scale-[0.98]"
                                            )}
                                        >
                                            {isCancelLoading ? (
                                                <RefreshCw className="mr-2 h-4 w-4 text-red-400 animate-spin" />
                                            ) : (
                                                <XCircle className="mr-2 h-4 w-4 text-red-400" />
                                            )}
                                            {isCancelLoading ? t('actions.cancelling') : t('actions.cancelNumber')}
                                        </button>
                                    ) : (
                                        /* CONFIRM CANCEL */
                                        <button
                                            onClick={confirmCancel}
                                            disabled={isCancelLoading}
                                            className={cn(
                                                "w-full h-full inline-flex items-center justify-center text-sm font-medium rounded-xl bg-red-500/20 border border-red-500/30 backdrop-blur-sm transition-all text-red-200",
                                                isCancelLoading ? "opacity-50 cursor-wait" : "hover:bg-red-500/30 active:scale-[0.98]"
                                            )}
                                        >
                                            {isCancelLoading ? (
                                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <Check className="mr-2 h-4 w-4" />
                                            )}
                                            {t('actions.confirmRefund')}
                                        </button>
                                    )}
                                </div>
                            </motion.div>

                            <motion.div variants={fadeInLeft} className="hidden lg:block">
                                <Card className="border-amber-500/10 bg-gradient-to-br from-amber-500/[0.02] to-transparent backdrop-blur-xl">
                                    <CardContent className="p-5 flex gap-4">
                                        <div className="p-2.5 h-fit rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500">
                                            <Sparkles className="h-4.5 w-4.5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-amber-100 mb-1">{t('tips.label')}</p>
                                            <p className="text-xs leading-relaxed text-amber-500/70">
                                                {t('tips.content')}
                                            </p>
                                        </div>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        </div>

                        {/* Right Column: Messages Feed */}
                        <motion.div variants={fadeInLeft} className="min-h-[500px]">
                            <Card className={cn(
                                "backdrop-blur-xl h-full shadow-2xl overflow-hidden flex flex-col transition-all duration-500",
                                isExpired ? "border-white/5 bg-[#0c0d10] opacity-80" : "border-white/[0.06] bg-[#0f1115]/50"
                            )}>
                                <CardHeader className={cn(
                                    "border-b p-5 md:p-6 flex flex-row items-center justify-between sticky top-0 z-20 backdrop-blur-md transition-colors",
                                    isExpired ? "border-white/5 bg-black/20" : "border-white/[0.04] bg-white/[0.01]"
                                )}>
                                    <div className="flex items-center gap-3">
                                        <CardTitle className={cn("flex items-center gap-3 text-lg font-medium", isExpired ? "text-gray-500" : "text-white")}>
                                            <Inbox className={cn("h-5 w-5", isExpired ? "text-gray-600" : "text-gray-400")} />
                                            {t('inbox.title')}
                                        </CardTitle>
                                        <Badge variant="secondary" className="bg-white/[0.06] text-gray-300 pointer-events-none">
                                            {messages.length} {t('inbox.new')}
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
                                                            {t('actions.markRead')}
                                                        </button>
                                                        <div className="h-px bg-white/5 my-1" />
                                                        <button
                                                            onClick={handleDownload}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition-colors text-left"
                                                        >
                                                            <ArrowDownRight className="h-4 w-4" />
                                                            {t('actions.downloadHistory')}
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0 flex flex-col h-full">
                                    {/* p-0 to allow scrollbar to hug edges, padding added inside */}

                                    {/* Scrollable Container (Flex grow to fill available space) */}
                                    <div className="flex-1 overflow-y-auto custom-scrollbar p-5 md:p-6 space-y-4">
                                        {messages.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-14 text-center h-full relative overflow-hidden">
                                                {/* Sophisticated Background Glow */}
                                                {!isExpired && (
                                                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-64 bg-[hsl(var(--neon-lime)/0.02)] blur-[100px] pointer-events-none" />
                                                )}

                                                <div className={cn(
                                                    "w-24 h-24 rounded-3xl flex items-center justify-center mb-8 transition-all duration-700 relative",
                                                    isExpired
                                                        ? "bg-zinc-500/[0.03] border border-white/[0.05]"
                                                        : "bg-black/20 border border-[hsl(var(--neon-lime)/0.15)] shadow-[0_0_50px_-20px_hsl(var(--neon-lime)/0.3)]"
                                                )}>
                                                    {/* Premium Active Animations */}
                                                    {!isExpired && (
                                                        <>
                                                            {/* Soft Breathing Glow */}
                                                            <div className="absolute inset-0 rounded-3xl animate-[pulse_4s_infinite] bg-[hsl(var(--neon-lime)/0.05)]" />
                                                            {/* Outer Scanning Ring */}
                                                            <div className="absolute inset-[-12px] rounded-[2rem] border border-[hsl(var(--neon-lime)/0.1)] animate-[ping_4s_infinite] opacity-30" />
                                                            <div className="absolute inset-[-24px] rounded-[3rem] border border-[hsl(var(--neon-lime)/0.05)] animate-[ping_4s_infinite] [animation-delay:1s] opacity-20" />
                                                        </>
                                                    )}

                                                    <div className="relative z-10 flex flex-col items-center justify-center">
                                                        <motion.div
                                                            animate={!isExpired ? {
                                                                y: [0, -6, 0],
                                                                scale: [1, 1.02, 1]
                                                            } : {}}
                                                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                                        >
                                                            <Inbox className={cn(
                                                                "h-10 w-10 transition-colors duration-500",
                                                                isExpired ? "text-zinc-700" : "text-[hsl(var(--neon-lime))]"
                                                            )} />
                                                        </motion.div>

                                                        {!isExpired && (
                                                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-[hsl(var(--neon-lime))] rounded-full shadow-[0_0_10px_hsl(var(--neon-lime))] border-2 border-[#0f1115]" />
                                                        )}
                                                    </div>

                                                    {/* High-End Status Label */}
                                                    <div className={cn(
                                                        "absolute -top-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-[#0a0b0d] border rounded-full shadow-2xl transition-all duration-500 flex items-center gap-2",
                                                        isExpired ? "border-zinc-800" : "border-[hsl(var(--neon-lime)/0.3)]"
                                                    )}>
                                                        {!isExpired && (
                                                            <span className="relative flex h-2 w-2">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--neon-lime))] opacity-40"></span>
                                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-[hsl(var(--neon-lime))]"></span>
                                                            </span>
                                                        )}
                                                        <span className={cn(
                                                            "text-[10px] tracking-[0.2em] font-bold uppercase",
                                                            isExpired ? "text-zinc-600" : "text-[hsl(var(--neon-lime))]"
                                                        )} style={{ fontVariant: 'small-caps' }}>
                                                            {isExpired ? t('status.expired') : t('status.listening')}
                                                        </span>
                                                    </div>
                                                </div>

                                                <h3 className={cn(
                                                    "text-xl font-bold mb-3 tracking-tight transition-colors duration-500",
                                                    isExpired ? "text-zinc-500" : "text-white"
                                                )}>
                                                    {isExpired ? t('status.connectionTerminated') : t('status.signalSearchActive')}
                                                </h3>

                                                <div className={cn(
                                                    "text-sm max-w-[320px] leading-relaxed mx-auto transition-colors duration-500 px-6",
                                                    isExpired ? "text-zinc-700" : "text-zinc-400"
                                                )}>
                                                    {isExpired ? (
                                                        <p>{t('status.expiredSession')}</p>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            <p>{t('status.monitoring')}</p>
                                                            <div className="flex items-center justify-center gap-3">
                                                                <span className="h-px w-8 bg-[hsl(var(--neon-lime)/0.2)]" />
                                                                <span className="text-[10px] text-[hsl(var(--neon-lime))] font-bold tracking-[0.3em] uppercase opacity-60">{t('status.secureLink')}</span>
                                                                <span className="h-px w-8 bg-[hsl(var(--neon-lime)/0.2)]" />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <AnimatePresence mode="popLayout">
                                                {paginatedMessages.map((sms, i) => (
                                                    <SMSMessageCard key={sms.id} sms={sms} index={i} />
                                                ))}
                                            </AnimatePresence>
                                        )}
                                    </div>

                                    {/* Pagination Footer */}
                                    {totalPages > 1 && (
                                        <div className="border-t border-white/[0.04] p-4 bg-white/[0.01] flex items-center justify-between">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                                disabled={currentPage === 1}
                                                className="text-gray-400 hover:text-white"
                                            >
                                                <ArrowLeft className="w-4 h-4 mr-2" />
                                                {t('pagination.previous')}
                                            </Button>
                                            <span className="text-xs text-gray-500">
                                                {t('pagination.pageInfo', { current: currentPage, total: totalPages })}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                                disabled={currentPage === totalPages}
                                                className="text-gray-400 hover:text-white"
                                            >
                                                {t('pagination.next')}
                                                <ArrowUpRight className="w-4 h-4 ml-2" />
                                            </Button>
                                        </div>
                                    )}

                                    {/* CSS for custom scrollbar injected here for simplicity */}

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
                        <motion.div variants={fadeInLeft} className="lg:hidden">
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
        </div >
    )
}
