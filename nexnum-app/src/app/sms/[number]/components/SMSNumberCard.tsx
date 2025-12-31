"use client"

import { useState, memo } from 'react'
import { Phone, Copy, Check, Clock, MessageSquare, Shield, Sparkles, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface SMSNumberCardProps {
    phoneNumber: string
    serviceName: string
    countryName: string
    minutesLeft: number
    secondsLeft: number
    messageCount: number
    className?: string
}

const countryCodeMap: Record<string, string> = {
    "United States": "us", "USA": "us", "US": "us",
    "United Kingdom": "gb", "UK": "gb",
    "Canada": "ca", "Germany": "de", "France": "fr",
    "Russia": "ru", "India": "in", "China": "cn",
    "Brazil": "br", "Australia": "au", "Spain": "es",
    "Italy": "it", "Netherlands": "nl", "Poland": "pl",
};

/**
 * Professional, clean phone number display card.
 * Removes "cartoonish" elements in favor of premium glassmorphism.
 */
export const SMSNumberCard = memo(function SMSNumberCard({
    phoneNumber,
    serviceName,
    countryName,
    minutesLeft,
    secondsLeft,
    messageCount,
    className
}: SMSNumberCardProps) {
    const [copied, setCopied] = useState(false)
    const countryCode = countryCodeMap[countryName] || "un"

    const handleCopyNumber = () => {
        navigator.clipboard.writeText(phoneNumber)
        setCopied(true)
        toast.success("Number copied!")
        setTimeout(() => setCopied(false), 2000)
    }

    const isLowTime = minutesLeft < 5

    return (
        <div className={cn("relative group w-full", className)}>
            {/* Cinematic Glow: Subtle Neon Lime Rim (Underlay) */}
            <div
                className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-[hsl(var(--neon-lime)/0.3)] via-white/5 to-[hsl(var(--neon-lime)/0.15)] opacity-80 group-hover:opacity-100 transition-opacity duration-700 blur-[2px]"
            />

            {/* Main Card Container: Dark Charcoal Glass */}
            <div className="relative bg-[#12141a] border-0 overflow-hidden shadow-2xl h-full flex flex-col rounded-2xl">
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

                <div className="relative z-10 flex flex-col gap-2 p-3 md:p-4">
                    {/* Header Section: Icon & Number */}
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                            {/* Device Icon Container - Embedded in Glass with Flag */}
                            <div className="relative">
                                <div className="w-10 h-10 rounded-lg bg-[#1A1D24] border border-[#25282F] flex items-center justify-center">
                                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-300">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"></path>
                                    </svg>
                                </div>
                                {/* Country Flag Badge */}
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border border-[#1A1D24] overflow-hidden z-10 shadow-sm">
                                    <img
                                        src={`https://flagcdn.com/w40/${countryCode}.png`}
                                        alt={countryName}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                </div>
                            </div>


                            <div>
                                <div className="flex items-center gap-2 mb-0.5">
                                    <h2 className="text-xl md:text-2xl font-mono font-bold text-white tracking-tight drop-shadow-md">
                                        {phoneNumber}
                                    </h2>
                                    <button
                                        onClick={handleCopyNumber}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all active:scale-95 group/copy"
                                        title="Copy number"
                                    >
                                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 group-hover/copy:text-[hsl(var(--neon-lime))]" />}
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-400 font-medium pl-0.5">
                                    <span className="capitalize tracking-wide">{countryName}</span>
                                    <span className="w-0.5 h-0.5 rounded-full bg-gray-600" />
                                    <span className="capitalize text-[hsl(var(--neon-lime))]">{serviceName}</span>
                                </div>
                            </div>
                        </div>

                        {/* Status Badge - Minimalist Dot */}
                        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 border border-white/5 backdrop-blur-sm">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-500/90">Active</span>
                        </div>
                    </div>

                    <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

                    {/* Stats Grid - Darker, Recessed Look */}
                    <div className="grid grid-cols-2 gap-2 md:gap-3">
                        {/* Time Remaining */}
                        <div className={cn(
                            "group/stat relative p-2.5 rounded-lg border transition-all duration-500 overflow-hidden",
                            isLowTime
                                ? "bg-red-500/[0.03] border-red-500/10"
                                : "bg-white/[0.02] border-white/5 hover:border-[hsl(var(--neon-lime))/20] hover:bg-[hsl(var(--neon-lime))/0.02]"
                        )}>
                            <p className="text-[10px] text-gray-500 mb-0.5 flex items-center gap-1.5 uppercase tracking-wider font-semibold">
                                <Clock className="w-3 h-3" />
                                <span>Expires in</span>
                            </p>
                            <p className={cn(
                                "text-lg md:text-xl font-mono font-medium tracking-tight drop-shadow-sm",
                                isLowTime ? "text-red-400" : "text-white group-hover/stat:text-[hsl(var(--neon-lime))] transition-colors"
                            )}>
                                {minutesLeft}:{secondsLeft.toString().padStart(2, '0')}
                            </p>
                        </div>

                        {/* Message Count */}
                        <div className="relative p-2.5 rounded-lg bg-white/[0.02] border border-white/5 transition-all duration-500 hover:border-blue-400/20 hover:bg-blue-400/[0.02]">
                            <p className="text-[10px] text-gray-500 mb-0.5 flex items-center gap-1.5 uppercase tracking-wider font-semibold">
                                <MessageSquare className="w-3 h-3" />
                                <span>Received</span>
                            </p>
                            <p className="text-lg md:text-xl font-mono font-medium text-white tracking-tight drop-shadow-sm group-hover:text-blue-400 transition-colors">
                                {messageCount}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
})
