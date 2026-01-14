
"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Bell, Check, Trash2, X, Clock, ChevronRight, Inbox, Sparkles, AlertCircle, ShoppingCart, Smartphone, CreditCard } from "lucide-react"
import { cn } from "@/lib/utils/utils"
import { useNotifications, formatNotificationTime } from "@/hooks/use-notifications"

// Skeleton Component for loading state
export function NotificationSkeleton() {
    return (
        <div className="p-4 flex gap-4 border-b border-white/[0.03]">
            <div className="w-10 h-10 rounded-xl bg-white/[0.05] animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 bg-white/[0.05] rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-white/[0.03] rounded animate-pulse" />
            </div>
        </div>
    )
}

export function NotificationDropdown() {
    const [isOpen, setIsOpen] = useState(false)
    const router = useRouter()
    const {
        notifications,
        unreadCount,
        markAllAsRead,
        isLoading,
        markAsRead,
        loadMore,
        isLoadingMore,
        isReachingEnd
    } = useNotifications()

    const handleNotificationClick = (n: any) => {
        setIsOpen(false)
        if (!n.read) markAsRead(n.id)
        if (n.data?.url) {
            router.push(n.data.url)
        } else {
            router.push(`/dashboard/notifications?id=${n.id}`)
        }
    }

    // Intersection Observer for infinite scroll
    const observerTarget = useRef<HTMLDivElement>(null)

    const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
        const [target] = entries
        if (target.isIntersecting && !isLoadingMore && !isReachingEnd) {
            loadMore()
        }
    }, [isLoadingMore, isReachingEnd, loadMore])

    useEffect(() => {
        const observer = new IntersectionObserver(handleObserver, {
            root: null,
            rootMargin: "20px",
            threshold: 1.0
        })
        if (observerTarget.current) observer.observe(observerTarget.current)
        return () => observer.disconnect()
    }, [handleObserver, isOpen]) // Re-attach when opened

    const toggleOpen = () => {
        if (Notification.permission === 'default') {
            window.dispatchEvent(new Event('open-notification-requester'))
            return
        }
        setIsOpen(!isOpen)
    }

    // Helper to get icon based on type
    const getNotificationIcon = (type: string) => {
        switch (type) {
            case 'payment_success': return <CreditCard className="w-4 h-4 text-emerald-400" />
            case 'number_purchased': return <Smartphone className="w-4 h-4 text-blue-400" />
            case 'low_balance': return <AlertCircle className="w-4 h-4 text-amber-400" />
            case 'welcome': return <Sparkles className="w-4 h-4 text-purple-400" />
            case 'system': return <Inbox className="w-4 h-4 text-[hsl(var(--neon-lime))]" />
            default: return <Bell className="w-4 h-4 text-gray-400" />
        }
    }

    return (
        <div className="relative z-50">
            {/* Bell Trigger */}
            <button
                onClick={toggleOpen}
                className={cn(
                    "relative inline-flex items-center justify-center h-10 w-10 rounded-full transition-all duration-300",
                    isOpen ? "bg-[hsl(var(--neon-lime))] text-black shadow-[0_0_20px_hsl(var(--neon-lime)/0.4)]" : "bg-white/[0.05] hover:bg-white/[0.1] text-white"
                )}
            >
                <Bell className={cn("h-5 w-5 transition-transform", isOpen && "rotate-12")} />
                {!isOpen && unreadCount > 0 && (
                    <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--neon-lime))] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[hsl(var(--neon-lime))]"></span>
                    </span>
                )}
            </button>

            {/* Dropdown Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Dropdown Content */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className={cn(
                            "z-50 rounded-3xl border border-white/10 bg-[#0f1115]/80 backdrop-blur-3xl shadow-2xl shadow-black/80 ring-1 ring-white/5 overflow-hidden flex flex-col max-h-[45vh] md:max-h-[80vh]",
                            // Mobile: Compact and Right Aligned
                            "fixed top-[3.5rem] right-7 left-auto w-[80vw] origin-top-right",
                            // Desktop: Absolute positioning, standard width
                            "md:absolute md:top-full md:right-0 md:left-auto md:w-[380px] md:mt-4 md:origin-top-right"
                        )}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-3 md:p-5 border-b border-white/5 bg-white/[0.02] shrink-0">
                            <div className="flex items-center gap-3">
                                <h3 className="font-bold text-white text-base md:text-base tracking-tight">Notifications</h3>
                                {unreadCount > 0 && (
                                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[hsl(var(--neon-lime)/0.15)] border border-[hsl(var(--neon-lime)/0.2)]">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--neon-lime))]" />
                                        <span className="text-[10px] font-bold text-[hsl(var(--neon-lime))] tracking-wide">{unreadCount} NEW</span>
                                    </span>
                                )}
                            </div>

                            {notifications.length > 0 && (
                                <button
                                    onClick={() => markAllAsRead()}
                                    className="p-2 -mr-2 text-gray-500 hover:text-white transition-colors rounded-full hover:bg-white/5 group"
                                    title="Mark all as read"
                                >
                                    <Check className="w-4 h-4 group-hover:text-[hsl(var(--neon-lime))]" />
                                </button>
                            )}
                        </div>

                        {/* List Area */}
                        <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent flex-1 min-h-0">
                            {isLoading ? (
                                <div className="divide-y divide-white/[0.03]">
                                    <NotificationSkeleton />
                                    <NotificationSkeleton />
                                    <NotificationSkeleton />
                                </div>
                            ) : notifications.length === 0 ? (
                                <div className="py-24 px-6 flex flex-col items-center justify-center text-center">
                                    <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-4">
                                        <Inbox className="w-8 h-8 text-gray-600" />
                                    </div>
                                    <p className="text-gray-400 font-medium text-sm">All caught up!</p>
                                    <p className="text-gray-600 text-xs mt-1">Check back later for updates.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-white/[0.03]">
                                    {notifications.map((n, i) => (
                                        <motion.div
                                            key={n.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            onClick={() => handleNotificationClick(n)}
                                            className={cn(
                                                "group relative p-4 hover:bg-white/[0.04] transition-all duration-200 cursor-pointer", // Added cursor-pointer
                                                !n.read && "bg-[hsl(var(--neon-lime)/0.03)]"
                                            )}
                                        >
                                            {/* Unread Indicator Bar */}
                                            {!n.read && (
                                                <div className="absolute left-0 top-4 bottom-4 w-0.5 bg-[hsl(var(--neon-lime))] shadow-[0_0_10px_hsl(var(--neon-lime))]" />
                                            )}

                                            <div className="flex gap-4">
                                                {/* Icon Box */}
                                                <div className={cn(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors",
                                                    n.read
                                                        ? "bg-white/[0.03] border-white/[0.05] text-gray-500"
                                                        : "bg-[#1A1D21] border-white/10 shadow-lg"
                                                )}>
                                                    {getNotificationIcon(n.type)}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2 mb-1">
                                                        <p className={cn(
                                                            "text-sm font-medium leading-none truncate pr-2",
                                                            n.read ? "text-gray-400" : "text-white"
                                                        )}>
                                                            {n.title}
                                                        </p>
                                                        <span className="text-[10px] text-gray-600 font-mono whitespace-nowrap shrink-0">
                                                            {formatNotificationTime(n.createdAt)}
                                                        </span>
                                                    </div>

                                                    <p className="text-[12px] md:text-sm text-gray-500 leading-relaxed truncate group-hover:text-gray-400 transition-colors">
                                                        {n.message}
                                                    </p>

                                                    {/* Actions */}
                                                    {!n.read && (
                                                        <div className="mt-3 flex items-center gap-3">
                                                            <button
                                                                onClick={() => markAsRead(n.id)}
                                                                className="text-[10px] font-medium text-[hsl(var(--neon-lime))] hover:underline decoration-[hsl(var(--neon-lime))] underline-offset-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                Mark as read
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}

                                    {/* Loading More Skeletons */}
                                    {isLoadingMore && (
                                        <>
                                            <NotificationSkeleton />
                                            <NotificationSkeleton />
                                        </>
                                    )}

                                    {/* Intersection Target */}
                                    <div ref={observerTarget} className="h-4 w-full" />

                                    {isReachingEnd && notifications.length > 5 && (
                                        <div className="p-4 text-center text-[10px] text-gray-600 uppercase tracking-widest">
                                            End of notifications
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-3 bg-white/[0.02] border-t border-white/5 flex justify-center shrink-0">
                            <button
                                onClick={() => {
                                    setIsOpen(false)
                                    router.push('/dashboard/notifications')
                                }}
                                className="text-[10px] text-gray-500 hover:text-white transition-colors flex items-center gap-1 group"
                            >
                                View all notifications
                                <ChevronRight className="w-2.5 h-2.5 group-hover:translate-x-0.5 transition-transform" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
