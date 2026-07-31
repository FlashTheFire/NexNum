"use client"

import { motion } from "framer-motion"
import { LayoutGrid, Clock, CheckCircle2, Archive } from "lucide-react"

interface VaultMetricsBarProps {
    total: number
    active: number
    completed: number
    expired: number
}

export function VaultMetricsBar({ total, active, completed, expired }: VaultMetricsBarProps) {
    const metrics = [
        {
            label: "Total Registrations",
            value: total,
            icon: LayoutGrid,
            gradient: "from-blue-500/10 to-indigo-500/10",
            border: "border-blue-500/20",
            text: "text-blue-400",
            iconBg: "bg-blue-500/10 text-blue-400"
        },
        {
            label: "Active Verifications",
            value: active,
            icon: Clock,
            gradient: "from-[hsl(var(--neon-lime))/0.15] to-emerald-500/10",
            border: "border-[hsl(var(--neon-lime))/0.4]",
            text: "text-[hsl(var(--neon-lime))]",
            iconBg: "bg-[hsl(var(--neon-lime))/0.2] text-[hsl(var(--neon-lime))]",
            badge: "PULSING",
            pulse: true
        },
        {
            label: "SMS Delivered",
            value: completed,
            icon: CheckCircle2,
            gradient: "from-emerald-500/10 to-teal-500/10",
            border: "border-emerald-500/30",
            text: "text-emerald-400",
            iconBg: "bg-emerald-500/10 text-emerald-400"
        },
        {
            label: "Expired / Cancelled",
            value: expired,
            icon: Archive,
            gradient: "from-zinc-500/10 to-zinc-800/10",
            border: "border-white/10",
            text: "text-zinc-400",
            iconBg: "bg-zinc-800 text-zinc-400"
        }
    ]

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
            {metrics.map((m, idx) => {
                const Icon = m.icon
                return (
                    <motion.div
                        key={m.label}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: idx * 0.05 }}
                        className={`relative overflow-hidden rounded-2xl p-4 border bg-gradient-to-br ${m.gradient} ${m.border} backdrop-blur-xl group hover:border-white/30 transition-all duration-300`}
                    >
                        {/* Background subtle sheen */}
                        <div className="absolute inset-0 bg-white/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />

                        <div className="flex items-center justify-between relative z-10 mb-2">
                            <span className="text-xs font-semibold text-zinc-400 tracking-wide">
                                {m.label}
                            </span>
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${m.iconBg} relative`}>
                                <Icon className="w-4 h-4" />
                                {m.pulse && (
                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[hsl(var(--neon-lime))] animate-ping" />
                                )}
                            </div>
                        </div>

                        <div className="flex items-baseline justify-between relative z-10">
                            <span className={`text-2xl md:text-3xl font-black font-mono tracking-tight ${m.text}`}>
                                {m.value.toLocaleString()}
                            </span>
                            {m.badge && (
                                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[hsl(var(--neon-lime))/0.2] text-[hsl(var(--neon-lime))] border border-[hsl(var(--neon-lime))/0.4]">
                                    Live
                                </span>
                            )}
                        </div>
                    </motion.div>
                )
            })}
        </div>
    )
}
