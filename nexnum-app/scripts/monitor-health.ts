
import 'dotenv/config'
import { prisma } from '@/lib/core/db'

// Thresholds
const MIN_SUCCESS_RATE = 50.0 // %
const MAX_LATENCY = 5000 // ms
const CHECK_WINDOW_MINUTES = 60

async function main() {
    console.log('🩺 Starting System Health Monitor...')

    const alerts: any[] = []

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
        if (Number(provider.balance) < Number(provider.lowBalanceAlert)) {
            alerts.push({
                level: 'WARNING',
                type: 'LOW_BALANCE',
                message: `Provider ${provider.name} balance low: ${provider.balance} (Alert limit: ${provider.lowBalanceAlert})`,
                metadata: { providerId: provider.id, balance: provider.balance }
            })
        }
    }

    // 3. Dispatch Alerts
    if (alerts.length > 0) {
        console.log(`🚨 Generated ${alerts.length} Alerts:`)
        for (const alert of alerts) {
            console.log(JSON.stringify(alert, null, 2))
            // TODO: Send to Slack/Email/PagerDuty
            // await sendNotification(alert) 
        }
    } else {
        console.log('✅ Systems Nominal. No alerts triggered.')
    }

    process.exit(0)
}

main()
