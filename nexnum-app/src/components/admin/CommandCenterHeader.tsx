"use client"

import React from 'react'
import { motion } from 'framer-motion'
import { Activity, Wifi, WifiOff, AlertTriangle } from 'lucide-react'

type SystemStatus = 'healthy' | 'degraded' | 'critical' | 'unknown'

interface CommandCenterHeaderProps {
    systemStatus: SystemStatus
    lastCheck: string | null
    isLoading?: boolean
    onRefresh?: () => void
}

const statusConfig = {
    healthy: {
        color: 'bg-emerald-500',
        glow: 'shadow-emerald-500/50',
        text: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
        label: 'ALL SYSTEMS OPERATIONAL',
        icon: Wifi
    },
    degraded: {
        color: 'bg-amber-500',
        glow: 'shadow-amber-500/50',
        text: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        label: 'DEGRADED PERFORMANCE',
        icon: AlertTriangle
    },
    critical: {
        color: 'bg-red-500',
        glow: 'shadow-red-500/50',
        text: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        label: 'CRITICAL ISSUES DETECTED',
        icon: WifiOff
    },
    unknown: {
        color: 'bg-gray-500',
        glow: 'shadow-gray-500/50',
        text: 'text-gray-400',
        bg: 'bg-gray-500/10',
        border: 'border-gray-500/30',
        label: 'STATUS UNKNOWN',
        icon: Activity
    }
}

export function CommandCenterHeader({
    systemStatus,
    lastCheck,
    isLoading = false,
    onRefresh
}: CommandCenterHeaderProps) {
    const config = statusConfig[systemStatus] || statusConfig.unknown
    const StatusIcon = config.icon

    const formatTime = (dateStr: string | null) => {
        if (!dateStr) return 'Never'
        const date = new Date(dateStr)
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        })
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`
                relative overflow-hidden rounded-2xl 
                bg-gradient-to-r from-[#0F1115] via-[#131720] to-[#0F1115]
                border ${config.border}
                p-4 md:p-5
            `}
        >
            {/* Background Glow Effect */}
            <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-1 ${config.color} blur-xl opacity-50`} />
            <div className={`absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent ${config.text} to-transparent opacity-30`} />

            <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                {/* Status Indicator */}
                <div className="flex items-center gap-4">
                    {/* Animated Status Dot */}
                    <div className="relative">
                        <motion.div
                            animate={{
                                scale: [1, 1.2, 1],
                                opacity: [0.5, 1, 0.5]
                            }}
                            transition={{
                                duration: 2,
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                            className={`absolute inset-0 rounded-full ${config.color} blur-md`}
                        />
                        <div className={`relative w-4 h-4 rounded-full ${config.color} ${config.glow} shadow-lg`}>
                            {isLoading && (
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                    className="absolute inset-0 border-2 border-white/30 border-t-white rounded-full"
                                />
                            )}
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center gap-2">
                            <StatusIcon className={`w-4 h-4 ${config.text}`} />
                            <h1 className="text-lg md:text-xl font-bold text-white tracking-tight">
                                Command Center
                            </h1>
                        </div>
                        <div className={`text-xs font-bold ${config.text} tracking-wider mt-0.5`}>
                            {config.label}
                        </div>
                    </div>
                </div>

                {/* Right Side Info */}
                <div className="flex items-center gap-4 text-xs text-white/40">
                    <div className="flex items-center gap-2">
                        <span className="text-white/60">Last check:</span>
                        <span className="font-mono">{formatTime(lastCheck)}</span>
                    </div>

                    {onRefresh && (
                        <button
                            onClick={onRefresh}
                            disabled={isLoading}
                            className={`
                                p-2 rounded-lg border transition-all
                                ${isLoading
                                    ? 'border-white/5 text-white/20 cursor-not-allowed'
                                    : 'border-white/10 text-white/60 hover:text-white hover:border-white/20 hover:bg-white/5'
                                }
                            `}
                        >
                            <Activity className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        </button>
                    )}
                </div>
            </div>

            {/* Bottom Status Bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px]">
                <motion.div
                    className={`h-full ${config.color}`}
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                />
            </div>
        </motion.div>
    )
}

export default CommandCenterHeader
