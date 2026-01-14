"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Inbox, Check, Trash2, Clock, Smartphone, CreditCard, Sparkles, AlertCircle, Bell, ChevronLeft, Calendar, ExternalLink, ArrowLeft, RefreshCw } from "lucide-react"
import { useNotifications, formatNotificationTime } from "@/hooks/use-notifications"
import { cn } from "@/lib/utils/utils"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { NotificationSkeleton } from "@/components/common/notification-dropdown"

// Helper to get icon (Consistent with Dropdown)
const getNotificationIcon = (type: string) => {
    switch (type) {
        case 'payment_success': return <CreditCard className="w-5 h-5 text-emerald-400" />
        case 'number_purchased': return <Smartphone className="w-5 h-5 text-blue-400" />
        case 'low_balance': return <AlertCircle className="w-5 h-5 text-amber-400" />
        case 'welcome': return <Sparkles className="w-5 h-5 text-purple-400" />
        case 'system': return <Inbox className="w-5 h-5 text-[hsl(var(--neon-lime))]" />
        default: return <Bell className="w-5 h-5 text-gray-400" />
    }
}

export default function NotificationsPage() {
    const {
        notifications,
        markAllAsRead,
        markAsRead,
        deleteNotification,
        loadMore,
        isLoadingMore,
        isReachingEnd,
        isLoading,
        refresh
    } = useNotifications()

    const searchParams = useSearchParams()
    const router = useRouter()
    const selectedId = searchParams.get('id')

    // Derived selected notification
    const selectedNotification = notifications.find(n => n.id === selectedId)

    // Handle selection
    const selectNotification = (n: any) => {
        router.push(`/dashboard/notifications?id=${n.id}`)
        if (!n.read) {
            markAsRead(n.id)
        }
    }

    // Clear selection
    const clearSelection = () => {
        router.push('/dashboard/notifications')
    }

    return (
        <div className="flex h-[calc(100vh-5rem)] -mt-6 -mx-4 md:-mx-6 lg:-mx-8 overflow-hidden bg-black relative">
            {/* Background Ambient Effects */}
            <div className="absolute top-0 left-0 w-full h-[500px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[hsl(var(--neon-lime)/0.05)] via-transparent to-transparent pointer-events-none" />

            {/* LEFT PANEL: LIST */}
            <div className={cn(
                "w-full md:w-[380px] lg:w-[420px] flex flex-col border-r border-white/5 bg-[#0a0a0c]/80 backdrop-blur-xl z-10 transition-transform duration-300 absolute md:relative h-full",
                selectedId ? "-translate-x-full md:translate-x-0" : "translate-x-0"
            )}>
                {/* List Header */}
                <div className="h-16 flex items-center justify-between px-5 border-b border-white/5 bg-white/[0.01]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[hsl(var(--neon-lime)/0.1)] flex items-center justify-center border border-[hsl(var(--neon-lime)/0.2)]">
                            <Inbox className="w-4 h-4 text-[hsl(var(--neon-lime))]" />
                        </div>
                        <h1 className="text-lg font-bold text-white tracking-tight">Inbox</h1>
                    </div>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => refresh()}
                            className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                        </button>
                        <button
                            onClick={() => markAllAsRead()}
                            className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                            title="Mark all as read"
                        >
                            <Check className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* List Content */}
                <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {isLoading && notifications.length === 0 ? (
                        <div className="divide-y divide-white/[0.03]">
                            <NotificationSkeleton />
                            <NotificationSkeleton />
                            <NotificationSkeleton />
                            <NotificationSkeleton />
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 p-8 space-y-4">
                            <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.05] flex items-center justify-center">
                                <Bell className="w-8 h-8 opacity-40" />
                            </div>
                            <p className="text-sm font-medium">No notifications yet</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/[0.03]">
                            {notifications.map((n) => (
                                <div
                                    key={n.id}
                                    onClick={() => selectNotification(n)}
                                    className={cn(
                                        "group p-4 cursor-pointer transition-all hover:bg-white/[0.04] border-l-2 relative overflow-hidden",
                                        selectedId === n.id
                                            ? "bg-white/[0.04] border-[hsl(var(--neon-lime))]"
                                            : !n.read
                                                ? "bg-[hsl(var(--neon-lime)/0.02)] border-[hsl(var(--neon-lime)/0.5)]"
                                                : "border-transparent"
                                    )}
                                >
                                    <div className="flex gap-4">
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                                            n.read
                                                ? "bg-white/[0.03] border-white/[0.05] text-gray-500"
                                                : "bg-[#1A1D21] border-white/10 shadow-lg"
                                        )}>
                                            {getNotificationIcon(n.type)}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start mb-1 gap-2">
                                                <span className={cn(
                                                    "text-sm font-medium truncate",
                                                    !n.read ? "text-white" : "text-gray-400"
                                                )}>{n.title}</span>
                                                <span className="text-[10px] text-gray-600 shrink-0 font-mono mt-0.5">
                                                    {formatNotificationTime(n.createdAt)}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed group-hover:text-gray-400 transition-colors">
                                                {n.message}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Load More Trigger */}
                            <div className="p-4 flex justify-center border-t border-white/[0.03]">
                                {isLoadingMore ? (
                                    <div className="flex flex-col gap-2 w-full">
                                        <NotificationSkeleton />
                                    </div>
                                ) : !isReachingEnd && (
                                    <button
                                        onClick={loadMore}
                                        className="text-xs font-medium text-gray-500 hover:text-white py-2.5 px-6 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] transition-colors border border-white/5 hover:border-white/10"
                                    >
                                        Load More History
                                    </button>
                                )}
                                {isReachingEnd && notifications.length > 0 && (
                                    <span className="text-[10px] text-gray-600 uppercase tracking-widest py-2">End of Inbox</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT PANEL: DETAILS */}
            <div className={cn(
                "flex-1 flex flex-col bg-[#0f1115] absolute md:relative inset-0 z-20 transition-transform duration-300 md:transform-none bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white/[0.02] to-transparent",
                selectedId ? "translate-x-0" : "translate-x-full md:translate-x-0"
            )}>
                {selectedNotification ? (
                    <>
                        {/* Detail Header */}
                        <div className="h-16 flex items-center px-4 md:px-8 border-b border-white/5 bg-white/[0.01] backdrop-blur-md gap-4">
                            <button
                                onClick={clearSelection}
                                className="md:hidden p-2 -ml-2 text-gray-400 hover:text-white transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>

                            <div className="flex-1" />

                            <span className="text-xs font-mono text-gray-600 hidden md:block">
                                ID: {selectedNotification.id.slice(0, 8)}
                            </span>
                            <div className="w-px h-4 bg-white/10 hidden md:block" />

                            <button
                                onClick={() => {
                                    deleteNotification(selectedNotification.id)
                                    clearSelection()
                                }}
                                className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors group"
                                title="Delete Notification"
                            >
                                <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                            </button>
                        </div>

                        {/* Detail Content */}
                        <div className="flex-1 overflow-y-auto p-6 md:p-10 lg:p-14">
                            <div className="max-w-3xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* Title Block */}
                                <div className="space-y-6">
                                    <div className="flex flex-col md:flex-row md:items-start gap-5">
                                        <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center shadow-2xl shrink-0">
                                            <div className="scale-150">
                                                {getNotificationIcon(selectedNotification.type)}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                                                {selectedNotification.title}
                                            </h1>
                                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                                                <span className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.05]">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    {new Date(selectedNotification.createdAt).toLocaleString(undefined, {
                                                        dateStyle: 'medium',
                                                        timeStyle: 'short'
                                                    })}
                                                </span>
                                                <span className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.05] capitalize">
                                                    {selectedNotification.type.replace('_', ' ')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Body */}
                                <div className="prose prose-invert max-w-none">
                                    <div className="p-6 md:p-8 rounded-2xl bg-white/[0.02] border border-white/5 text-gray-300 leading-relaxed text-sm md:text-base shadow-inner">
                                        {selectedNotification.message}
                                    </div>
                                </div>

                                {/* Actions / Context Data */}
                                {selectedNotification.data && (
                                    <div className="pt-8 border-t border-white/5 space-y-6">

                                        {/* Dynamic Link Button */}
                                        {selectedNotification.data.url && (
                                            <div className="flex">
                                                <Link href={selectedNotification.data.url} className="w-full md:w-auto">
                                                    <button className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[hsl(var(--neon-lime))] text-black font-bold text-sm tracking-wide hover:brightness-110 active:scale-95 transition-all shadow-[0_0_20px_hsl(var(--neon-lime)/0.2)] hover:shadow-[0_0_30px_hsl(var(--neon-lime)/0.4)]">
                                                        <span>Open Resource</span>
                                                        <ExternalLink className="w-4 h-4" />
                                                    </button>
                                                </Link>
                                            </div>
                                        )}

                                        {/* Raw Data (Only if URL isn't the only thing) */}
                                        {Object.keys(selectedNotification.data).filter(k => k !== 'url').length > 0 && (
                                            <div>
                                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Additional Data</h3>
                                                <div className="p-4 rounded-xl bg-black/40 border border-white/5 font-mono text-[10px] text-gray-500 overflow-x-auto">
                                                    <pre>{JSON.stringify(selectedNotification.data, null, 2)}</pre>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500 p-8 text-center bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent_70%)]">
                        <div className="w-32 h-32 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mb-6 shadow-2xl">
                            <Inbox className="w-12 h-12 opacity-20" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-2">Select a notification</h3>
                        <p className="max-w-sm text-sm text-gray-400">Choose an item from the inbox to view full details, actions, and metadata.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
