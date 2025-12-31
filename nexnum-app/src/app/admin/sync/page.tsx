"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { RefreshCw, CheckCircle, XCircle, Database, Server, Globe } from "lucide-react"

type SyncStats = {
    added: number
    updated: number
    total: number
}

type SyncResult = {
    success: boolean
    message: string
    stats?: SyncStats
    timestamp: number
}

const PROVIDERS = [
    { id: '5sim', name: '5sim', icon: Globe, color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/20' },
    { id: 'herosms', name: 'Hero SMS', icon: Server, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
    { id: 'smsbower', name: 'SMS Bower', icon: Database, color: 'text-purple-400', bg: 'bg-purple-400/10', border: 'border-purple-400/20' },
    { id: 'grizzlysms', name: 'Grizzly SMS', icon: Server, color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
    { id: 'onlinesim', name: 'OnlineSIM', icon: Globe, color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/20' },
]

export default function AdminSyncPage() {
    const [loading, setLoading] = useState<string | null>(null)
    const [results, setResults] = useState<Record<string, SyncResult>>({})

    const handleSync = async (providerId: string) => {
        setLoading(providerId)
        try {
            const res = await fetch('/api/admin/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: providerId })
            })
            const data = await res.json()

            setResults(prev => ({
                ...prev,
                [providerId]: {
                    success: res.ok,
                    message: data.message || data.error,
                    stats: data.stats,
                    timestamp: Date.now()
                }
            }))
        } catch (error) {
            setResults(prev => ({
                ...prev,
                [providerId]: {
                    success: false,
                    message: "Network error",
                    timestamp: Date.now()
                }
            }))
        } finally {
            setLoading(null)
        }
    }

    return (
        <div className="p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Provider Synchronization</h1>
                    <p className="text-gray-400">Sync services and countries from external SMS providers to local database.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {PROVIDERS.map((provider) => {
                    const result = results[provider.id]
                    const isLoading = loading === provider.id

                    return (
                        <motion.div
                            key={provider.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`relative overflow-hidden rounded-2xl bg-[#0a0a0c] border border-white/5 p-6 group hover:border-white/10 transition-colors`}
                        >
                            {/* Background Glow */}
                            <div className={`absolute top-0 right-0 w-32 h-32 ${provider.bg} blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 opacity-20 group-hover:opacity-40 transition-opacity`} />

                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-6">
                                    <div className={`w-12 h-12 rounded-xl ${provider.bg} flex items-center justify-center border ${provider.border}`}>
                                        <provider.icon className={provider.color} size={24} />
                                    </div>
                                    <button
                                        onClick={() => handleSync(provider.id)}
                                        disabled={!!loading}
                                        className={`p-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${isLoading ? 'animate-spin' : ''}`}
                                    >
                                        <RefreshCw size={20} className="text-white" />
                                    </button>
                                </div>

                                <h3 className="text-xl font-bold text-white mb-1">{provider.name}</h3>
                                <p className="text-sm text-gray-400 mb-6">Sync latest services & prices</p>

                                <AnimatePresence mode="wait">
                                    {result ? (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className={`rounded-lg p-3 ${result.success ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'} border`}
                                        >
                                            <div className="flex items-center gap-2 mb-2">
                                                {result.success ? (
                                                    <CheckCircle size={16} className="text-green-400" />
                                                ) : (
                                                    <XCircle size={16} className="text-red-400" />
                                                )}
                                                <span className={`text-sm font-medium ${result.success ? 'text-green-400' : 'text-red-400'}`}>
                                                    {result.success ? 'Sync Completed' : 'Sync Failed'}
                                                </span>
                                            </div>

                                            {result.stats && (
                                                <div className="grid grid-cols-3 gap-2 text-xs">
                                                    <div className="bg-black/20 rounded p-1 text-center">
                                                        <div className="text-gray-400">Added</div>
                                                        <div className="text-white font-mono">{result.stats.added}</div>
                                                    </div>
                                                    <div className="bg-black/20 rounded p-1 text-center">
                                                        <div className="text-gray-400">Updated</div>
                                                        <div className="text-white font-mono">{result.stats.updated}</div>
                                                    </div>
                                                    <div className="bg-black/20 rounded p-1 text-center">
                                                        <div className="text-gray-400">Total</div>
                                                        <div className="text-white font-mono">{result.stats.total}</div>
                                                    </div>
                                                </div>
                                            )}

                                            {!result.success && (
                                                <p className="text-xs text-red-300 mt-1">{result.message}</p>
                                            )}
                                        </motion.div>
                                    ) : (
                                        <div className="h-[86px] flex items-center justify-center text-gray-600 text-sm border border-dashed border-white/5 rounded-lg">
                                            Ready to sync
                                        </div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    )
                })}
            </div>
        </div>
    )
}
