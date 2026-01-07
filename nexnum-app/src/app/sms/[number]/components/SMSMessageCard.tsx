"use client"

import { useState, memo } from 'react'
import { motion } from 'framer-motion'
import { MessageSquare, Copy, Check, Clock, Zap, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatRelativeTime } from '@/lib/utils'
import { toast } from 'sonner'

// OTP Code Extractor
function extractOTPCode(text: string): string | null {
    const patterns = [
        /\b(\d{4,8})\b/,
        /code[:\s]+(\d{4,8})/i,
        /is[:\s]+(\d{4,8})/i,
        /G-(\d{4,8})/i,
    ]
    for (const pattern of patterns) {
        const match = text.match(pattern)
        if (match) return match[1]
    }
    return null
}

// Service color mapper
function getServiceColor(from: string, text: string) {
    const fromLower = from.toLowerCase()
    const textLower = text.toLowerCase()

    if (fromLower.includes('whatsapp') || textLower.includes('whatsapp')) {
        return {
            bg: 'from-green-500/15 to-emerald-500/10',
            border: 'border-green-500/20',
            icon: 'text-green-500',
            glow: 'green'
        }
    }
    if (fromLower.includes('google') || textLower.includes('google') || text.startsWith('G-')) {
        return {
            bg: 'from-blue-500/15 to-cyan-500/10',
            border: 'border-blue-500/20',
            icon: 'text-blue-500',
            glow: 'blue'
        }
    }
    if (fromLower.includes('telegram') || textLower.includes('telegram')) {
        return {
            bg: 'from-indigo-500/15 to-violet-500/10',
            border: 'border-indigo-500/20',
            icon: 'text-indigo-500',
            glow: 'indigo'
        }
    }
    if (fromLower.includes('facebook') || textLower.includes('facebook') || textLower.includes('fb')) {
        return {
            bg: 'from-blue-600/15 to-blue-400/10',
            border: 'border-blue-500/20',
            icon: 'text-blue-400',
            glow: 'blue'
        }
    }
    if (fromLower.includes('twitter') || fromLower.includes('x.com') || textLower.includes('twitter')) {
        return {
            bg: 'from-sky-500/15 to-cyan-500/10',
            border: 'border-sky-500/20',
            icon: 'text-sky-400',
            glow: 'cyan'
        }
    }
    return {
        bg: 'from-slate-500/15 to-gray-500/10',
        border: 'border-slate-500/20',
        icon: 'text-slate-400',
        glow: 'slate'
    }
}

interface SMSMessageCardProps {
    sms: {
        id: string
        from: string
        text: string
        receivedAt: string
    }
    index: number
}

/**
 * Enhanced SMS Message Card
 * - Service-colored gradients
 * - OTP extraction and highlight
 * - Shimmer on hover (desktop)
 * - Staggered entrance animation
 */
export const SMSMessageCard = memo(function SMSMessageCard({ sms, index }: SMSMessageCardProps) {
    const [copied, setCopied] = useState(false)
    const [fullCopied, setFullCopied] = useState(false)
    const otpCode = extractOTPCode(sms.text)
    const colors = getServiceColor(sms.from, sms.text)

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
        setFullCopied(true)
        toast.success("Message copied!")
        setTimeout(() => setFullCopied(false), 2000)
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
                delay: index * 0.05,
                type: "spring",
                stiffness: 300,
                damping: 25
            }}
            className="group"
        >
            <div className={`relative p-3 rounded-2xl bg-gradient-to-r ${colors.bg} ${colors.border} border backdrop-blur-sm overflow-hidden transition-all duration-300 hover:border-opacity-60`}>
                {/* Shimmer on hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 pointer-events-none" />

                {/* Header */}
                <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg bg-black/20 ${colors.icon}`}>
                            <MessageSquare className="h-3.5 w-3.5" />
                        </div>
                        <span className="text-xs font-medium text-white/80">{sms.from}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {formatRelativeTime(sms.receivedAt)}
                        </span>
                        <button
                            onClick={handleCopyFull}
                            className="p-1 rounded-lg hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                            aria-label="Copy full message"
                        >
                            {fullCopied ? (
                                <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                                <MoreHorizontal className="h-3.5 w-3.5 text-gray-500" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Message Content */}
                <p className="text-xs leading-relaxed text-gray-300 mb-2">{sms.text}</p>

                {/* OTP Code Section */}
                {otpCode && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="flex items-center justify-between p-2 rounded-xl bg-black/30 border border-emerald-500/20"
                    >
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-emerald-500/20">
                                <Zap className="h-3.5 w-3.5 text-emerald-400" />
                            </div>
                            <div>
                                <p className="text-[10px] text-gray-500">Code</p>
                                <p className="font-mono font-bold text-base tracking-[0.15em] text-emerald-400">
                                    {otpCode}
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopyCode}
                            className="h-8 gap-1.5 rounded-lg bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-400 text-xs px-2.5"
                        >
                            {copied ? (
                                <>
                                    <Check className="h-3 w-3" />
                                    Copied
                                </>
                            ) : (
                                <>
                                    <Copy className="h-3 w-3" />
                                    Copy
                                </>
                            )}
                        </Button>
                    </motion.div>
                )}
            </div>
        </motion.div>
    )
})
