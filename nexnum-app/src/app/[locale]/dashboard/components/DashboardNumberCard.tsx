"use client"

import { useState, useEffect, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, MessageSquare, Copy, Check, ArrowRight, Shield, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils/utils'

interface DashboardNumberCardProps {
    id: string
    number: string
    countryCode: string
    countryName: string
    countryIconUrl?: string
    serviceName: string
    serviceIconUrl?: string
    smsCount: number
    expiresAt: string
    status: string
    latestSms?: {
        content: string | null
        receivedAt: string
    } | null
    onSync?: () => void
}

/**
 * Premium Active Number Card for Dashboard Console
 * Provides logical real-time feedback and professional micro-interactions.
 */
export const DashboardNumberCard = memo(function DashboardNumberCard({
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
    latestSms,
    onSync
}: DashboardNumberCardProps) {
    const router = useRouter()
    const [timeLeft, setTimeLeft] = useState('')
    const [percent, setPercent] = useState(100)
    const [progressColor, setProgressColor] = useState('hsl(var(--neon-lime))')
    const isLowTime = progressColor === '#ef4444'
    const [copied, setCopied] = useState(false)

    // Real-time Expiration Logic
    useEffect(() => {
        const updateTimer = () => {
            const expiry = new Date(expiresAt)
            const now = new Date()
            const diff = expiry.getTime() - now.getTime()

            if (diff <= 0) {
                setTimeLeft('EXPIRED')
                setProgressColor('#ef4444')
                return
            }

            const mins = Math.floor(diff / 60000)
            const secs = Math.floor((diff % 60000) / 1000)

            if (mins < 5) setProgressColor('#ef4444')
            else if (mins < 10) setProgressColor('#f59e0b')
            else setProgressColor('hsl(var(--neon-lime))')

            setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`)

            // Calculate Percentage (Assuming 20 min window standard for SMS)
            const totalDuration = 20 * 60 * 1000 // 20 minutes in ms
            const p = Math.max(0, Math.min(100, (diff / totalDuration) * 100))
            setPercent(p)
        }

        updateTimer()
        const interval = setInterval(updateTimer, 1000)
        return () => clearInterval(interval)
    }, [expiresAt])

    const handleCopy = (e: React.MouseEvent) => {
        e.stopPropagation()
        navigator.clipboard.writeText(number)
        setCopied(true)
        toast.success("Copied to clipboard")
        setTimeout(() => setCopied(false), 2000)
    }

    const handleCardClick = () => {
        router.push(`/sms/${id}`)
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ y: -4 }}
            className="group relative"
        >
            {/* Ambient Shadow/Glow */}
            <div className="absolute inset-0 bg-white/[0.02] rounded-[24px] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div
                onClick={handleCardClick}
                className={cn(
                    "relative overflow-hidden cursor-pointer rounded-[24px] border transition-all duration-300",
                    "bg-[#0d0f14]/80 backdrop-blur-xl",
                    "border-white/[0.06] group-hover:border-white/[0.12]",
                    status === 'received' ? "border-emerald-500/20" : ""
                )}
            >
                {/* Visual Texture */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />

                <div className="p-5 flex flex-col gap-4">
                    {/* Header: Country & Status */}
                    <div className="flex items-center justify-between">
                        <div className="relative w-10 h-10 flex-shrink-0">
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
                                    src={countryIconUrl || '/flags/un.svg'}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <AnimatePresence mode="wait">
                                {status === 'received' && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                    >
                                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] font-bold px-2">
                                            RECEIVED
                                        </Badge>
                                    </motion.div>
                                )}
                                {status === 'expired' && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                    >
                                        <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-[9px] font-bold px-2">
                                            EXPIRED
                                        </Badge>
                                    </motion.div>
                                )}
                                {status === 'cancelled' && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                    >
                                        <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[9px] font-bold px-2">
                                            CANCELLED
                                        </Badge>
                                    </motion.div>
                                )}
                                {status === 'completed' && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                    >
                                        <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-emerald-500/30 text-emerald-400 text-[10px] bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                            Cᴏᴍᴘʟᴇᴛᴇᴅ
                                        </div>
                                    </motion.div>
                                )}
                                {status === 'active' && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                    >
                                        <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-emerald-500/30 text-emerald-400 text-[10px] bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                                            Aᴄᴛɪᴠᴇ
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <div className={cn(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider",
                                (status === 'expired' || status === 'cancelled') ? "bg-red-500/10 border-red-500/20 text-red-500" :
                                    isLowTime ? "bg-red-500/10 border-red-500/20 text-red-500" : "bg-white/5 border-white/10 text-gray-500"
                            )}>
                                <Clock className="w-3 h-3" />
                                {timeLeft}
                            </div>
                        </div>
                    </div>

                    {/* Body: Number & Service */}
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 group/num">
                            <h3 className="text-2xl font-mono font-bold text-white tracking-tight">{number}</h3>
                            <button
                                onClick={handleCopy}
                                className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-white/10 text-gray-400"
                            >
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-[hsl(var(--neon-lime))] font-semibold">
                                {serviceName.length > 10 ? serviceName.substring(0, 10) + '...' : serviceName}
                            </span>
                            <span className="text-gray-600">|</span>
                            <span className="text-gray-400 flex items-center gap-1">
                                <MessageSquare className="w-3.5 h-3.5" />
                                {smsCount} Messages
                            </span>
                        </div>
                    </div>

                    {/* Footer: Latest Preview */}
                    {latestSms ? (
                        <div className="mt-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] group-hover:border-white/[0.08] transition-colors">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1">Latest SMS</p>
                            <p className="text-xs text-gray-300 line-clamp-1 italic">"{latestSms.content}"</p>
                        </div>
                    ) : (
                        <div className="mt-2 h-10 border border-dashed border-white/[0.05] rounded-xl flex items-center justify-center">
                            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-medium">Waiting for activity...</p>
                        </div>
                    )}

                    {/* Quick Access Bar (Interactive) */}
                    <div className="mt-2 flex items-center gap-2">
                        <Button
                            variant="ghost"
                            className="flex-1 h-9 rounded-xl bg-white/[0.02] hover:bg-[hsl(var(--neon-lime)/0.1)] hover:text-[hsl(var(--neon-lime))] border border-white/[0.05] text-xs font-bold gap-2 group/btn"
                        >
                            <Zap className="w-3.5 h-3.5" />
                            Open Inbox
                            <ArrowRight className="w-3.5 h-3.5 translate-x-0 group-hover/btn:translate-x-1 transition-transform" />
                        </Button>
                    </div>

                    {/* Advanced Professional Dotted Progress */}
                    {/* Advanced Professional Dotted Progress */}
                    {status !== 'expired' && status !== 'cancelled' && timeLeft !== 'EXPIRED' && (
                        <div className="absolute bottom-0 left-0 w-full h-[2px] bg-white/[0.02]">
                            <motion.div
                                initial={{ width: '100%' }}
                                animate={{ width: `${percent}%` }}
                                transition={{ duration: 1, ease: 'linear' }}
                                className="relative h-full"
                            >
                                {/* Dotted Pattern */}
                                <div
                                    className="absolute inset-0 w-full h-full opacity-50"
                                    style={{
                                        backgroundImage: `linear-gradient(to right, ${progressColor} 1px, transparent 1px)`,
                                        backgroundSize: '3px 100%',
                                    }}
                                />
                                {/* Glow Line Underneath */}
                                <div className="absolute inset-0 opacity-20 blur-[1px]" style={{ backgroundColor: progressColor }} />

                                {/* Leading Energy Head */}
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full shadow-[0_0_8px_1px_currentColor]"
                                    style={{ backgroundColor: progressColor, color: progressColor }} />
                            </motion.div>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    )
})
