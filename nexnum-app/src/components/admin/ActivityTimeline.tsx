"use client"

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Shield, UserPlus, Settings, RefreshCw, DollarSign, Ban,
    CheckCircle, XCircle, Upload, Trash2, Edit, Activity,
    ChevronDown, Filter
} from 'lucide-react'

interface ActivityItem {
    id: string
    action: string
    resourceType: string | null
    resourceId: string | null
    user: string
    timestamp: string
    metadata: any
}

// Action icon and color mapping
const ACTION_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
    'PROVIDER_CREATE': { icon: UserPlus, color: 'emerald', label: 'Created Provider' },
    'PROVIDER_UPDATE': { icon: Edit, color: 'cyan', label: 'Updated Provider' },
    'PROVIDER_DELETE': { icon: Trash2, color: 'red', label: 'Deleted Provider' },
    'PROVIDER_TOGGLE': { icon: Settings, color: 'amber', label: 'Toggled Provider' },
    'SYNC_TRIGGERED': { icon: RefreshCw, color: 'violet', label: 'Sync Triggered' },
    'USER_BAN': { icon: Ban, color: 'red', label: 'Banned User' },
    'USER_UNBAN': { icon: CheckCircle, color: 'emerald', label: 'Unbanned User' },
    'WALLET_TOPUP': { icon: DollarSign, color: 'emerald', label: 'Wallet Top-up' },
    'admin.wallet_adjustment': { icon: DollarSign, color: 'amber', label: 'Wallet Adjusted' },
    'admin.user_update': { icon: Edit, color: 'cyan', label: 'User Updated' },
    'admin.bulk_ban': { icon: Ban, color: 'red', label: 'Bulk Ban' },
    'admin.bulk_unban': { icon: CheckCircle, color: 'emerald', label: 'Bulk Unban' },
}

function getActionConfig(action: string) {
    return ACTION_CONFIG[action] || {
        icon: Activity,
        color: 'gray',
        label: action.replace(/_/g, ' ').replace(/\./g, ' > ')
    }
}

function TimeAgo({ date }: { date: string }) {
    const [ago, setAgo] = useState('')

    useEffect(() => {
        const update = () => {
            const diff = Date.now() - new Date(date).getTime()
            const mins = Math.floor(diff / 60000)
            const hours = Math.floor(mins / 60)
            const days = Math.floor(hours / 24)

            if (mins < 1) setAgo('just now')
            else if (mins < 60) setAgo(`${mins}m ago`)
            else if (hours < 24) setAgo(`${hours}h ago`)
            else setAgo(`${days}d ago`)
        }
        update()
        const interval = setInterval(update, 60000)
        return () => clearInterval(interval)
    }, [date])

    return <span className="text-gray-500 text-sm">{ago}</span>
}

function ActivityItemCard({ item, index }: { item: ActivityItem; index: number }) {
    const [expanded, setExpanded] = useState(false)
    const config = getActionConfig(item.action)
    const Icon = config.icon

    const colorClasses = {
        emerald: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        cyan: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
        violet: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
        amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        red: 'bg-red-500/20 text-red-400 border-red-500/30',
        gray: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    }[config.color] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'

    return (
        <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="relative pl-8 pb-6 last:pb-0"
        >
            {/* Timeline line */}
            <div className="absolute left-3 top-8 bottom-0 w-px bg-gray-700" />

            {/* Timeline dot */}
            <div className={`absolute left-0 top-2 w-6 h-6 rounded-full flex items-center justify-center ${colorClasses} border`}>
                <Icon className="w-3 h-3" />
            </div>

            {/* Content */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-white">{config.label}</span>
                            {item.resourceType && (
                                <span className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-300">
                                    {item.resourceType}
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-gray-400 mt-1">
                            by <span className="text-gray-300">{item.user}</span>
                        </p>
                    </div>
                    <TimeAgo date={item.timestamp} />
                </div>

                {/* Expandable metadata */}
                {item.metadata && Object.keys(item.metadata).length > 0 && (
                    <>
                        <button
                            onClick={() => setExpanded(!expanded)}
                            className="flex items-center gap-1 mt-3 text-sm text-gray-500 hover:text-gray-300 transition-colors"
                        >
                            <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                            {expanded ? 'Hide' : 'Show'} details
                        </button>
                        <AnimatePresence>
                            {expanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <pre className="mt-3 p-3 bg-gray-900 rounded text-xs text-gray-400 overflow-x-auto">
                                        {JSON.stringify(item.metadata, null, 2)}
                                    </pre>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </>
                )}
            </div>
        </motion.div>
    )
}

export function ActivityTimeline() {
    const [activities, setActivities] = useState<ActivityItem[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<string>('all')

    useEffect(() => {
        fetchActivities()
    }, [])

    const fetchActivities = async () => {
        try {
            const res = await fetch('/api/admin/analytics?period=7d')
            if (res.ok) {
                const data = await res.json()
                setActivities(data.recentActivity || [])
            }
        } catch (error) {
            console.error('Failed to fetch activities:', error)
        } finally {
            setLoading(false)
        }
    }

    const filteredActivities = filter === 'all'
        ? activities
        : activities.filter(a => a.action.includes(filter))

    const filterOptions = [
        { value: 'all', label: 'All Activity' },
        { value: 'PROVIDER', label: 'Providers' },
        { value: 'USER', label: 'Users' },
        { value: 'SYNC', label: 'Sync Jobs' },
        { value: 'admin', label: 'Admin Actions' },
    ]

    if (loading) {
        return (
            <div className="space-y-4 animate-pulse">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="h-24 bg-gray-800/50 rounded-lg" />
                ))}
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-violet-400" />
                    Activity Timeline
                </h2>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select
                        title="Filter Actions"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                        {filterOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Timeline */}
            <div className="relative">
                {filteredActivities.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                        No activity found
                    </div>
                ) : (
                    filteredActivities.map((item, i) => (
                        <ActivityItemCard key={item.id} item={item} index={i} />
                    ))
                )}
            </div>
        </div>
    )
}

export default ActivityTimeline
