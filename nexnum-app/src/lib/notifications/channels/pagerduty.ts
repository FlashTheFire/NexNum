import { logger } from '@/lib/core/logger'
import { NotificationChannel, NotificationPayload, AlertNotification } from '../types'

/**
 * PagerDuty channel
 *
 * Implements PagerDuty Events API v2 (https://developer.pagerduty.com/docs/events-api-v2/overview/).
 * Critical alerts trigger an incident; non-critical are silently skipped so we don't
 * page on every warning.
 */
const PAGERDUTY_EVENTS_URL = 'https://events.pagerduty.com/v2/enqueue'

export class PagerDutyService implements NotificationChannel {
    name = 'pagerduty'

    private readonly routingKey: string | undefined
    private readonly enabled: boolean

    constructor() {
        this.routingKey = process.env.PAGERDUTY_ROUTING_KEY
        this.enabled = Boolean(this.routingKey)
        if (!this.enabled) {
            logger.warn('PAGERDUTY_ROUTING_KEY not set. PagerDuty notifications disabled.')
        }
    }

    async send(payload: NotificationPayload): Promise<boolean> {
        if (!this.enabled || !this.routingKey) return false
        if (payload.type !== 'ALERT') return true

        const alert = payload as AlertNotification
        // Only page on critical; warnings/info route elsewhere.
        if (alert.severity !== 'critical') return true

        const dedupKey = `nexnum:${alert.title}`.slice(0, 254)
        const body = {
            routing_key: this.routingKey,
            event_action: 'trigger',
            dedup_key: dedupKey,
            payload: {
                summary: `[${alert.severity.toUpperCase()}] ${alert.title}: ${this.truncate(alert.message, 1024)}`,
                source: 'nexnum',
                severity: this.mapSeverity(alert.severity),
                timestamp: alert.timestamp.toISOString(),
                custom_details: {
                    title: alert.title,
                    severity: alert.severity,
                    user_id: alert.userId
                }
            }
        }

        try {
            const res = await fetch(PAGERDUTY_EVENTS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
            if (!res.ok) {
                const text = await res.text()
                logger.error('PagerDuty send failed', { status: res.status, body: text })
                return false
            }
            return true
        } catch (err: any) {
            logger.error('PagerDuty send error', { error: err?.message })
            return false
        }
    }

    private mapSeverity(s: AlertNotification['severity']): 'critical' | 'error' | 'warning' | 'info' {
        switch (s) {
            case 'critical': return 'critical'
            case 'warning': return 'warning'
            default: return 'info'
        }
    }

    private truncate(s: string, max: number): string {
        if (s.length <= max) return s
        return s.slice(0, max - 3) + '...'
    }
}
