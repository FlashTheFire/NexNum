"use client"

import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Bell, X, Check, AlertTriangle, Info, Zap,
    DollarSign, Users, RefreshCw, Shield
} from 'lucide-react'
import { toast } from 'sonner'

// Notification types
export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export interface AdminNotification {
    id: string
    type: NotificationType
    title: string
    message: string
    timestamp: Date
    read: boolean
    action?: {
        label: string
        href: string
    }
}

// Icon mapping
const notificationIcons = {
    success: Check,
    error: AlertTriangle,
    warning: AlertTriangle,
    info: Info,
}

const notificationColors = {
    success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    error: 'text-red-400 bg-red-500/10 border-red-500/30',
    warning: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    info: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
}

// Notification context for global access
interface NotificationContextType {
    notifications: AdminNotification[]
    unreadCount: number
    addNotification: (notif: Omit<AdminNotification, 'id' | 'timestamp' | 'read'>) => void
    markAsRead: (id: string) => void
    markAllAsRead: () => void
    clearAll: () => void
}

const NotificationContext = createContext<NotificationContextType | null>(null)

export function useAdminNotifications() {
    const ctx = useContext(NotificationContext)
    if (!ctx) throw new Error('useAdminNotifications must be used within NotificationProvider')
    return ctx
}

// Provider component
export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [notifications, setNotifications] = useState<AdminNotification[]>([])

    const addNotification = useCallback((notif: Omit<AdminNotification, 'id' | 'timestamp' | 'read'>) => {
        const newNotif: AdminNotification = {
            ...notif,
            id: crypto.randomUUID(),
            timestamp: new Date(),
            read: false,
        }

        setNotifications(prev => [newNotif, ...prev].slice(0, 50)) // Keep last 50

        // Also show toast
        toast[notif.type === 'success' ? 'success' : notif.type === 'error' ? 'error' : 'info'](
            notif.title,
            { description: notif.message }
        )
    }, [])

    const markAsRead = useCallback((id: string) => {
        setNotifications(prev =>
            prev.map(n => n.id === id ? { ...n, read: true } : n)
        )
    }, [])

    const markAllAsRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    }, [])

    const clearAll = useCallback(() => {
        setNotifications([])
    }, [])

    const unreadCount = notifications.filter(n => !n.read).length

    return (
        <NotificationContext.Provider value={{
            notifications,
            unreadCount,
            addNotification,
            markAsRead,
            markAllAsRead,
            clearAll,
        }}>
            {children}
        </NotificationContext.Provider>
    )
}

// Notification bell dropdown component
export function NotificationBell() {
    const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useAdminNotifications()
    const [open, setOpen] = useState(false)

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="relative p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs text-white flex items-center justify-center font-bold">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <>
                        {/* Backdrop */}
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setOpen(false)}
                        />

                        {/* Dropdown */}
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute right-0 top-full mt-2 w-96 max-h-[70vh] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-gray-800">
                                <h3 className="font-semibold text-white">Notifications</h3>
                                <div className="flex gap-2">
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={markAllAsRead}
                                            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                                        >
                                            Mark all read
                                        </button>
                                    )}
                                    {notifications.length > 0 && (
                                        <button
                                            onClick={clearAll}
                                            className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Notifications list */}
                            <div className="overflow-y-auto max-h-96">
                                {notifications.length === 0 ? (
                                    <div className="p-8 text-center text-gray-500">
                                        <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                        <p>No notifications</p>
                                    </div>
                                ) : (
                                    notifications.map((notif) => {
                                        const Icon = notificationIcons[notif.type]
                                        const colorClass = notificationColors[notif.type]

                                        return (
                                            <motion.div
                                                key={notif.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                onClick={() => markAsRead(notif.id)}
                                                className={`p-4 border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors ${!notif.read ? 'bg-violet-500/5' : ''
                                                    }`}
                                            >
                                                <div className="flex gap-3">
                                                    <div className={`p-2 rounded-lg ${colorClass} border`}>
                                                        <Icon className="w-4 h-4" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-medium text-white truncate">
                                                                {notif.title}
                                                            </p>
                                                            {!notif.read && (
                                                                <span className="w-2 h-2 bg-violet-500 rounded-full" />
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-gray-400 truncate">
                                                            {notif.message}
                                                        </p>
                                                        <p className="text-xs text-gray-600 mt-1">
                                                            {formatTimeAgo(notif.timestamp)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )
                                    })
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}

function formatTimeAgo(date: Date): string {
    const diff = Date.now() - date.getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(mins / 60)
    const days = Math.floor(hours / 24)

    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
}

// Quick notification helpers
export function notifySuccess(title: string, message: string) {
    toast.success(title, { description: message })
}

export function notifyError(title: string, message: string) {
    toast.error(title, { description: message })
}

export function notifyWarning(title: string, message: string) {
    toast.warning(title, { description: message })
}

export function notifyInfo(title: string, message: string) {
    toast.info(title, { description: message })
}

export default NotificationBell
