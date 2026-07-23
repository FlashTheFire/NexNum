
import 'dotenv/config'
import { prisma } from '@/lib/core/db'
import { notificationManager } from '@/lib/notifications/manager'
import { captureMessage } from '@/lib/monitoring/sentry'
import { logger } from '@/lib/core/logger'

// Thresholds
const MIN_SUCCESS_RATE = 50.0 // %
const MAX_LATENCY = 5000 // ms
const CHECK_WINDOW_MINUTES = 60

export interface HealthAlert {
    level: 'CRITICAL' | 'WARNING'
    type: 'PROVIDER_HEALTH' | 'PROVIDER_LATENCY' | 'LOW_BALANCE'
    message: string
    metadata?: Record<string, any>
}

export async function runHealthCheck(): Promise<HealthAlert[]> {
    logger.info('🩺 Starting System Health Monitor...', { context: 'MONITOR_HEALTH' })

    const alerts: HealthAlert[] = []

    // 1. Check Provider Health (Last Hour)
    const windowStart = new Date(Date.now() - CHECK_WINDOW_MINUTES * 60 * 1000)

    const recentLogs = await prisma.providerHealthLog.groupBy({
        by: ['providerId'],
        where: { checkedAt: { gte: windowStart } },
        _avg: {
            successRate: true,
            avgLatency: true
        },
        _sum: {
            errorCount: true
        }
    })

    // Enrich with provider names
    for (const log of recentLogs) {
        const provider = await prisma.provider.findUnique({ where: { id: log.providerId } })
        if (!provider) continue

        const avgSuccess = Number(log._avg.successRate || 100)
        const avgLatency = Number(log._avg.avgLatency || 0)

        if (avgSuccess < MIN_SUCCESS_RATE) {
            alerts.push({
                level: 'CRITICAL',
                type: 'PROVIDER_HEALTH',
                message: `Provider ${provider.name} success rate critical: ${avgSuccess.toFixed(1)}%`,
                metadata: { providerId: provider.id, avgSuccess, avgLatency }
            })
        } else if (avgLatency > MAX_LATENCY) {
            alerts.push({
                level: 'WARNING',
                type: 'PROVIDER_LATENCY',
                message: `Provider ${provider.name} high latency: ${avgLatency.toFixed(0)}ms`,
                metadata: { providerId: provider.id, avgLatency }
            })
        }
    }

    // 2. Check Provider Balances
    const providers = await prisma.provider.findMany({
        where: { isActive: true }
    })

    for (const provider of providers) {
        const balance = Number(provider.balance)
        const threshold = Number(provider.lowBalanceAlert)
        if (threshold > 0 && balance < threshold) {
            alerts.push({
                level: 'WARNING',
                type: 'LOW_BALANCE',
                message: `Provider ${provider.name} balance low: ${balance} (Alert limit: ${threshold})`,
                metadata: { providerId: provider.id, balance: provider.balance }
            })
        }
    }

    // 3. Dispatch Alerts
    if (alerts.length > 0) {
        logger.warn(`🚨 Generated ${alerts.length} Alerts`, { context: 'MONITOR_HEALTH' })
        for (const alert of alerts) {
            logger.warn(alert.message, {
                context: 'MONITOR_HEALTH',
                level: alert.level,
                type: alert.type,
                ...alert.metadata
            })

            const emoji = alert.level === 'CRITICAL' ? '🚨' : '⚠️'
            const title = `${emoji} ${alert.level} — ${alert.type.replace(/_/g, ' ')}`
            const severity = alert.level === 'CRITICAL' ? 'critical' : 'warning'

            try {
                await notificationManager.alert(title, alert.message, severity)
            } catch (e: any) {
                logger.error('Notification dispatch failed', {
                    context: 'MONITOR_HEALTH',
                    error: e?.message,
                    alert
                })
            }

            if (alert.level === 'CRITICAL') {
                try {
                    captureMessage(`${title}\n${alert.message}`, 'error')
                } catch (e: any) {
                    logger.warn('Sentry capture failed', {
                        context: 'MONITOR_HEALTH',
                        error: e?.message
                    })
                }
            }
        }
    } else {
        logger.info('✅ Systems Nominal. No alerts triggered.', { context: 'MONITOR_HEALTH' })
    }

    return alerts
}

async function main() {
    try {
        await runHealthCheck()
        process.exit(0)
    } catch (e: any) {
        logger.error('Health monitor run failed', { context: 'MONITOR_HEALTH', error: e?.message })
        process.exit(1)
    }
}

// Only run main() when executed as a script, not when imported
const isDirectRun = typeof process !== 'undefined' && process.argv[1]?.includes('monitor-health')
if (isDirectRun) {
    main()
}
