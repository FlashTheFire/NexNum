"use client"

import { useState, memo, useEffect, useRef } from 'react'
import { Copy, Check, Clock, MessageSquare } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { cn } from '@/lib/utils/utils'
import { getCountryFlagUrlSync } from "@/lib/normalizers/country-flags"
import { useTranslations } from 'next-intl'

interface SMSNumberCardProps {
    phoneNumber: string
    phoneCountryCode?: string | null
    phoneNationalNumber?: string | null
    serviceName: string
    countryName: string
    countryCode: string
    countryIconUrl?: string
    minutesLeft: number
    secondsLeft: number
    messageCount: number
    price?: number
    status?: string
    providerName?: string
    serviceIconUrl?: string
    className?: string
}

/**
 * Clean, professional SMS Number Card.
 * Simplified design with focus on usability.
 */
export const SMSNumberCard = memo(function SMSNumberCard({
    phoneNumber,
    phoneCountryCode,
    phoneNationalNumber,
    serviceName,
    countryName,
    countryCode,
    countryIconUrl,
    minutesLeft,
    secondsLeft,
    messageCount,
    price = 0,
    status = 'active',
    providerName = 'Unknown',
    serviceIconUrl,
    className
}: SMSNumberCardProps) {
    const [copiedFull, setCopiedFull] = useState(false)
    const [copiedNational, setCopiedNational] = useState(false)
    const [pulseMessage, setPulseMessage] = useState(false)
    const prevMessageCount = useRef(messageCount)
    const t = useTranslations('smsPage.card')

    useEffect(() => {
        if (messageCount > prevMessageCount.current) {
            setPulseMessage(true)
            const timer = setTimeout(() => setPulseMessage(false), 2000)
            return () => clearTimeout(timer)
        }
        prevMessageCount.current = messageCount
    }, [messageCount])

    const handleCopyFullNumber = () => {
        navigator.clipboard.writeText(phoneNumber)
        setCopiedFull(true)
        toast.success("Full number copied!", { description: phoneNumber })
        setTimeout(() => setCopiedFull(false), 2000)
    }

    const handleCopyNationalNumber = () => {
        const nationalNum = phoneNationalNumber || phoneNumber.replace(/^\+\d{1,4}/, '')
        navigator.clipboard.writeText(nationalNum)
        setCopiedNational(true)
        toast.success("Number copied!", { description: `${nationalNum} (without country code)` })
        setTimeout(() => setCopiedNational(false), 2000)
    }

    const isLowTime = minutesLeft < 5
    const isExpired = status === 'expired' || status === 'cancelled' || status === 'timeout' || status === 'completed' || (minutesLeft === 0 && secondsLeft === 0)

    const totalSeconds = minutesLeft * 60 + secondsLeft
    const progress = Math.min(100, (totalSeconds / (20 * 60)) * 100)

    const statusConfig = {
        active: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', dot: 'bg-emerald-500', label: t('statuses.active') },
        expired: { color: 'text-gray-400', bg: 'bg-gray-500/10', dot: 'bg-gray-500', label: t('statuses.expired') },
        cancelled: { color: 'text-red-400', bg: 'bg-red-500/10', dot: 'bg-red-500', label: t('statuses.cancelled') },
        completed: { color: 'text-blue-400', bg: 'bg-blue-500/10', dot: 'bg-blue-500', label: t('statuses.completed') },
    }[isExpired ? (status === 'cancelled' ? 'cancelled' : status === 'completed' ? 'completed' : 'expired') : 'active']

    const flagUrl = countryIconUrl || getCountryFlagUrlSync(countryName) || getCountryFlagUrlSync(countryCode) || '/flags/un.svg'

    return (
        <div className={cn("relative w-full", isExpired && "opacity-70", className)}>
            {/* Main Card */}
            <div className={cn(
                "relative rounded-2xl border overflow-hidden transition-all duration-300",
                isExpired
                    ? "bg-[#0d0e12] border-white/5"
                    : "bg-gradient-to-br from-[#13151a] to-[#0d0e12] border-[hsl(var(--neon-lime)/0.2)]"
            )}>

                {/* Content */}
                <div className="p-4 md:p-5 space-y-4">

                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-4">

                        {/* Left: Icon + Number */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            {/* Service Icon with Country Badge - OLD DESIGN */}
                            <div className="relative w-10 h-10 flex-shrink-0">
                                <div className={cn(
                                    "relative w-full h-full rounded-lg overflow-hidden transition-all duration-300",
                                    isExpired
                                        ? "ring-1 ring-white/10 grayscale-[0.8]"
                                        : "ring-2 ring-[hsl(var(--neon-lime))] ring-offset-1 ring-offset-[#0a0a0c] shadow-[0_0_12px_hsl(var(--neon-lime)/0.35)] group-hover:scale-105"
                                )}>
                                    {serviceIconUrl ? (
                                        <img
                                            src={serviceIconUrl}
                                            alt={serviceName}
                                            className="w-full h-full object-contain filter brightness-110 contrast-110"
                                            onError={(e) => {
                                                e.currentTarget.style.display = 'none'
                                                e.currentTarget.nextElementSibling?.classList.remove('hidden')
                                            }}
                                        />
                                    ) : null}
                                    <div className={cn(
                                        "w-full h-full bg-[#1A1D24] flex items-center justify-center text-gray-300 text-lg font-bold",
                                        serviceIconUrl && "hidden"
                                    )}>
                                        {serviceName?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                                </div>
                                {/* Country Flag Badge */}
                                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-[#151518] overflow-hidden shadow-md z-20">
                                    <img
                                        src={flagUrl}
                                        alt={countryName}
                                        className={cn(
                                            "w-full h-full rounded-full object-cover shadow-sm ring-1 ring-white/10",
                                            isExpired && "grayscale"
                                        )}
                                        onError={(e) => { e.currentTarget.src = '/flags/un.svg' }}
                                    />
                                </div>
                            </div>

                            {/* Number & Meta */}
                            <div className="min-w-0 flex-1">
                                {/* Phone Number Row */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                        onClick={handleCopyFullNumber}
                                        className={cn(
                                            "text-lg md:text-xl font-mono font-semibold tracking-tight transition-colors cursor-pointer",
                                            isExpired ? "text-gray-500" : "text-white hover:text-[hsl(var(--neon-lime))]",
                                            copiedFull && "text-emerald-400"
                                        )}
                                        title="Click to copy full number"
                                    >
                                        {phoneNumber}
                                    </button>
                                    <button
                                        onClick={handleCopyNationalNumber}
                                        className={cn(
                                            "p-1 rounded-md transition-all",
                                            copiedNational
                                                ? "text-emerald-400 bg-emerald-500/10"
                                                : "text-gray-500 hover:text-white hover:bg-white/5"
                                        )}
                                        title="Copy without country code"
                                    >
                                        {copiedNational ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                </div>

                                {/* Meta Row */}
                                <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                                    <span className="capitalize">{countryName}</span>
                                    <span>•</span>
                                    <span className={cn("capitalize", !isExpired && "text-[hsl(var(--neon-lime))]")}>{serviceName}</span>
                                    {providerName && providerName !== 'Unknown' && (
                                        <>
                                            <span>•</span>
                                            <span className="text-gray-600">{providerName}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right: Status Badge */}
                        <div className={cn(
                            "flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide flex-shrink-0",
                            statusConfig.bg, statusConfig.color
                        )}>
                            <span className="relative flex h-1.5 w-1.5">
                                {status === 'active' && !isExpired && (
                                    <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", statusConfig.dot)} />
                                )}
                                <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5", statusConfig.dot)} />
                            </span>
                            {statusConfig.label}
                        </div>
                    </div>

                    {/* Separator Line */}
                    <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

                    {/* Stats Row */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Timer */}
                        <div className={cn(
                            "relative p-3 rounded-xl border transition-all",
                            isExpired
                                ? "bg-white/[0.02] border-white/5"
                                : isLowTime
                                    ? "bg-red-500/5 border-red-500/20"
                                    : "bg-white/[0.02] border-white/5 hover:border-[hsl(var(--neon-lime)/0.2)]"
                        )}>
                            {/* Progress Bar */}
                            {!isExpired && (
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5 rounded-b-xl overflow-hidden">
                                    <div
                                        className="h-full transition-all duration-1000 rounded-full"
                                        style={{
                                            width: `${progress}%`,
                                            backgroundColor: isLowTime ? '#ef4444' : 'hsl(var(--neon-lime))'
                                        }}
                                    />
                                </div>
                            )}

                            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wide font-medium mb-1">
                                <Clock className="w-3 h-3" />
                                {isExpired ? t('status') : t('expiresIn')}
                            </div>
                            <div className={cn(
                                "text-xl font-mono font-medium",
                                isExpired ? "text-gray-600" : isLowTime ? "text-red-400" : "text-white"
                            )}>
                                {isExpired
                                    ? (status === 'cancelled' ? t('statuses.cancelled') : status === 'completed' ? t('statuses.completed') : t('statuses.expired'))
                                    : `${minutesLeft}:${secondsLeft.toString().padStart(2, '0')}`
                                }
                            </div>

                            {/* Price Badge */}
                            {price > 0 && (
                                <div className="absolute top-2 right-2 text-[9px] font-mono text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                                    ${price.toFixed(2)}
                                </div>
                            )}
                        </div>

                        {/* Messages */}
                        <div className={cn(
                            "relative p-3 rounded-xl border transition-all",
                            pulseMessage && !isExpired
                                ? "bg-blue-500/10 border-blue-500/30"
                                : "bg-white/[0.02] border-white/5 hover:border-blue-500/20"
                        )}>
                            <AnimatePresence>
                                {pulseMessage && !isExpired && (
                                    <motion.div
                                        initial={{ scale: 0.95, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="absolute inset-0 bg-blue-500/10 rounded-xl"
                                    />
                                )}
                            </AnimatePresence>

                            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 uppercase tracking-wide font-medium mb-1">
                                <MessageSquare className="w-3 h-3" />
                                Received
                            </div>
                            <motion.div
                                key={messageCount}
                                initial={messageCount > 0 ? { scale: 1.1 } : {}}
                                animate={{ scale: 1 }}
                                className={cn(
                                    "text-xl font-mono font-medium",
                                    isExpired ? "text-gray-600" : messageCount > 0 ? "text-blue-400" : "text-white"
                                )}
                            >
                                {messageCount}
                            </motion.div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
})
