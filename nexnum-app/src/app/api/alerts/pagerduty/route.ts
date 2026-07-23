/**
 * Alertmanager Webhook Endpoint - PagerDuty
 *
 * Receives alerts from Prometheus Alertmanager and forwards them to PagerDuty
 * using the Events API v2 (https://events.pagerduty.com/v2/enqueue).
 *
 * Intended for critical severity only - the PagerDutyService also no-ops on
 * non-critical alerts. This endpoint therefore rejects warning/info to avoid
 * accidental paging.
 *
 * Endpoint: POST /api/alerts/pagerduty
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/core/logger'
import { notificationManager } from '@/lib/notifications/manager'
import { timingSafeEqual } from '@/lib/core/isomorphic-crypto'

interface AlertmanagerPayload {
    version: string
    groupKey: string
    status: 'firing' | 'resolved'
    receiver: string
    groupLabels: Record<string, string>
    commonLabels: Record<string, string>
    commonAnnotations: Record<string, string>
    externalURL: string
    alerts: Array<{
        status: 'firing' | 'resolved'
        labels: Record<string, string>
        annotations: Record<string, string>
        startsAt: string
        endsAt: string
        generatorURL: string
        fingerprint: string
    }>
}

function verifyWebhookSecret(request: NextRequest): boolean {
    let secret = process.env.ALERT_WEBHOOK_SECRET
    if (!secret) {
        logger.warn('[Alerts:PD] ALERT_WEBHOOK_SECRET not set; accepting all webhooks')
        return true
    }
    secret = secret.replace(/^["'](.*)["']$/, '$1')

    const authHeader = request.headers.get('authorization')
    if (!authHeader) return false
    const token = authHeader.replace('Bearer ', '').trim()

    const tokenBuf = Buffer.from(token)
    const secretBuf = Buffer.from(secret)
    if (tokenBuf.length !== secretBuf.length) return false
    return timingSafeEqual(tokenBuf, secretBuf)
}

export async function POST(request: NextRequest) {
    if (!verifyWebhookSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const payload: AlertmanagerPayload = await request.json()

        logger.info('[Alerts:PD] Received webhook', {
            status: payload.status,
            alertCount: payload.alerts.length,
            receiver: payload.receiver
        })

        const severity = (payload.commonLabels.severity || 'info') as 'info' | 'warning' | 'critical'

        if (severity !== 'critical') {
            logger.info('[Alerts:PD] Skipping non-critical', { severity })
            return NextResponse.json({ success: true, skipped: true, reason: 'non-critical' })
        }
        if (payload.status === 'resolved') {
            return NextResponse.json({ success: true, skipped: true, reason: 'resolved' })
        }

        const firing = payload.alerts.filter(a => a.status === 'firing').slice(0, 5)
        const summary = firing
            .map(a => `${a.labels.alertname}: ${a.annotations.summary || ''}`)
            .join(' | ')
            .slice(0, 1024)

        notificationManager.alert(
            payload.commonLabels.alertname || 'Critical System Alert',
            summary || 'Critical alert fired',
            'critical'
        ).catch(err => {
            logger.error('[Alerts:PD] Failed to dispatch', { error: err?.message })
        })

        return NextResponse.json({ success: true, processed: firing.length })
    } catch (error: any) {
        logger.error('[Alerts:PD] Webhook processing failed', { error: error?.message })
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
    }
}

export async function GET() {
    return NextResponse.json({ status: 'ok', service: 'alert-webhook-pagerduty' })
}
