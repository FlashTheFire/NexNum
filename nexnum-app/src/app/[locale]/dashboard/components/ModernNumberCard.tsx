"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils/utils"
import { useTranslations } from "next-intl"

interface ModernNumberCardProps {
    id: string
    number: string
    countryCode?: string
    countryName: string
    countryIconUrl?: string
    serviceName: string
    serviceIconUrl?: string
    smsCount: number
    expiresAt: string
    status: string
    className?: string
}

export function ModernNumberCard({
    id,
    number,
    countryCode,
    countryName,
    countryIconUrl,
    serviceName,
    serviceIconUrl,
    smsCount,
    expiresAt,
    status,
    className
}: ModernNumberCardProps) {
    const [now, setNow] = useState(Date.now())
    const t = useTranslations('dashboard.status')

    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(interval)
    }, [])

    return (
        <Link
            href={`/sms/${id}`}
            className={cn("relative group cursor-pointer w-full block h-[180px]", className)}
            style={{
                clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 34px), calc(100% - 40px) 100%, 0 100%)'
            }}
        >
            {/* Neon-lime micro rim highlight */}
            <div
                className="absolute inset-0 rounded-2xl transition-all duration-300 group-hover:opacity-100"
                style={{
                    clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 24px), calc(100% - 24px) 100%, 0 100%)',
                    background: 'linear-gradient(135deg, rgba(179,255,0,0.15) 0%, transparent 50%, rgba(179,255,0,0.08) 100%)',
                    padding: '1px'
                }}
            />

            {/* Main card body */}
            <div
                className="relative h-full p-4 bg-[#12141a]/90 backdrop-blur-md border border-white/[0.04] rounded-2xl overflow-hidden transition-all duration-200 group-hover:border-white/[0.08] group-hover:bg-[#15181e]/90"
                style={{
                    clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 24px), calc(100% - 24px) 100%, 0 100%)'
                }}
            >
                {/* SIM Chip Pattern (center-left, 8% opacity) */}
                <div
                    className="absolute left-6 top-1/2 -translate-y-1/2 w-12 h-10 opacity-[0.15] hidden sm:block"
                    style={{
                        background: `
                            linear-gradient(to right, #b3ff00 1px, transparent 1px) 0 0 / 4px 100%,
                            linear-gradient(to bottom, #b3ff00 1px, transparent 1px) 0 0 / 100% 4px
                        `,
                        borderRadius: '3px',
                        border: '1px solid rgba(179,255,0,0.3)'
                    }}
                />

                {/* Subtle gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-[hsl(var(--neon-lime)/0.02)] pointer-events-none" />

                {/* Content */}
                <div className="relative z-10 flex flex-col justify-between h-full pb-3">
                    <div className="flex items-start justify-between mb-1">
                        <div className="relative w-9 h-9 flex-shrink-0">
                            <div className="relative w-full h-full rounded-lg overflow-hidden transition-all duration-300 ring-1 ring-white/10 group-hover:scale-105">
                                {serviceIconUrl ? (
                                    <img
                                        alt={serviceName}
                                        className="w-full h-full object-contain filter brightness-110 contrast-110"
                                        src={serviceIconUrl}
                                    />
                                ) : (
                                    <div className="w-full h-full bg-[#1A1D24] flex items-center justify-center text-gray-300 text-lg font-bold">
                                        {serviceName?.charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none"></div>
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-[#151518] overflow-hidden shadow-md z-20">
                                <img
                                    alt={countryName}
                                    className="w-full h-full rounded-full object-cover shadow-sm ring-1 ring-white/10"
                                    src={countryIconUrl || '/assets/flags/un.svg'}
                                />
                            </div>
                        </div>
                        {/* Dynamic Status Badge */}
                        <div className="flex flex-col items-end gap-1">
                            {(!status || !['received', 'expired', 'cancelled', 'completed', 'timeout'].includes(status)) && (
                                <div className="inline-flex items-center rounded-full border px-2 py-0.5 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-emerald-500/30 text-emerald-400 text-[9px] uppercase tracking-wider bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                    {t('active')}
                                </div>
                            )}
                            {(status === 'received' || status === 'completed') && (
                                <div className="inline-flex items-center rounded-full border px-2 py-0.5 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-emerald-500/30 text-emerald-400 text-[9px] uppercase tracking-wider bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                    {t('completed')}
                                </div>
                            )}
                            {(status === 'expired' || status === 'timeout') && (
                                <div className="inline-flex items-center rounded-full border px-2 py-0.5 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-orange-500/30 text-orange-400 text-[9px] uppercase tracking-wider bg-orange-500/10">
                                    {t('expired')}
                                </div>
                            )}
                            {status === 'cancelled' && (
                                <div className="inline-flex items-center rounded-full border px-2 py-0.5 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-red-500/30 text-red-400 text-[9px] uppercase tracking-wider bg-red-500/10">
                                    {t('cancelled')}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-1 pl-1">
                        <p className="text-xl sm:text-2xl font-mono font-medium text-white tracking-wide truncate">{number}</p>
                        <p className="text-xs text-gray-400 flex items-center gap-2">
                            <span className="truncate max-w-[100px]">{serviceName}</span>
                            <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                            <span className="text-[hsl(var(--neon-lime))]">{smsCount || 0} SMS</span>
                        </p>
                    </div>
                </div>

                {/* Cut corner highlight */}
                <div className="absolute bottom-0 right-0 w-5 h-5 border-t border-l border-[hsl(var(--neon-lime)/0.15)] z-20" style={{ transform: 'translate(50%, 50%) rotate(45deg)' }} />

                {/* Advanced Progress Bar */}
                {expiresAt && status !== 'cancelled' && status !== 'expired' && (
                    <div className="absolute bottom-0 left-0 w-full h-[3px] bg-white/[0.02] overflow-hidden">
                        {(() => {
                            const expiry = new Date(expiresAt).getTime()
                            const diff = expiry - now
                            if (diff <= 0) return null
                            const total = 20 * 60 * 1000
                            const pct = Math.min(100, Math.max(0, (diff / total) * 100))
                            const isLow = diff < 5 * 60 * 1000
                            const isMedium = diff < 10 * 60 * 1000
                            const color = isLow ? '#ef4444' : (isMedium ? '#f59e0b' : 'hsl(var(--neon-lime))')

                            return (
                                <div className="relative h-full transition-all duration-1000 ease-linear" style={{ width: `${pct}%` }}>
                                    <div className="absolute inset-0 w-full h-full opacity-50" style={{ backgroundImage: `linear-gradient(to right, ${color} 1px, transparent 1px)`, backgroundSize: '3px 100%' }} />
                                    <div className="absolute inset-0 opacity-20 blur-[1px]" style={{ backgroundColor: color }} />
                                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full shadow-[0_0_8px_1px_currentColor]" style={{ backgroundColor: color, color }} />
                                </div>
                            )
                        })()}
                    </div>
                )}
            </div>
        </Link>
    )
}
