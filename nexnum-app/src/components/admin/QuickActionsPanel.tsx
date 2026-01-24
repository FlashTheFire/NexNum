"use client"

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
    Pause, Play, RefreshCw, AlertTriangle,
    BookOpen, Settings, Shield, Zap,
    ChevronRight, Loader2, CheckCircle, XCircle
} from 'lucide-react'

interface QuickAction {
    id: string
    label: string
    icon: React.ElementType
    description?: string
    color: 'emerald' | 'amber' | 'blue' | 'purple' | 'red'
    requiresMFA?: boolean
    href?: string
    onClick?: () => Promise<void>
}

interface QuickActionsPanelProps {
    onPauseProvider?: () => void
    onResumeProvider?: () => void
    onRetryJobs?: () => Promise<void>
    onMarkIncident?: () => void
    className?: string
}

const colorStyles = {
    emerald: {
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        text: 'text-emerald-400',
        hover: 'hover:bg-emerald-500/20 hover:border-emerald-500/30'
    },
    amber: {
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        text: 'text-amber-400',
        hover: 'hover:bg-amber-500/20 hover:border-amber-500/30'
    },
    blue: {
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20',
        text: 'text-blue-400',
        hover: 'hover:bg-blue-500/20 hover:border-blue-500/30'
    },
    purple: {
        bg: 'bg-purple-500/10',
        border: 'border-purple-500/20',
        text: 'text-purple-400',
        hover: 'hover:bg-purple-500/20 hover:border-purple-500/30'
    },
    red: {
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        text: 'text-red-400',
        hover: 'hover:bg-red-500/20 hover:border-red-500/30'
    }
}

function ActionButton({
    action,
    index,
    isExecuting,
    executionStatus,
    onExecute
}: {
    action: QuickAction
    index: number
    isExecuting: boolean
    executionStatus: 'idle' | 'loading' | 'success' | 'error'
    onExecute: () => void
}) {
    const colors = colorStyles[action.color]
    const Icon = action.icon

    const getStatusIcon = () => {
        if (executionStatus === 'loading') return <Loader2 className="w-4 h-4 animate-spin" />
        if (executionStatus === 'success') return <CheckCircle className="w-4 h-4 text-emerald-400" />
        if (executionStatus === 'error') return <XCircle className="w-4 h-4 text-red-400" />
        return null
    }

    if (action.href) {
        return (
            <motion.a
                href={action.href}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`
                    relative overflow-hidden rounded-xl
                    ${colors.bg} border ${colors.border}
                    p-4 group transition-all duration-300
                    ${colors.hover}
                    block
                `}
            >
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${colors.bg}`}>
                        <Icon className={`w-5 h-5 ${colors.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-white">{action.label}</span>
                            {action.requiresMFA && (
                                <Shield className="w-3 h-3 text-amber-400" />
                            )}
                        </div>
                        {action.description && (
                            <p className="text-xs text-white/40 truncate">{action.description}</p>
                        )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/60 transition-colors" />
                </div>
            </motion.a>
        )
    }

    return (
        <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={onExecute}
            disabled={isExecuting}
            className={`
                relative overflow-hidden rounded-xl
                ${colors.bg} border ${colors.border}
                p-4 group transition-all duration-300
                ${colors.hover}
                disabled:opacity-50 disabled:cursor-not-allowed
                w-full text-left
            `}
        >
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${colors.bg}`}>
                    <Icon className={`w-5 h-5 ${colors.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">{action.label}</span>
                        {action.requiresMFA && (
                            <Shield className="w-3 h-3 text-amber-400" />
                        )}
                    </div>
                    {action.description && (
                        <p className="text-xs text-white/40 truncate">{action.description}</p>
                    )}
                </div>
                <div className="w-6 h-6 flex items-center justify-center">
                    {getStatusIcon() || (
                        <Zap className="w-4 h-4 text-white/20 group-hover:text-white/60 transition-colors" />
                    )}
                </div>
            </div>
        </motion.button>
    )
}

export function QuickActionsPanel({
    onPauseProvider,
    onResumeProvider,
    onRetryJobs,
    onMarkIncident,
    className = ''
}: QuickActionsPanelProps) {
    const [executingAction, setExecutingAction] = useState<string | null>(null)
    const [actionStatus, setActionStatus] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({})

    const executeAction = async (actionId: string, handler?: () => Promise<void>) => {
        if (!handler) return

        setExecutingAction(actionId)
        setActionStatus(prev => ({ ...prev, [actionId]: 'loading' }))

        try {
            await handler()
            setActionStatus(prev => ({ ...prev, [actionId]: 'success' }))
            setTimeout(() => {
                setActionStatus(prev => ({ ...prev, [actionId]: 'idle' }))
            }, 2000)
        } catch (error) {
            setActionStatus(prev => ({ ...prev, [actionId]: 'error' }))
            setTimeout(() => {
                setActionStatus(prev => ({ ...prev, [actionId]: 'idle' }))
            }, 3000)
        } finally {
            setExecutingAction(null)
        }
    }

    const actions: QuickAction[] = [
        {
            id: 'pause-provider',
            label: 'Pause Provider',
            icon: Pause,
            description: 'Temporarily disable a provider',
            color: 'amber',
            requiresMFA: true,
            onClick: onPauseProvider ? async () => onPauseProvider() : undefined
        },
        {
            id: 'retry-jobs',
            label: 'Retry Failed Jobs',
            icon: RefreshCw,
            description: 'Retry all failed background jobs',
            color: 'blue',
            onClick: onRetryJobs
        },
        {
            id: 'mark-incident',
            label: 'Mark Incident',
            icon: AlertTriangle,
            description: 'Report a system incident',
            color: 'red',
            onClick: onMarkIncident ? async () => onMarkIncident() : undefined
        },
        {
            id: 'runbooks',
            label: 'Runbooks',
            icon: BookOpen,
            description: 'Operational procedures',
            color: 'purple',
            href: '/en/admin/runbooks'
        },
        {
            id: 'providers',
            label: 'Manage Providers',
            icon: Settings,
            description: 'Provider configuration',
            color: 'emerald',
            href: '/en/admin/providers'
        },
        {
            id: 'monitoring',
            label: 'System Monitoring',
            icon: Zap,
            description: 'Real-time metrics',
            color: 'blue',
            href: '/en/admin/monitoring'
        }
    ]

    return (
        <div className={className}>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">Quick Actions</h3>
                <span className="text-[10px] text-white/30 uppercase tracking-wider">
                    Admin Controls
                </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {actions.map((action, index) => (
                    <ActionButton
                        key={action.id}
                        action={action}
                        index={index}
                        isExecuting={executingAction === action.id}
                        executionStatus={actionStatus[action.id] || 'idle'}
                        onExecute={() => executeAction(action.id, action.onClick)}
                    />
                ))}
            </div>
        </div>
    )
}

export default QuickActionsPanel
