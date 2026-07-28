'use client'

import { useState } from 'react'

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
            <div className="bg-emerald-950/40 border border-emerald-500/30 p-4 rounded-xl text-emerald-100 flex items-center justify-between shadow-lg">
                <div className="flex items-center space-x-3">
                    <span className="text-2xl">✅</span>
                    <div>
                        <h4 className="font-semibold text-emerald-300">Telegram Account Connected</h4>
                        <p className="text-xs text-emerald-400">
                            Linked to Telegram ID: <code className="bg-emerald-900/60 px-1 py-0.5 rounded">{telegramId}</code> {username ? `(@${username})` : ''}
                        </p>
                    </div>
                </div>
                <a
                    href="https://t.me/NexNumBot"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-3 py-1.5 rounded-lg transition"
                >
                    Open Bot ↗
                </a>
            </div>
        )
    }

    return (
        <div className="bg-gradient-to-r from-blue-900/50 to-indigo-900/50 border border-blue-500/30 p-4 rounded-xl text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center space-x-3">
                <span className="text-2xl">📱</span>
                <div>
                    <h4 className="font-semibold text-blue-200">Connect Telegram Bot</h4>
                    <p className="text-xs text-blue-300">
                        Receive instant SMS notifications, low balance alerts, and access numbers inside Telegram Mini App.
                    </p>
                </div>
            </div>
            <button
                onClick={handleConnect}
                disabled={loading}
                className="text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg transition shrink-0"
            >
                {loading ? 'Connecting...' : 'Connect Telegram 🚀'}
            </button>
            {error && <p className="text-xs text-red-400 mt-1 w-full">{error}</p>}
        </div>
    )
}
