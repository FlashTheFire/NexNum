"use client"

import { useState, memo, useEffect, useRef } from 'react'
import { Phone, Copy, Check, Clock, MessageSquare, Shield, Sparkles, Smartphone } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { cn } from '@/lib/utils/utils'
import { getCountryFlagUrlSync } from "@/lib/normalizers/country-flags"

interface SMSNumberCardProps {
    phoneNumber: string
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
 * Professional, clean phone number display card.
 * Removes "cartoonish" elements in favor of premium glassmorphism.
 */

export const SMSNumberCard = memo(function SMSNumberCard({
    phoneNumber,
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
    const [copied, setCopied] = useState(false)
    const [pulseMessage, setPulseMessage] = useState(false)
    const prevMessageCount = useRef(messageCount)

    // Pulse on new message
    useEffect(() => {
        if (messageCount > prevMessageCount.current) {
            setPulseMessage(true)
            const timer = setTimeout(() => setPulseMessage(false), 2000)
            return () => clearTimeout(timer)
        }
        prevMessageCount.current = messageCount
    }, [messageCount])

    const handleCopyNumber = () => {
        navigator.clipboard.writeText(phoneNumber)
        setCopied(true)
        toast.success("Number copied!")
        setTimeout(() => setCopied(false), 2000)
    }

    const isLowTime = minutesLeft < 5
    const isMediumTime = minutesLeft >= 5 && minutesLeft < 10
    const isExpired = status === 'expired' || status === 'cancelled' || status === 'timeout' || status === 'completed' || (minutesLeft === 0 && secondsLeft === 0);

    const progressColor = isLowTime ? '#ef4444' : (isMediumTime ? '#f59e0b' : 'hsl(var(--neon-lime))')

    // Calculate progress (assumes ~20 min activation)
    const totalSeconds = minutesLeft * 60 + secondsLeft
    const progress = Math.min(100, (totalSeconds / (20 * 60)) * 100)

    // Dynamic Status Config
    const getStatusConfig = () => {
        if (status === 'cancelled') return { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Cancelled', icon: 'bg-red-500' }
        // NEW SLEEK EXPIRED STATE: Monochrome/Desaturated
        if (status === 'expired' || isExpired) return { color: 'text-gray-400', bg: 'bg-white/5', border: 'border-white/10', label: 'Expired', icon: 'bg-gray-500' }
        if (status === 'completed') return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Completed', icon: 'bg-emerald-500' }
        // Default Active
        return { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'Active', icon: 'bg-emerald-500' }
    }
    const statusConfig = getStatusConfig()

    return (
        <div
            className={cn("relative group w-full transition-all duration-500", isExpired ? "opacity-75 grayscale-[0.5] hover:opacity-100 hover:grayscale-0" : "", className)}
            role="region"
            aria-label={`SMS Number Card for ${phoneNumber}`}
        >
            {/* Cinematic Glow: Subtle Neon Lime Rim (Underlay) - Only for active */}
            {!isExpired && (
                <div
                    className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-[hsl(var(--neon-lime)/0.3)] via-white/5 to-[hsl(var(--neon-lime)/0.15)] opacity-80 group-hover:opacity-100 transition-opacity duration-700 blur-[2px]"
                />
            )}

            {/* Main Card Container: Dark Charcoal Glass */}
            <div className={cn(
                "relative border-0 overflow-hidden shadow-2xl h-full flex flex-col rounded-2xl transition-colors duration-500",
                isExpired ? "bg-[#0c0d10] border border-white/5" : "bg-[#12141a]"
            )}>
                {/* 1. Base Texture: Matte Charcoal Finish */}
                <div className="absolute inset-0 bg-[#0f1115]" />

                {/* 2. Grain/Noise Texture Overlay */}
                <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")`
                    }}
                />

                {/* 3. Cinematic Softbox Lighting (Top-Left Gradient) */}
                <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-gradient-to-br from-white/[0.08] to-transparent blur-3xl pointer-events-none" />

                {/* 4. Faint Technical SIM Chip Pattern (Center-Left) */}
                <div
                    className="absolute left-[8%] top-1/2 -translate-y-1/2 w-16 h-20 opacity-[0.06] pointer-events-none mix-blend-color-dodge"
                    style={{
                        background: `
                            linear-gradient(90deg, transparent 48%, #fff 48%, #fff 52%, transparent 52%),
                            linear-gradient(0deg, transparent 48%, #fff 48%, #fff 52%, transparent 52%),
                            linear-gradient(45deg, transparent 48%, #fff 48%, #fff 52%, transparent 52%),
                            radial-gradient(circle at center, transparent 30%, #fff 31%, #fff 35%, transparent 36%)
                        `,
                        backgroundSize: '100% 25%, 25% 100%, 100% 100%, 100% 100%'
                    }}
                />

                <div className="relative z-10 flex flex-col gap-4 p-4 md:p-5">
                    {/* Header Section: Icon & Number */}
                    <div className="flex items-start justify-between gap-3 pr-20"> {/* Added padding-right to prevent overlap with absolute badge */}
                        <div className="flex items-start gap-3">
                            {/* Service Logo Container - Matching Select Provider Design */}
                            <div className="relative w-10 h-10 flex-shrink-0">
                                <div className={cn(
                                    "relative w-full h-full rounded-lg overflow-hidden transition-all duration-300",
                                    status === 'active' ? "ring-2 ring-[hsl(var(--neon-lime))] ring-offset-1 ring-offset-[#0a0a0c] shadow-[0_0_12px_hsl(var(--neon-lime)/0.35)]" : "ring-1 ring-white/10 grayscale-[0.8]",
                                    "group-hover:scale-105"
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
                                    {/* Fallback Icon */}
                                    <div className={cn("w-full h-full bg-[#1A1D24] flex items-center justify-center text-gray-300 text-lg font-bold", serviceIconUrl && "hidden")}>
                                        {serviceName?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
                                </div>
                                {/* Country Flag Badge - Circle Flags */}
                                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-[#151518] overflow-hidden shadow-md z-20">
                                    <img
                                        src={countryIconUrl || getCountryFlagUrlSync(countryName) || getCountryFlagUrlSync(countryCode) || `https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/un.svg`}
                                        alt={countryName}
                                        className={cn("w-full h-full rounded-full object-cover shadow-sm ring-1 ring-white/10", isExpired && "grayscale")}
                                        onError={(e) => {
                                            // Fallback to 'un' (Unknown) flag if error
                                            e.currentTarget.src = 'https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/un.svg'
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col pt-0.5 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                    <h2 className={cn(
                                        "text-xl md:text-2xl font-mono font-bold tracking-tight drop-shadow-md",
                                        isExpired ? "text-gray-500 line-through decoration-gray-700 decoration-2" : "text-white"
                                    )}>
                                        {phoneNumber}
                                    </h2>
                                    <button
                                        onClick={handleCopyNumber}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all active:scale-95 group/copy focus-visible:ring-2 focus-visible:ring-white/20 outline-none"
                                        title="Copy number"
                                        aria-label="Copy phone number to clipboard"
                                    >
                                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 group-hover/copy:text-[hsl(var(--neon-lime))]" />}
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-400 font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                                    <span className="capitalize">{countryName}</span>
                                    <span className="w-0.5 h-0.5 rounded-full bg-gray-600 shrink-0"></span>
                                    <span className={cn("capitalize", isExpired ? "text-gray-500" : "text-[hsl(var(--neon-lime))]")}>{serviceName}</span>
                                    <span className="w-0.5 h-0.5 rounded-full bg-gray-600 shrink-0"></span>
                                    <span className="capitalize text-gray-500">{providerName}</span>
                                </div>
                            </div>
                        </div>

                        {/* Status Badge (Absolute) */}
                        <div className={cn("absolute top-4 right-4 md:top-5 md:right-5 flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-sm shadow-sm", statusConfig.bg, statusConfig.border)}>
                            <span className="relative flex h-1.5 w-1.5">
                                {status === 'active' && (
                                    <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", statusConfig.icon)}></span>
                                )}
                                <span className={cn("relative inline-flex rounded-full h-1.5 w-1.5 shadow-[0_0_8px_rgba(0,0,0,0.2)]", statusConfig.icon)}></span>
                            </span>
                            <span className={cn("text-[10px] font-bold uppercase tracking-widest", statusConfig.color)}>{statusConfig.label}</span>
                        </div>
                    </div>

                    <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

                    {/* Stats Grid - Darker, Recessed Look */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Time Remaining */}
                        <div className={cn(
                            "group/stat relative p-3 rounded-xl ring-1 transition-all duration-500 overflow-hidden flex flex-col justify-between h-[72px]",
                            isLowTime && !isExpired
                                ? "bg-red-500/[0.03] ring-red-500/10"
                                : (isExpired
                                    ? "bg-black/20 ring-white/5 opacity-80"
                                    : "bg-white/[0.02] ring-white/5 hover:ring-[hsl(var(--neon-lime))/20] hover:bg-[hsl(var(--neon-lime))/0.02]")
                        )}>
                            {/* Advanced Dotted Progress Bar */}
                            {!isExpired && (
                                <div className="absolute bottom-0 left-0 w-full h-[2px] bg-white/[0.02] overflow-hidden">
                                    <div
                                        className="relative h-full transition-all duration-1000 ease-linear"
                                        style={{ width: `${progress}%` }}
                                    >
                                        <div className="absolute inset-0 w-full h-full opacity-50"
                                            style={{
                                                backgroundImage: `linear-gradient(to right, ${progressColor} 1px, transparent 1px)`,
                                                backgroundSize: '3px 100%'
                                            }}
                                        />
                                        <div className="absolute inset-0 opacity-20 blur-[1px]" style={{ backgroundColor: progressColor }} />
                                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full shadow-[0_0_8px_1px_currentColor]"
                                            style={{ backgroundColor: progressColor, color: progressColor }}
                                        />
                                    </div>
                                </div>
                            )}

                            <p className="text-[10px] text-gray-500 flex items-center gap-1.5 uppercase tracking-wider font-semibold">
                                <Clock className="w-3 h-3" />
                                <span>{isExpired ? 'Status' : 'Expires in'}</span>
                            </p>
                            <p className={cn(
                                "text-xl md:text-2xl font-mono font-medium tracking-tight drop-shadow-sm truncate",
                                isExpired ? "text-gray-600" : (isLowTime ? "text-red-400" : "text-white group-hover/stat:text-[hsl(var(--neon-lime))] transition-colors")
                            )}>
                                {isExpired ? (status === 'cancelled' ? 'CANCELLED' : (status === 'completed' ? 'COMPLETED' : 'EXPIRED')) : `${minutesLeft}:${secondsLeft.toString().padStart(2, '0')}`}
                            </p>
                            {/* Price Badge (Absolute Bottom Right of Box) */}
                            {price > 0 && (
                                <div className={cn(
                                    "absolute top-2 right-2 text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border",
                                    isExpired ? "text-gray-600 bg-white/5 border-white/5" : "text-white/40 bg-white/5 border-white/5"
                                )}>
                                    ${price}/num
                                </div>
                            )}
                        </div>

                        {/* Message Count */}
                        <div className={cn(
                            "relative p-3 rounded-xl bg-white/[0.02] ring-1 ring-white/5 transition-all duration-500 flex flex-col justify-between h-[72px]",
                            !isExpired && "hover:ring-blue-400/20 hover:bg-blue-400/[0.02]",
                            isExpired && "bg-black/20 opacity-80"
                        )}>
                            {/* New Message Pulse Rings (Scale based) */}
                            <AnimatePresence>
                                {pulseMessage && !isExpired && (
                                    <motion.div
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1.5, opacity: 0 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 1.5, repeat: 2 }}
                                        className="absolute inset-0 bg-blue-500/10 rounded-xl pointer-events-none"
                                    />
                                )}
                            </AnimatePresence>

                            <p className="text-[10px] text-gray-500 flex items-center gap-1.5 uppercase tracking-wider font-semibold">
                                <MessageSquare className="w-3 h-3" />
                                <span>Received</span>
                            </p>
                            <div className="flex items-end justify-between">
                                <motion.p
                                    key={messageCount}
                                    initial={prevMessageCount.current !== messageCount && !isExpired ? { scale: 1.2, color: '#60a5fa' } : {}}
                                    animate={{ scale: 1, color: isExpired ? '#52525b' : '#ffffff' }}
                                    className={cn(
                                        "text-xl md:text-2xl font-mono font-medium tracking-tight drop-shadow-sm transition-colors",
                                        isExpired ? "text-zinc-600" : "text-white group-hover:text-blue-400"
                                    )}
                                >
                                    {messageCount}
                                </motion.p>
                                {/* Mobile Status (If needed) */}
                                <div className="sm:hidden">
                                    <div className={cn("w-2 h-2 rounded-full", statusConfig.icon)} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
})
