"use client"

import { Card } from "@/components/ui/card"
import { Activity, Database, Server, Cpu, HardDrive, ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react"
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { motion } from "framer-motion"

export function StatusCard({ title, status, latency, icon: Icon }: { title: string, status: string, latency?: number, icon: any }) {
    const isHealthy = status === 'healthy' || status === 'available'
    const color = isHealthy ? 'text-[hsl(var(--neon-lime))]' : 'text-red-500'
    const glow = isHealthy ? 'shadow-[0_0_20px_hsla(var(--neon-lime),0.2)]' : 'shadow-[0_0_20px_rgba(239,68,68,0.2)]'

    return (
        <motion.div whileHover={{ scale: 1.02 }} className="h-full">
            <Card className={`p-6 bg-black/40 border-white/10 backdrop-blur-xl ${glow} transition-shadow duration-300 h-full flex flex-col justify-between`}>
                <div className="flex justify-between items-start mb-4">
                    <div className={`p-3 rounded-xl bg-white/5 ${color}`}>
                        <Icon size={24} />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`flex h-2 w-2 rounded-full ${isHealthy ? 'bg-[hsl(var(--neon-lime))] animate-pulse' : 'bg-red-500'}`} />
                        <span className={`text-xs font-mono uppercase tracking-wider ${color}`}>
                            {status}
                        </span>
                    </div>
                </div>
                <div>
                    <h3 className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-1">{title}</h3>
                    <div className="flex items-end gap-2">
                        {latency !== undefined ? (
                            <>
                                <span className="text-2xl font-bold text-white">{latency}</span>
                                <span className="text-xs text-gray-500 mb-1">ms</span>
                            </>
                        ) : (
                            <span className="text-xs text-gray-500">Auto-Scaling</span>
                        )}
                    </div>
                </div>
            </Card>
        </motion.div>
    )
}

export function MetricChart({ data, title, color = "hsl(var(--neon-lime))" }: { data: any[], title: string, color?: string }) {
    return (
        <Card className="p-6 bg-black/40 border-white/10 backdrop-blur-xl">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Activity size={16} className="text-[hsl(var(--neon-lime))]" />
                {title}
            </h3>
            <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id={`color${title}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Tooltip
                            contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px' }}
                            itemStyle={{ color: '#fff' }}
                        />
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke={color}
                            strokeWidth={2}
                            fillOpacity={1}
                            fill={`url(#color${title})`}
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </Card>
    )
}

export function LiveLogFeed({ logs }: { logs: string[] }) {
    return (
        <Card className="p-0 bg-black/90 border-white/10 overflow-hidden font-mono text-xs h-[300px] flex flex-col">
            <div className="p-3 border-b border-white/10 bg-white/5 flex justify-between items-center">
                <span className="text-gray-400 uppercase tracking-widest">Live System Logs</span>
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide">
                {logs.length === 0 && <span className="text-gray-600 italic">Waiting for logs...</span>}
                {logs.map((log, i) => (
                    <div key={i} className="flex gap-3 text-gray-300 border-l-2 border-transparent hover:border-[hsl(var(--neon-lime))] pl-2 transition-all">
                        <span className="text-gray-600 shrink-0">{new Date().toLocaleTimeString()}</span>
                        <span className="break-all">{log}</span>
                    </div>
                ))}
            </div>
        </Card>
    )
}
