/**
 * Alertmanager Webhook Endpoint
 * 
 * Receives alerts from Prometheus Alertmanager and forwards them to Telegram.
 * Endpoint: POST /api/alerts/telegram
 */

import { NextRequest, NextResponse } from 'next/server'
import { notify } from '@/lib/notifications'
import { logger } from '@/lib/core/logger'

// Expected Alertmanager webhook payload structure
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

import { timingSafeEqual } from '@/lib/core/isomorphic-crypto'

// Verify webhook secret
function verifyWebhookSecret(request: NextRequest): boolean {
    let secret = process.env.ALERT_WEBHOOK_SECRET
    if (!secret) {
        console.warn('[Alerts] ALERT_WEBHOOK_SECRET not set')
        return true
    }

    // Strip quotes if present (standardizes .env parsing across environments)
    secret = secret.replace(/^["'](.*)["']$/, '$1')

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
        console.warn('[Alerts] Missing Authorization header')
        return false
    }

    const token = authHeader.replace('Bearer ', '').trim()

    // Professional Diagnostics (Dev only)
    if (process.env.NODE_ENV === 'development') {
        const maskedToken = token.length > 4 ? `${token.substring(0, 2)}...${token.substring(token.length - 2)}` : '***'
        console.log(`[Alerts] Auth Verification: SecretLen=${secret.length}, TokenLen=${token.length}`)
        console.log(`[Alerts] Token Diagnostic: [${maskedToken}]`)
    }

    const tokenBuf = Buffer.from(token)
    const secretBuf = Buffer.from(secret)

    if (tokenBuf.length !== secretBuf.length) {
        return false
    }

    return timingSafeEqual(tokenBuf, secretBuf)
}


export async function POST(request: NextRequest) {
    // Verify secret
    if (!verifyWebhookSecret(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const payload: AlertmanagerPayload = await request.json()

        logger.info('[Alerts] Received webhook', {
            status: payload.status,
            alertCount: payload.alerts.length,
            receiver: payload.receiver
        })

        const isFiring = payload.status === 'firing'
        const severity = payload.commonLabels.severity || 'info'

        // Build message for Telegram
        const statusEmoji = isFiring ? '🔥' : '✅'
        const severityEmoji = {
            critical: '🚨',
            warning: '⚠️',
            info: 'ℹ️'
        }[severity] || '📢'

        // Group header
        let message = `${statusEmoji} <b>Alert ${payload.status.toUpperCase()}</b>\n`
        message += `${severityEmoji} <b>Severity:</b> ${severity.toUpperCase()}\n\n`

        // Individual alerts
        for (const alert of payload.alerts.slice(0, 5)) { // Limit to 5 per message
            const alertEmoji = alert.status === 'firing' ? '🔴' : '🟢'
            message += `${alertEmoji} <b>${alert.labels.alertname || 'Unknown'}</b>\n`

            if (alert.annotations.summary) {
                message += `   ${alert.annotations.summary}\n`
            }

            if (alert.annotations.description && alert.status === 'firing') {
                message += `   <i>${alert.annotations.description.slice(0, 100)}</i>\n`
            }

            message += '\n'
        }

        if (payload.alerts.length > 5) {
            message += `<i>...and ${payload.alerts.length - 5} more alerts</i>\n`
        }

        // Add timestamp
        message += `\n⏱️ <code>${new Date().toISOString().replace('T', ' ').slice(0, 19)}</code>`

        // Send to Telegram via our notification system
        notify.alert(
            payload.commonLabels.alertname || 'System Alert',
            message,
            severity as 'info' | 'warning' | 'critical'
        ).catch(err => {
            logger.error('[Alerts] Failed to send Telegram notification', { error: err.message })
        })

        return NextResponse.json({
            success: true,
            processed: payload.alerts.length
        })

    } catch (error: any) {
        logger.error('[Alerts] Webhook processing failed', { error: error.message })
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
    }
}

// Health check
export async function GET() {
    return NextResponse.json({ status: 'ok', service: 'alert-webhook' })
}
