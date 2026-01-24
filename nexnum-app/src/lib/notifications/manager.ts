import { TelegramService } from './channels/telegram'
import { EmailService } from './channels/email'
import { NotificationPayload, OrderNotification, DepositNotification, AlertNotification } from './types'
import { logger } from '@/lib/core/logger'

class NotificationManager {
    private channels = {
        telegram: new TelegramService(),
        email: new EmailService()
    }

    async notify(payload: NotificationPayload) {
        // Fire and forget - don't block main thread
        Promise.allSettled([
            this.channels.telegram.send(payload),
            this.channels.email.send(payload)
        ]).then((results) => {
            // Optional: log failures
            results.forEach((res, idx) => {
                if (res.status === 'rejected') {
                    // logger.error(`Notification channel failed`, { idx, error: res.reason })
                }
            })
        })
    }

    // Convenience methods
    async orderUpdate(order: OrderNotification) {
        return this.notify(order)
    }

    async depositConfirmed(deposit: DepositNotification) {
        return this.notify(deposit)
    }

    async alert(title: string, message: string, severity: 'info' | 'warning' | 'critical' = 'info') {
        return this.notify({
            type: 'ALERT',
            userId: 'system',
            timestamp: new Date(),
            title,
            message,
            severity
        })
    }
}

export const notificationManager = new NotificationManager()
