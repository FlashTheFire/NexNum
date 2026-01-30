import { TelegramService } from './channels/telegram'
import { EmailService } from './channels/email'
import { NotificationPayload, OrderNotification, DepositNotification, AlertNotification } from './types'
import { logger } from '@/lib/core/logger'

class NotificationManager {
    private _telegram: TelegramService | null = null
    private _email: EmailService | null = null

    private get telegram(): TelegramService {
        if (!this._telegram) this._telegram = new TelegramService()
        return this._telegram
    }

    private get email(): EmailService {
        if (!this._email) this._email = new EmailService()
        return this._email
    }

    async notify(payload: NotificationPayload) {
        // Fire and forget - don't block main thread
        Promise.allSettled([
            this.telegram.send(payload),
            this.email.send(payload)
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
