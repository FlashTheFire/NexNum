'use client'

import { useState, useEffect } from 'react'
import { Send, CheckCircle2, ArrowUpRight, X, BotMessageSquare } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils/utils'

const DISMISS_KEY = 'telegram-link-card-dismissed'
const DISMISS_DURATION_MS = 10 * 60 * 1000 // 10 minutes

interface TelegramLinkCardProps {
    telegramId?: string | null
    username?: string | null
    className?: string
}

export function TelegramLinkCard({ telegramId, username, className }: TelegramLinkCardProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [visible, setVisible] = useState(false) // start hidden to avoid SSR flash

    const isLinked = Boolean(telegramId)

    // Read dismiss state after mount (client-only)
    useEffect(() => {
        const raw = localStorage.getItem(DISMISS_KEY)
        if (raw) {
            const dismissedAt = parseInt(raw, 10)
            if (Date.now() - dismissedAt < DISMISS_DURATION_MS) {
                setVisible(false)
                return
            }
        }
        setVisible(true)
    }, [])

    const handleDismiss = () => {
        localStorage.setItem(DISMISS_KEY, String(Date.now()))
        setVisible(false)
    }

    const handleConnect = async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/user/link-telegram', { method: 'POST' })
            const data = await res.json()
            if (data.link) {
                window.open(data.link, '_blank')
            } else {
                setError(data.error || 'Failed to generate connection link')
            }
        } catch {
            setError('Connection failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    key="telegram-link-card"
                    initial={{ opacity: 0, y: -10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    className={cn('relative w-full select-none', className)}
                >
                    {/* ── Neobrutalist card shell ── */}
                    <div
                        className={cn(
                            'relative w-full rounded-xl border-2 bg-[#0d0e12] p-4 transition-all',
                            isLinked
                                ? 'border-emerald-400 shadow-[4px_4px_0px_0px_#34d399]'
                                : 'border-[hsl(var(--neon-lime))] shadow-[4px_4px_0px_0px_hsl(var(--neon-lime))]'
                        )}
                    >
                        {/* ── Dismiss button ── */}
                        {!isLinked && (
                            <button
                                onClick={handleDismiss}
                                aria-label="Dismiss for 10 minutes"
                                className="absolute top-3 right-3 z-20 flex items-center justify-center h-6 w-6 rounded border-2 border-black bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white shadow-[1px_1px_0px_0px_#000] transition-colors"
                            >
                                <X className="h-3.5 w-3.5 stroke-[2.5]" />
                            </button>
                        )}

                        {/* ── Content row ── */}
                        <div className="flex items-start gap-3 pr-8">
                            {/* Icon box — neobrutalist accent */}
                            <div
                                className={cn(
                                    'p-2.5 rounded-lg border-2 border-black shrink-0 font-bold',
                                    isLinked
                                        ? 'bg-emerald-400 text-black shadow-[3px_3px_0px_0px_#34d399]'
                                        : 'bg-[hsl(var(--neon-lime))] text-black shadow-[3px_3px_0px_0px_hsl(var(--neon-lime))]'
                                )}
                            >
                                {isLinked
                                    ? <CheckCircle2 className="h-5 w-5 stroke-[2.5]" />
                                    : <BotMessageSquare className="h-5 w-5 stroke-[2.5]" />
                                }
                            </div>

                            {/* Text content */}
                            <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h5 className="text-sm font-black text-white leading-tight uppercase tracking-wide">
                                        {isLinked ? 'Telegram Synced' : 'Connect Telegram AI Bot'}
                                    </h5>
                                    <span
                                        className={cn(
                                            'px-1.5 py-0.5 rounded border text-[9px] font-mono font-extrabold uppercase tracking-wider border-black shadow-[1px_1px_0px_0px_#000]',
                                            isLinked
                                                ? 'bg-emerald-400 text-black'
                                                : 'bg-[hsl(var(--neon-lime))] text-black'
                                        )}
                                    >
                                        {isLinked ? 'ACTIVE' : 'SETUP'}
                                    </span>
                                </div>

                                {isLinked ? (
                                    <p className="text-xs font-mono text-zinc-300 leading-relaxed">
                                        Linked&nbsp;
                                        <code className="bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 rounded text-emerald-300 font-mono text-[11px] tracking-wider">
                                            {telegramId}
                                        </code>
                                        {username && <span className="text-zinc-400 ml-1">(@{username})</span>}
                                    </p>
                                ) : (
                                    <p className="text-xs font-mono text-zinc-300 leading-relaxed">
                                        Receive instant OTP codes, balance alerts &amp; one-tap purchases right in Telegram.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* ── Action row ── */}
                        <div className="mt-3 flex flex-col gap-1.5">
                            {isLinked ? (
                                <a
                                    href="https://t.me/NexNumBot"
                                    target="_blank"
                                    rel="noreferrer"
                                    className={cn(
                                        'inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-black px-4 py-2',
                                        'bg-emerald-400 text-black text-xs font-black uppercase tracking-wide',
                                        'shadow-[3px_3px_0px_0px_#000] hover:shadow-[1px_1px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px]',
                                        'transition-all duration-100 w-full sm:w-auto'
                                    )}
                                >
                                    Open Bot <ArrowUpRight className="h-3.5 w-3.5 stroke-[2.5]" />
                                </a>
                            ) : (
                                <button
                                    onClick={handleConnect}
                                    disabled={loading}
                                    className={cn(
                                        'inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-black px-4 py-2',
                                        'bg-[hsl(var(--neon-lime))] text-black text-xs font-black uppercase tracking-wide',
                                        'shadow-[3px_3px_0px_0px_#000] hover:shadow-[1px_1px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px]',
                                        'transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-[3px_3px_0px_0px_#000] disabled:translate-x-0 disabled:translate-y-0',
                                        'w-full sm:w-auto'
                                    )}
                                >
                                    <Send className="h-3.5 w-3.5 stroke-[2.5]" />
                                    {loading ? 'Generating Link...' : 'Sync Now →'}
                                </button>
                            )}

                            <AnimatePresence>
                                {error && (
                                    <motion.p
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="text-[11px] font-mono text-red-400 font-semibold"
                                    >
                                        ⚠ {error}
                                    </motion.p>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* ── Dismiss hint ── */}
                        {!isLinked && (
                            <p className="mt-2 text-[10px] font-mono text-zinc-600 text-right">
                                hide for 10 min →&nbsp;
                                <button onClick={handleDismiss} className="underline underline-offset-2 hover:text-zinc-400 transition-colors">
                                    dismiss
                                </button>
                            </p>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
