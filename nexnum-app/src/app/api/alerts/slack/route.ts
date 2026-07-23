/**
 * Alertmanager Webhook Endpoint - Slack
 *
 * Receives alerts from Prometheus Alertmanager and forwards them to Slack.
 * Endpoint: POST /api/alerts/slack
 *
 * Distinct from /api/alerts/telegram in case we want different formatting
 * (Slack supports attachments, mrkdwn formatting, threading, etc.).
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
        logger.warn('[Alerts:Slack] ALERT_WEBHOOK_SECRET not set; accepting all webhooks')
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

        logger.info('[Alerts:Slack] Received webhook', {
            status: payload.status,
            alertCount: payload.alerts.length,
            receiver: payload.receiver
        })

        const severity = (payload.commonLabels.severity || 'info') as 'info' | 'warning' | 'critical'
        const statusEmoji = payload.status === 'firing' ? '🔥' : '✅'
        const sevEmoji = { critical: '🚨', warning: '⚠️', info: 'ℹ️' }[severity] || '📢'

        let message = `${statusEmoji} *Alert ${payload.status.toUpperCase()}*  ${sevEmoji} _${severity}_\n\n`
        for (const alert of payload.alerts.slice(0, 5)) {
            const dot = alert.status === 'firing' ? '🔴' : '🟢'
            message += `${dot} *${alert.labels.alertname || 'Unknown'}*\n`
            if (alert.annotations.summary) {
                message += `   ${alert.annotations.summary}\n`
            }
            if (alert.annotations.description && alert.status === 'firing') {
                message += `   _${alert.annotations.description.slice(0, 200)}_\n`
            }
            message += '\n'
        }
        if (payload.alerts.length > 5) {
            message += `_...and ${payload.alerts.length - 5} more alerts_\n`
        }

        notificationManager.alert(
            payload.commonLabels.alertname || 'System Alert',
            message,
            severity
        ).catch(err => {
            logger.error('[Alerts:Slack] Failed to dispatch', { error: err?.message })
        })

        return NextResponse.json({ success: true, processed: payload.alerts.length })
    } catch (error: any) {
        logger.error('[Alerts:Slack] Webhook processing failed', { error: error?.message })
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
    }
}

export async function GET() {
    return NextResponse.json({ status: 'ok', service: 'alert-webhook-slack' })
}
