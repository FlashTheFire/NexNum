'use client'

import { useState } from 'react'
import { Send, CheckCircle2, ArrowUpRight } from 'lucide-react'

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

    if (isLinked) {
        return (
            <div className="bg-gradient-to-r from-emerald-950/50 via-emerald-900/30 to-emerald-950/50 border border-emerald-500/40 backdrop-blur-xl p-5 rounded-2xl text-emerald-100 flex items-center justify-between shadow-xl shadow-emerald-950/20">
                <div className="flex items-center space-x-3.5">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-md">
                        <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="font-bold text-emerald-300 text-sm sm:text-base">Telegram Account Connected</h4>
                        <p className="text-xs text-emerald-400/80 mt-0.5">
                            Linked ID: <code className="bg-emerald-900/70 border border-emerald-700/50 px-1.5 py-0.5 rounded font-mono text-[11px] text-white">{telegramId}</code> {username ? `(@${username})` : ''}
                        </p>
                    </div>
                </div>
                <a
                    href="https://t.me/NexNumBot"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center text-xs bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold px-3.5 py-2 rounded-xl transition shadow-md hover:scale-105 shrink-0"
                >
                    Open Bot <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
                </a>
            </div>
        )
    }

    return (
        <div className="bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-[hsl(var(--neon-lime)/0.08)] border border-[hsl(var(--neon-lime)/0.3)] backdrop-blur-xl p-5 rounded-2xl text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xl shadow-[hsl(var(--neon-lime)/0.05)] hover:border-[hsl(var(--neon-lime)/0.5)] transition-all duration-300">
            <div className="flex items-center space-x-3.5">
                <div className="w-10 h-10 rounded-xl bg-[hsl(var(--neon-lime)/0.15)] border border-[hsl(var(--neon-lime)/0.3)] flex items-center justify-center text-[hsl(var(--neon-lime))] shrink-0 shadow-md">
                    <Send className="w-5 h-5" />
                </div>
                <div>
                    <h4 className="font-bold text-[hsl(var(--neon-lime))] neon-text-glow text-sm sm:text-base">
                        Connect Telegram Bot
                    </h4>
                    <p className="text-xs text-gray-300/80 leading-relaxed mt-0.5 max-w-xl">
                        Receive instant SMS notifications, low balance alerts, and access numbers inside the Telegram Mini App.
                    </p>
                </div>
            </div>
            <button
                onClick={handleConnect}
                disabled={loading}
                className="text-xs bg-[hsl(var(--neon-lime))] hover:bg-[hsl(var(--neon-lime-soft))] disabled:opacity-50 text-black font-extrabold px-5 py-2.5 rounded-xl transition-all duration-200 shadow-lg shadow-[hsl(var(--neon-lime)/0.25)] hover:scale-[1.02] active:scale-[0.98] shrink-0"
            >
                {loading ? 'Connecting...' : 'Connect Telegram 🚀'}
            </button>
            {error && <p className="text-xs text-red-400 mt-1 w-full">{error}</p>}
        </div>
    )
}

