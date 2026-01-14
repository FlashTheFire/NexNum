
import useSWRInfinite from 'swr/infinite'
import { useState } from 'react'

interface Notification {
    id: string
    type: string
    title: string
    message: string
    data?: any
    read: boolean
    createdAt: string
}

interface NotificationsResponse {
    success: boolean
    notifications: Notification[]
    unreadCount: number
    nextCursor?: string
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

const PAGE_SIZE = 10

export function useNotifications() {
    const getKey = (pageIndex: number, previousPageData: NotificationsResponse | null) => {
        // First page
        if (pageIndex === 0) return `/api/notifications?limit=${PAGE_SIZE}`

        // Reached the end
        if (previousPageData && !previousPageData.nextCursor) return null

        // Next page
        return `/api/notifications?limit=${PAGE_SIZE}&cursor=${previousPageData?.nextCursor}`
    }

    const { data, error, mutate, size, setSize, isValidating } = useSWRInfinite<NotificationsResponse>(
        getKey,
        fetcher,
        {
            revalidateOnFocus: true,
            revalidateFirstPage: true,
            persistSize: false // reset to page 1 on mount
        }
    )

    // Flatten pages into one list and filter out any potential undefined/null items
    const notifications = data ? data.flatMap(page => page.notifications || []).filter(n => !!n) : []
    const unreadCount = data?.[0]?.unreadCount || 0
    const isLoadingInitial = !data && !error
    const isLoadingMore = isLoadingInitial || (size > 0 && data && typeof data[size - 1] === 'undefined')
    const isEmpty = data?.[0]?.notifications?.length === 0
    const isReachingEnd = isEmpty || (data && !data[data.length - 1]?.nextCursor)

    const loadMore = () => {
        if (!isReachingEnd && !isValidating) {
            setSize(size + 1)
        }
    }

    const markAllAsRead = async () => {
        try {
            await fetch('/api/notifications', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'markAllAsRead' }),
            })
            // Optimistically update all pages
            mutate(prev => {
                if (!prev) return undefined
                return prev.map(page => ({
                    ...page,
                    notifications: page.notifications.map(n => ({ ...n, read: true })),
                    unreadCount: 0
                }))
            }, false)
        } catch (error) {
            console.error('Failed to mark all as read:', error)
        }
    }

    const markAsRead = async (notificationId: string) => {
        try {
            await fetch(`/api/notifications/${notificationId}`, {
                method: 'PATCH',
            })
            // Optimistic update
            mutate()
        } catch (error) {
            console.error('Failed to mark as read:', error)
        }
    }

    const deleteNotification = async (notificationId: string) => {
        try {
            await fetch(`/api/notifications/${notificationId}`, {
                method: 'DELETE',
            })
            mutate() // Just revalidate for simplicity with infinite lists
        } catch (error) {
            console.error('Failed to delete notification:', error)
        }
    }

    return {
        notifications,
        unreadCount,
        isLoading: isLoadingInitial,
        isLoadingMore,
        isReachingEnd,
        isError: error,
        loadMore,
        markAllAsRead,
        markAsRead,
        deleteNotification,
        refresh: () => mutate(),
    }
}

// Helper to format relative time
export function formatNotificationTime(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
}
