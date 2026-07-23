/**
 * Zombie-check cron runner.
 *
 * The pg-boss cron job (worker-entry.ts) cannot easily make a self-call to
 * /api/cron/zombie-check without auth and a self-loop. We import the same
 * detector + heartbeat registry directly here so the cron tick exercises
 * the exact same code path as the HTTP route.
 *
 * The HTTP route at /api/cron/zombie-check remains for external schedulers
 * (Vercel Cron, GitHub Actions, etc.) — both paths share the core logic
 * (ZombieDetector + heartbeat-registry) so behavior is identical.
 */

import { ZombieDetector, STANDARD_WORKERS, ZombieResult } from './zombie-detector'
import { readHeartbeats, pruneStaleHeartbeats } from './heartbeat-registry'
import { notificationManager } from '@/lib/notifications/manager'
import { logger } from '@/lib/core/logger'

const PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface ZombieCheckSummary {
    totalChecked: number
    zombiesFound: number
    critical: number
    nonCritical: number
    pruned: number
    alerted: string[]
}

export async function runZombieCheck(): Promise<ZombieCheckSummary> {
    const now = Date.now()
    const heartbeats = readHeartbeats()
    const detector = new ZombieDetector(STANDARD_WORKERS)
    const zombies = detector.detect(heartbeats, now)
    const pruned = pruneStaleHeartbeats(PRUNE_AGE_MS)

    if (zombies.length === 0) {
        logger.info('[ZOMBIE-CHECK] All workers healthy', {
            context: 'ZOMBIE_CHECK',
            checked: STANDARD_WORKERS.length
        })
        return {
            totalChecked: STANDARD_WORKERS.length,
            zombiesFound: 0,
            critical: 0,
            nonCritical: 0,
            pruned,
            alerted: []
        }
    }

    const critical = zombies.filter(z => (z.worker.severity || 'warning') === 'critical')
    const nonCritical = zombies.filter(z => (z.worker.severity || 'warning') !== 'critical')
    const alerted: string[] = []

    for (const z of critical) {
        await notificationManager.alert(
            `Zombie worker (critical): ${z.worker.name}`,
            formatMessage(z, now),
            'critical'
        )
        alerted.push(z.worker.name)
    }

    for (const z of nonCritical) {
        const severity = (z.worker.severity || 'warning') as 'warning' | 'info'
        await notificationManager.alert(
            `Zombie worker (${severity}): ${z.worker.name}`,
            formatMessage(z, now),
            severity
        )
        alerted.push(z.worker.name)
    }

    logger.warn('[ZOMBIE-CHECK] Zombies detected', {
        context: 'ZOMBIE_CHECK',
        total: zombies.length,
        critical: critical.length,
        nonCritical: nonCritical.length
    })

    return {
        totalChecked: STANDARD_WORKERS.length,
        zombiesFound: zombies.length,
        critical: critical.length,
        nonCritical: nonCritical.length,
        pruned,
        alerted
    }
}

function formatMessage(z: ZombieResult, now: number): string {
    const sev = (z.worker.severity || 'warning').toUpperCase()
    const ageStr = z.ageMs === Infinity
        ? 'never recorded a heartbeat'
        : `last heartbeat ${Math.round(z.ageMs / 1000)}s ago (threshold: ${Math.round(z.worker.thresholdMs / 1000)}s)`
    const last = z.hasHeartbeat
        ? new Date(now - z.ageMs).toISOString()
        : 'never'
    return [
        `[${sev}] Worker "${z.worker.name}" is zombie.`,
        z.worker.description ? `Description: ${z.worker.description}` : '',
        `State: ${ageStr}`,
        `Last seen: ${last}`,
        `Action: investigate the worker process / supervisor.`
    ].filter(Boolean).join('\n')
}
