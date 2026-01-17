
"use client"

import { useState, useRef, useEffect } from "react"
import { toast } from "sonner"
import { BellRing, Radio, Send, TerminalSquare, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react"
import { useAuthStore } from "@/stores/authStore"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils/utils"

export default function TestNotificationsPage() {
    const { user } = useAuthStore()
    const [loading, setLoading] = useState(false)
    const [broadcastLoading, setBroadcastLoading] = useState(false)

    // Broadcast State
    const [title, setTitle] = useState("System Maintenance")
    const [message, setMessage] = useState("Scheduled maintenance in 10 minutes.")
    const [logs, setLogs] = useState<{ type: 'info' | 'success' | 'error', text: string }[]>([])
    const [stats, setStats] = useState<{ total: number, success: number, failed: number } | null>(null)
    const terminalEndRef = useRef<HTMLDivElement>(null)

    // Auto-scroll terminal
    useEffect(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [logs])

    const sendTestPush = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/debug/push', { method: 'POST' })
            if (!res.ok) throw new Error('Failed to send')

            toast.success("Test Sent", {
                description: "Check your other devices or close this tab to test background delivery.",
                icon: <CheckCircle2 className="text-[hsl(var(--neon-lime))]" />
            })
        } catch (error) {
            toast.error("Failed", { description: "Could not send test push." })
        } finally {
            setLoading(false)
        }
    }

    const sendBroadcast = async () => {
        setBroadcastLoading(true)
        setLogs([{ type: 'info', text: "Initializing broadcast system..." }, { type: 'info', text: "Fetching active subscribers..." }])
        setStats(null)

        try {
            const res = await fetch('/api/debug/push/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, message })
            })

            if (res.status === 403) {
                toast.error("Unauthorized", { description: "Admin privileges required." })
                setLogs(prev => [...prev, { type: 'error', text: "❌ Error: Unauthorized (Admin access required)" }])
                return
            }

            if (!res.ok) throw new Error('Broadcast failed')

            const data = await res.json()
            setStats({
                total: data.data.total,
                success: data.data.success,
                failed: data.data.failed
            })

            // Add logs with delay for effect
            data.data.logs.forEach((log: string, i: number) => {
                setTimeout(() => {
                    const isErr = log.includes('Failed')
                    setLogs(prev => [...prev, { type: isErr ? 'error' : 'success', text: log }])
                }, i * 50)
            })

            setTimeout(() => {
                setLogs(prev => [...prev, { type: 'success', text: "✅ Broadcast Sequence Complete" }])
                toast.success("Broadcast Complete", {
                    description: `Sent to ${data.data.success} users.`
                })
            }, data.data.logs.length * 50 + 500)

        } catch (error) {
            console.error(error)
            toast.error("Broadcast Failed")
            setLogs(prev => [...prev, { type: 'error', text: "❌ Critical Failure executing broadcast" }])
        } finally {
            setBroadcastLoading(false)
        }
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[85vh] p-4 max-w-5xl mx-auto space-y-16">

            {/* User Test Section - Hero Style */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-center relative z-10"
            >
                <div className="relative inline-block mb-8 group">
                    <div className="absolute inset-0 bg-[hsl(var(--neon-lime))] blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity duration-700 rounded-full" />
                    <div className="relative w-24 h-24 rounded-[2rem] bg-gradient-to-br from-[#1c1c1f] to-[#0f0f11] flex items-center justify-center ring-1 ring-white/10 shadow-2xl shadow-black/50 group-hover:scale-105 transition-transform duration-300">
                        <BellRing className="w-10 h-10 text-[hsl(var(--neon-lime))] group-hover:animate-pulse" />

                        {/* Status Dot */}
                        <div className="absolute -top-1 -right-1 h-5 w-5 bg-[#0A0A0C] rounded-full flex items-center justify-center">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--neon-lime))] opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-[hsl(var(--neon-lime))]"></span>
                            </span>
                        </div>
                    </div>
                </div>

                <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight drop-shadow-lg">
                    Push Notification <span className="text-transparent bg-clip-text bg-gradient-to-r from-[hsl(var(--neon-lime))] to-emerald-400">Tester</span>
                </h1>
                <p className="text-white/40 max-w-lg mx-auto text-lg mb-10 leading-relaxed font-light">
                    Trigger a server-side push verify background delivery mechanics.
                    <span className="block mt-2 text-white/20 text-sm">Works even when the browser is closed.</span>
                </p>

                <button
                    onClick={sendTestPush}
                    disabled={loading}
                    className="group relative px-10 py-4 rounded-2xl bg-[hsl(var(--neon-lime))] text-black font-bold text-lg hover:brightness-110 active:scale-95 transition-all flex items-center gap-3 mx-auto disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden shadow-[0_0_40px_-10px_hsl(var(--neon-lime))/0.5]"
                >
                    <span className="relative z-10 flex items-center gap-2">
                        {loading ? (
                            <>Sending Signal...</>
                        ) : (
                            <>
                                <BellRing className="w-5 h-5 fill-current" />
                                Trigger Background Push
                            </>
                        )}
                    </span>
                    {/* Button Glare */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-700 ease-in-out" />
                </button>
            </motion.div>

            {/* Admin Zone - Restricted Access UI */}
            <AnimatePresence>
                {user?.role === 'ADMIN' && (
                    <motion.div
                        initial={{ opacity: 0, y: 40 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.6 }}
                        className="w-full max-w-6xl border-t border-white/5 pt-16"
                    >
                        <div className="relative bg-[#0A0A0C] border border-red-500/20 rounded-3xl p-1 overflow-hidden">
                            {/* Hazard Stripes */}
                            <div className="absolute top-0 inset-x-0 h-1 bg-[repeating-linear-gradient(45deg,rgba(220,38,38,0.3),rgba(220,38,38,0.3)_10px,transparent_10px,transparent_20px)] opacity-50" />

                            <div className="bg-[#111113] rounded-[22px] p-8 md:p-10 relative overflow-hidden">
                                {/* Ambient Red Glow */}
                                <div className="absolute -top-20 -right-20 w-96 h-96 bg-red-600/5 rounded-full blur-[120px] pointer-events-none" />

                                <div className="flex items-center justify-between mb-8 relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20 shadow-[0_0_20px_-5px_rgba(220,38,38,0.3)]">
                                            <ShieldAlert className="h-6 w-6 text-red-500" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                                Admin Broadcast Zone
                                                <span className="px-2 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 font-mono tracking-wider border border-red-500/10">RESTRICTED</span>
                                            </h2>
                                            <p className="text-white/30 text-sm">Send global notifications to all verified subscribers.</p>
                                        </div>
                                    </div>

                                    <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-lg bg-black/40 border border-white/5 text-xs font-mono text-gray-500">
                                        <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                                        SYSTEM LIVE
                                    </div>
                                </div>

                                <div className="grid lg:grid-cols-5 gap-8 relative z-10">
                                    {/* Inputs Column */}
                                    <div className="lg:col-span-2 space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">Notification Title</label>
                                            <input
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 transition-all font-medium"
                                                placeholder="e.g. System Update"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest pl-1">Message Body</label>
                                            <textarea
                                                value={message}
                                                onChange={(e) => setMessage(e.target.value)}
                                                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 transition-all h-32 resize-none font-medium leading-relaxed"
                                                placeholder="Enter your broadcast message..."
                                            />
                                        </div>

                                        <button
                                            onClick={sendBroadcast}
                                            disabled={broadcastLoading}
                                            className="w-full py-4 rounded-xl bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_5px_20px_-5px_rgba(220,38,38,0.4)] group border border-red-500/20"
                                        >
                                            {broadcastLoading ? (
                                                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <>
                                                    <Send className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                                    INITIATE BROADCAST
                                                </>
                                            )}
                                        </button>

                                        <div className="flex items-start gap-2 text-[11px] text-white/20 leading-snug px-2">
                                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-amber-500/50" />
                                            Warning: This action cannot be undone. All active users will receive this push immediately.
                                        </div>
                                    </div>

                                    {/* Terminal Column */}
                                    <div className="lg:col-span-3 flex flex-col h-full bg-[#050505] rounded-xl border border-white/5 font-mono text-xs overflow-hidden shadow-inner relative">
                                        {/* Scanline Effect */}
                                        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-[1] bg-[length:100%_4px,6px_100%] pointer-events-none opacity-20" />

                                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                                            <div className="flex items-center gap-2 text-gray-500">
                                                <TerminalSquare className="w-3.5 h-3.5" />
                                                <span className="font-semibold tracking-wider">root@nexnum-core:~/broadcast</span>
                                            </div>
                                            {stats && (
                                                <div className="flex gap-3 text-[10px] font-bold">
                                                    <span className="text-green-500">PASS: {stats.success}</span>
                                                    <span className="text-red-500">FAIL: {stats.failed}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 overflow-y-auto p-4 space-y-1.5 text-gray-300 font-medium scrollbar-thin scrollbar-thumb-white/10 z-10">
                                            {logs.length === 0 ? (
                                                <div className="h-full flex flex-col items-center justify-center text-white/10 space-y-2">
                                                    <Radio className="w-8 h-8 animate-pulse" />
                                                    <span>Waiting for command...</span>
                                                </div>
                                            ) : (
                                                logs.map((log, i) => (
                                                    <motion.div
                                                        key={i}
                                                        initial={{ opacity: 0, x: -10 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        className={cn(
                                                            "break-all flex gap-2",
                                                            log.type === 'error' ? "text-red-400" :
                                                                log.type === 'success' ? "text-green-400" : "text-blue-300"
                                                        )}
                                                    >
                                                        <span className="opacity-50 select-none">›</span>
                                                        {log.text}
                                                    </motion.div>
                                                ))
                                            )}
                                            <div ref={terminalEndRef} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
