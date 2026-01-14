/**
 * Notification Service
 * 
 * Handles creating and managing user notifications for real events
 * NOW WITH: Web Push Support (Server-Centric)
 */

import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'
import { queue, QUEUES } from '@/lib/core/queue'

// Notification types for type safety
export type NotificationType =
    | 'sms_received'
    | 'payment_success'
    | 'payment_failed'
    | 'number_expiring'
    | 'number_expired'
    | 'number_cancelled'
    | 'number_purchased'
    | 'welcome'
    | 'low_balance'
    | 'system'

interface NotificationData {
    numberId?: string
    phoneNumber?: string
    amount?: number
    serviceName?: string
    countryName?: string
    code?: string
    url?: string
    actions?: any[]
    [key: string]: any
}

interface CreateNotificationParams {
    userId: string
    type: NotificationType
    title: string
    message: string
    data?: NotificationData
}

export class NotificationService {

    /**
     * Create a notification for a user (DB + Push)
     */
    static async createNotification({ userId, type, title, message, data }: CreateNotificationParams) {
        let notificationId: string | undefined

        try {
            // 1. Save to Database (Always)
            const notification = await prisma.notification.create({
                data: {
                    userId,
                    type,
                    title,
                    message,
                    data: data || {},
                    read: false
                }
            })
            notificationId = notification.id

            // 2. Enqueue Delivery (Async)
            // Use idempotent key: notificationId (delivery only happens once per notification)
            await queue.publish(QUEUES.NOTIFICATION_DELIVERY, {
                notificationId: notification.id,
                userId,
                title,
                message,
                data
            }, {
                singletonKey: notification.id,
                retryLimit: 3,
                expireInSeconds: 60
            })

            return notification

        } catch (error) {
            // Log with context
            logger.error('[NotificationService] Failed to create or enqueue notification', {
                error,
                userId,
                type,
                notificationId // Might be undefined if DB write failed
            })
            throw error // Re-throw if DB write failed
        }
    }

    /**
     * Import a subscription (Admin/Internal use only).
     */
    static async importSubscription(userId: string, subscription: {
        endpoint: string,
        keys: { p256dh: string, auth: string },
        userAgent?: string
    }) {
        return prisma.pushSubscription.upsert({
            where: { endpoint: subscription.endpoint },
            update: {
                userId,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                userAgent: subscription.userAgent,
            },
            create: {
                userId,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                userAgent: subscription.userAgent,
            }
        })
    }

    // --- Standard DB Methods ---

    static async getNotifications(userId: string, limit = 20, cursor?: string) {
        return prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit + 1, // Fetch one extra to determine next cursor
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0 // Skip the cursor itself if provided
        })
    }

    static async getUnreadCount(userId: string) {
        return prisma.notification.count({
            where: { userId, read: false }
        })
    }

    static async markAsRead(notificationId: string, userId: string) {
        return prisma.notification.update({
            where: { id: notificationId, userId },
            data: { read: true }
        })
    }

    static async markAllAsRead(userId: string) {
        return prisma.notification.updateMany({
            where: { userId, read: false },
            data: { read: true }
        })
    }

    static async deleteNotification(notificationId: string, userId: string) {
        return prisma.notification.delete({
            where: { id: notificationId, userId }
        })
    }
}

// ============================================
// NOTIFICATION FACTORY METHODS
// ============================================

export const NotificationFactory = {
    smsReceived: (userId: string, phoneNumber: string, code?: string, serviceName?: string, numberId?: string) =>
        NotificationService.createNotification({
            userId,
            type: 'sms_received',
            title: 'New SMS Received',
            message: code ? `Code: ${code} for ${serviceName || phoneNumber}` : `New message on ${phoneNumber}`,
            data: {
                phoneNumber,
                code,
                serviceName,
                url: numberId ? `/sms/${numberId}` : '/dashboard/history',
                actions: [
                    { action: 'view', title: 'View SMS' },
                    { action: 'copy', title: 'Copy Code' }
                ]
            }
        }),

    paymentSuccess: (userId: string, amount: number) =>
        NotificationService.createNotification({
            userId,
            type: 'payment_success',
            title: 'Payment Successful',
            message: `Added $${amount.toFixed(2)} to your wallet`,
            data: { amount, url: '/dashboard/wallet' }
        }),

    numberPurchased: (userId: string, phoneNumber: string, serviceName: string, countryName: string) =>
        NotificationService.createNotification({
            userId,
            type: 'number_purchased',
            title: 'Number Activated',
            message: `${phoneNumber} ready for ${serviceName}`,
            data: { phoneNumber, serviceName, countryName, url: '/dashboard/history' }
        }),

    numberExpiring: (userId: string, phoneNumber: string, minutesLeft: number, numberId: string) =>
        NotificationService.createNotification({
            userId,
            type: 'number_expiring',
            title: 'Number Expiring Soon',
            message: `${phoneNumber} expires in ${minutesLeft} mins`,
            data: { phoneNumber, minutesLeft, url: `/sms/${numberId}` }
        }),

    numberCancelled: (userId: string, phoneNumber: string, refundAmount: number) =>
        NotificationService.createNotification({
            userId,
            type: 'number_cancelled',
            title: 'Number Cancelled',
            message: `Refund of $${refundAmount.toFixed(2)} processed`,
            data: { phoneNumber, refundAmount, url: '/dashboard/wallet' }
        }),

    welcome: (userId: string, userName: string) =>
        NotificationService.createNotification({
            userId,
            type: 'welcome',
            title: 'Welcome to NexNum! 🎉',
            message: `Hey ${userName}, get started with your first number.`,
            data: { userName, url: '/dashboard/buy' }
        }),

    lowBalance: (userId: string, balance: number) =>
        NotificationService.createNotification({
            userId,
            type: 'low_balance',
            title: 'Low Balance Alert',
            message: `Balance is $${balance.toFixed(2)}. Top up now.`,
            data: { balance, url: '/dashboard/wallet' }
        }),
}
