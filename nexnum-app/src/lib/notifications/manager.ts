import { TelegramService } from './channels/telegram'
import { EmailService } from './channels/email'
import { SlackService } from './channels/slack'
import { PagerDutyService } from './channels/pagerduty'
import { NotificationPayload, OrderNotification, DepositNotification, AlertNotification } from './types'
import { logger } from '@/lib/core/logger'

class NotificationManager {
    private _telegram: TelegramService | null = null
    private _email: EmailService | null = null
    private _slack: SlackService | null = null
    private _pagerduty: PagerDutyService | null = null

    private get telegram(): TelegramService {
        if (!this._telegram) this._telegram = new TelegramService()
        return this._telegram
    }

    private get email(): EmailService {
        if (!this._email) this._email = new EmailService()
        return this._email
    }

    private get slack(): SlackService {
        if (!this._slack) this._slack = new SlackService()
        return this._slack
    }

    private get pagerduty(): PagerDutyService {
        if (!this._pagerduty) this._pagerduty = new PagerDutyService()
        return this._pagerduty
    }

    async notify(payload: NotificationPayload) {
        // Fire and forget - don't block main thread
        // All channels fan out in parallel; individual channel failures are isolated
        // via allSettled. Channels self-skip on disabled env (returns false silently).
        Promise.allSettled([
            this.telegram.send(payload),
            this.email.send(payload),
            this.slack.send(payload),
            this.pagerduty.send(payload)
        ]).then((results) => {
            // Log channel failures for observability; the previous version silently
            // dropped them.
            results.forEach((res, idx) => {
                if (res.status === 'rejected') {
                    const channel = ['telegram', 'email', 'slack', 'pagerduty'][idx]
                    logger.error(`Notification channel failed`, { channel, error: res.reason })
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
