"use client"

import React from 'react'
import { motion } from 'framer-motion'
import {
    AlertCircle, AlertTriangle, Info,
    Clock, ExternalLink, ChevronRight
} from 'lucide-react'

type IncidentSeverity = 'critical' | 'warning' | 'info'

interface Incident {
    id: string
    title: string
    severity: IncidentSeverity
    timestamp: string
    affectedSystem?: string
    description?: string
    runbookUrl?: string
}

interface IncidentsSummaryProps {
    incidents: Incident[]
    maxDisplay?: number
    isLoading?: boolean
    onViewAll?: () => void
}

const severityConfig = {
    critical: {
        icon: AlertCircle,
        bg: 'bg-red-500/10',
        border: 'border-red-500/30',
        text: 'text-red-400',
        badge: 'bg-red-500/20 text-red-400 border-red-500/30',
        dot: 'bg-red-500'
    },
    warning: {
        icon: AlertTriangle,
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
        text: 'text-amber-400',
        badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        dot: 'bg-amber-500'
    },
    info: {
        icon: Info,
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/30',
        text: 'text-blue-400',
        badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
        dot: 'bg-blue-500'
    }
}

function IncidentCard({ incident, index }: { incident: Incident; index: number }) {
    const config = severityConfig[incident.severity]
    const Icon = config.icon

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMins / 60)
        const diffDays = Math.floor(diffHours / 24)

        if (diffMins < 60) return `${diffMins}m ago`
        if (diffHours < 24) return `${diffHours}h ago`
        return `${diffDays}d ago`
    }

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className={`
                relative overflow-hidden rounded-xl
                ${config.bg} border ${config.border}
                p-4 group hover:border-white/20 transition-all duration-300
            `}
        >
            <div className="flex items-start gap-3">
                {/* Severity Icon */}
                <div className={`p-2 rounded-lg ${config.bg} shrink-0`}>
                    <Icon className={`w-4 h-4 ${config.text}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-white truncate">
                            {incident.title}
                        </h4>
                        <span className={`
                            px-1.5 py-0.5 text-[10px] font-bold uppercase
                            rounded border ${config.badge}
                        `}>
                            {incident.severity}
                        </span>
                    </div>

                    {incident.description && (
                        <p className="text-xs text-white/50 line-clamp-1 mb-2">
                            {incident.description}
                        </p>
                    )}

                    <div className="flex items-center gap-3 text-[10px] text-white/40">
                        <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTime(incident.timestamp)}
                        </div>
                        {incident.affectedSystem && (
                            <div className="flex items-center gap-1">
                                <div className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                                {incident.affectedSystem}
                            </div>
                        )}
                    </div>
                </div>

                {/* Runbook Link */}
                {incident.runbookUrl && (
                    <a
                        href={incident.runbookUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`
                            p-2 rounded-lg ${config.bg}
                            opacity-0 group-hover:opacity-100
                            transition-opacity ${config.text}
                            hover:bg-white/10
                        `}
                    >
                        <ExternalLink className="w-4 h-4" />
                    </a>
                )}
            </div>
        </motion.div>
    )
}

export function IncidentsSummary({
    incidents,
    maxDisplay = 3,
    isLoading = false,
    onViewAll
}: IncidentsSummaryProps) {
    const displayIncidents = incidents.slice(0, maxDisplay)
    const hasMore = incidents.length > maxDisplay

    if (isLoading) {
        return (
            <div className="space-y-3">
                <div className="flex items-center justify-between mb-4">
                    <div className="h-5 w-32 bg-white/5 rounded animate-pulse" />
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-20 rounded-xl bg-[#0F1115] border border-white/5 animate-pulse"
                    />
                ))}
            </div>
        )
    }

    if (incidents.length === 0) {
        return (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-emerald-500" />
                </div>
                <h4 className="text-sm font-medium text-emerald-400 mb-1">No Active Incidents</h4>
                <p className="text-xs text-white/40">All systems operating normally</p>
            </div>
        )
    }

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">Active Incidents</h3>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-red-500/20 text-red-400 rounded-full">
                        {incidents.length}
                    </span>
                </div>
                {hasMore && onViewAll && (
                    <button
                        onClick={onViewAll}
                        className="flex items-center gap-1 text-xs text-white/40 hover:text-white transition-colors"
                    >
                        View all
                        <ChevronRight className="w-3 h-3" />
                    </button>
                )}
            </div>

            {/* Incidents List */}
            <div className="space-y-3">
                {displayIncidents.map((incident, index) => (
                    <IncidentCard key={incident.id} incident={incident} index={index} />
                ))}
            </div>
        </div>
    )
}

export default IncidentsSummary
