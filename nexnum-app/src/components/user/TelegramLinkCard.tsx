'use client'

import { useState } from 'react'
import { Send, CheckCircle2, ArrowUpRight, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface TelegramLinkCardProps {
    telegramId?: string | null
    username?: string | null
}

export function TelegramLinkCard({ telegramId, username }: TelegramLinkCardProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const isLinked = Boolean(telegramId)

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
        } catch (err: any) {
            setError('Connection failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="relative group w-full"
        >
            {/* Ambient Background Glow */}
            <div className={`absolute inset-0 blur-3xl opacity-20 group-hover:opacity-40 transition-opacity duration-700 rounded-3xl ${isLinked ? 'bg-emerald-500/30' : 'bg-[hsl(var(--neon-lime)/0.4)]'}`} />
            
            <div className={`relative overflow-hidden border backdrop-blur-2xl p-6 sm:p-8 rounded-[2rem] text-white shadow-2xl transition-all duration-500
                ${isLinked 
                    ? 'bg-gradient-to-br from-emerald-950/40 via-emerald-900/10 to-emerald-950/40 border-emerald-500/20 shadow-emerald-950/30 hover:border-emerald-500/40' 
                    : 'bg-gradient-to-br from-white/[0.04] via-transparent to-[hsl(var(--neon-lime)/0.04)] border-white/[0.05] shadow-[hsl(var(--neon-lime)/0.02)] hover:border-[hsl(var(--neon-lime)/0.3)]'
                }`}
            >
                {/* Decorative Noise overlay */}
                <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] pointer-events-none mix-blend-overlay" />

                <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                    <div className="flex items-center space-x-5">
                        <motion.div 
                            whileHover={{ scale: 1.05, rotate: isLinked ? 0 : 5 }}
                            whileTap={{ scale: 0.95 }}
                            className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-inner backdrop-blur-md border ${
                                isLinked 
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                                : 'bg-[hsl(var(--neon-lime)/0.1)] border-[hsl(var(--neon-lime)/0.3)] text-[hsl(var(--neon-lime))]'
                            }`}
                        >
                            {isLinked ? <CheckCircle2 className="w-6 h-6" /> : <Send className="w-6 h-6 ml-1" />}
                        </motion.div>
                        
                        <div className="space-y-1.5">
                            <h4 className={`font-bold tracking-tight text-lg sm:text-xl flex items-center gap-2 ${isLinked ? 'text-emerald-300' : 'text-white'}`}>
                                {isLinked ? 'Telegram Synced' : 'Connect Telegram AI Bot'}
                                {!isLinked && <Sparkles className="w-4 h-4 text-[hsl(var(--neon-lime))] animate-pulse" />}
                            </h4>
                            
                            {isLinked ? (
                                <p className="text-sm font-medium text-emerald-400/70">
                                    Linked ID: <code className="bg-emerald-950/80 border border-emerald-800/60 px-2 py-0.5 rounded-md font-mono text-[12px] text-emerald-200 tracking-wider shadow-inner">{telegramId}</code>
                                    {username && <span className="ml-2">(@{username})</span>}
                                </p>
                            ) : (
                                <p className="text-sm text-gray-400 leading-relaxed max-w-lg">
                                    Sync your account to receive instant OTP codes, low balance alerts, and one-tap number purchases directly within Telegram.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="shrink-0 w-full sm:w-auto">
                        {isLinked ? (
                            <motion.a
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                href="https://t.me/NexNumBot"
                                target="_blank"
                                rel="noreferrer"
                                className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-emerald-500 text-emerald-950 font-bold px-6 py-3 rounded-xl transition-colors hover:bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                            >
                                Open Bot <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                            </motion.a>
                        ) : (
                            <div className="flex flex-col gap-2">
                                <motion.button
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    onClick={handleConnect}
                                    disabled={loading}
                                    className="group relative w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[hsl(var(--neon-lime))] text-black font-extrabold px-7 py-3.5 rounded-xl transition-all disabled:opacity-50 overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                                    <span className="relative z-10">{loading ? 'Generating Link...' : 'Sync Now 🚀'}</span>
                                </motion.button>
                                <AnimatePresence>
                                    {error && (
                                        <motion.p 
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="text-xs text-red-400 font-medium text-center sm:text-left"
                                        >
                                            {error}
                                        </motion.p>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    )
}


