"use client"

import { useState, useEffect, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, MessageSquare, Copy, Check, ArrowRight, Shield, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface DashboardNumberCardProps {
    id: string
    number: string
    countryCode: string
    countryName: string
    serviceName: string
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
    serviceName,
    smsCount,
    expiresAt,
    status,
    latestSms,
    onSync
}: DashboardNumberCardProps) {
    const router = useRouter()
    const [timeLeft, setTimeLeft] = useState('')
    const [isLowTime, setIsLowTime] = useState(false)
    const [copied, setCopied] = useState(false)

    // Real-time Expiration Logic
    useEffect(() => {
        const updateTimer = () => {
            const expiry = new Date(expiresAt)
            const now = new Date()
            const diff = expiry.getTime() - now.getTime()

            if (diff <= 0) {
                setTimeLeft('EXPIRED')
                setIsLowTime(true)
                return
            }

            const mins = Math.floor(diff / 60000)
            const secs = Math.floor((diff % 60000) / 1000)

            if (mins < 5) setIsLowTime(true)
            setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`)
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
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.05] flex items-center justify-center text-sm">
                                🌍
                            </div>
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{countryName}</span>
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
                            </AnimatePresence>
                            <div className={cn(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider",
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
                            <span className="text-[hsl(var(--neon-lime))] font-semibold">{serviceName}</span>
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
                </div>
            </div>
        </motion.div>
    )
})
