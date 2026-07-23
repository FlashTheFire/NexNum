import { logger } from '@/lib/core/logger'
import { NotificationChannel, NotificationPayload, AlertNotification } from '../types'

/**
 * Slack channel
 *
 * Uses a Slack Incoming Webhook URL. Severity drives colour + emoji prefix so
 * the team can triage from a glance. The webhook is intentionally pluggable
 * via env: SLACK_WEBHOOK_URL for ops, SLACK_CRITICAL_WEBHOOK_URL optionally
 * for a separate, paging channel.
 */
export class SlackService implements NotificationChannel {
    name = 'slack'

    private readonly defaultUrl: string | undefined
    private readonly criticalUrl: string | undefined
    private readonly enabled: boolean

    constructor() {
        this.defaultUrl = process.env.SLACK_WEBHOOK_URL
        this.criticalUrl = process.env.SLACK_CRITICAL_WEBHOOK_URL
        this.enabled = Boolean(this.defaultUrl || this.criticalUrl)
        if (!this.enabled) {
            logger.warn('SLACK_WEBHOOK_URL not set. Slack notifications disabled.')
        }
    }

    async send(payload: NotificationPayload): Promise<boolean> {
        if (!this.enabled) return false
        // Only alerts are routed to Slack (orders/deposits go to Telegram).
        if (payload.type !== 'ALERT') return true

        const alert = payload as AlertNotification
        const isCritical = alert.severity === 'critical'
        const url = (isCritical && this.criticalUrl) || this.defaultUrl
        if (!url) return false

        const colour = {
            critical: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        }[alert.severity] || '#6c757d'

        const prefix = {
            critical: ':rotating_light:',
            warning: ':warning:',
            info: ':information_source:'
        }[alert.severity] || ':bell:'

        const body = {
            text: `${prefix} *${alert.title}*`,
            attachments: [
                {
                    color: colour,
                    fallback: alert.title,
                    title: alert.title,
                    text: this.truncate(alert.message, 1900),
                    ts: Math.floor(alert.timestamp.getTime() / 1000),
                    fields: [
                        {
                            title: 'Severity',
                            value: alert.severity.toUpperCase(),
                            short: true
                        },
                        {
                            title: 'Source',
                            value: 'nexnum',
                            short: true
                        }
                    ]
                }
            ]
        }

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
            if (!res.ok) {
                logger.error('Slack send failed', { status: res.status })
                return false
            }
            return true
        } catch (err: any) {
            logger.error('Slack send error', { error: err?.message })
            return false
        }
    }

    private truncate(s: string, max: number): string {
        if (s.length <= max) return s
        return s.slice(0, max - 3) + '...'
    }
}
