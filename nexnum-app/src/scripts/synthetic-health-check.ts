/**
 * Synthetic Health Check — Cron entry point
 *
 * Run via:
 *   pnpm tsx src/scripts/synthetic-health-check.ts
 *   # or as a scheduled job (e.g., every 15 minutes)
 *
 * Probes every active provider with a real `getBalance()` call,
 * persists ProviderTestResult + ProviderHealthLog rows, and
 * emits Prometheus metrics. Failures surface via the same
 * multi-channel alert pipeline as monitor-health.ts.
 */

import 'dotenv/config'
import { logger } from '@/lib/core/logger'
import { notificationManager } from '@/lib/notifications/manager'
import { runSyntheticHealthCheck } from '@/lib/providers/synthetic-health-checker'

async function main() {
    try {
        const { results, summary } = await runSyntheticHealthCheck()

        const downProviders = results.filter(r => r.status === 'down')
        if (downProviders.length > 0) {
            const message = downProviders
                .map(p => `• ${p.providerName}: ${p.error ?? 'unknown error'} (${p.latencyMs}ms)`)
                .join('\n')

            await notificationManager.alert(
                `🚨 Synthetic Health — ${downProviders.length}/${summary.total} DOWN`,
                message,
                'critical'
            )
        } else if (summary.degraded > 0) {
            const degraded = results.filter(r => r.status === 'degraded')
            const message = degraded
                .map(p => `• ${p.providerName}: ${p.latencyMs}ms — ${p.error ?? 'no balance'}`)
                .join('\n')

            await notificationManager.alert(
                `⚠️ Synthetic Health — ${summary.degraded} degraded`,
                message,
                'warning'
            )
        } else {
            logger.info(`✅ All ${summary.total} providers healthy`, { context: 'SYNTHETIC_HEALTH' })
        }

        process.exit(summary.down > 0 ? 1 : 0)
    } catch (e: any) {
        logger.error('Synthetic health check failed', {
            context: 'SYNTHETIC_HEALTH',
            error: e?.message
        })
        process.exit(1)
    }
}

const isDirectRun = typeof process !== 'undefined' && process.argv[1]?.includes('synthetic-health-check')
if (isDirectRun) {
    main()
}
