import { NextRequest, NextResponse } from 'next/server'
import { ZombieDetector, STANDARD_WORKERS, ZombieResult } from '@/lib/workers/zombie-detector'
import { readHeartbeats, pruneStaleHeartbeats } from '@/lib/workers/heartbeat-registry'
import { notificationManager } from '@/lib/notifications/manager'
import { logger } from '@/lib/core/logger'

/**
 * Zombie Worker Check
 *
 * Purpose: Detect background workers that have stopped heartbeating
 * (hung, OOM-killed, deadlocked) and route alerts.
 *
 * Schedule: Run every 1-2 minutes via pg-boss cron (worker-entry.ts)
 *           or external scheduler (Vercel Cron, GitHub Actions).
 * Endpoint: POST /api/cron/zombie-check
 *
 * Severity routing:
 *   - critical zombies -> PagerDuty (paging on-call)
 *   - warning zombies  -> Slack + Telegram (broadcast, no page)
 *   - info zombies     -> Slack + Telegram (broadcast, no page)
 *
 * Security: Protected by CRON_SECRET env variable (Bearer-style header).
 *
 * Why a "soft" alert rather than auto-restart:
 *   - In a single-instance deployment, restarting the whole process
 *     restarts the alertmanager and the load balancer / proxy alike.
 *     Alerting on-call is the correct response.
 *   - When the codebase moves to multi-instance, this route is the
 *     place to add `process.exit(1)` for critical-severity zombies
 *     so that a supervisor can bring up a fresh container.
 */

const PRUNE_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days - drop never-touched workers

export async function POST(req: NextRequest) {
    // 1. CRON_SECRET auth
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Run the detector
    const now = Date.now()
    const heartbeats = readHeartbeats()
    const detector = new ZombieDetector(STANDARD_WORKERS)
    const allZombies = detector.detect(heartbeats, now)

    // 3. Prune dead heartbeats (workers removed from STANDARD_WORKERS)
    const pruned = pruneStaleHeartbeats(PRUNE_AGE_MS)

    // 4. Build response payload (always)
    const response = {
        success: true,
        checked: STANDARD_WORKERS.length,
        monitoredWorkers: STANDARD_WORKERS.map(w => ({
            name: w.name,
            thresholdMs: w.thresholdMs,
            severity: w.severity || 'warning'
        })),
        heartbeats: Object.fromEntries(
            STANDARD_WORKERS.map(w => [
                w.name,
                heartbeats[w.name]
                    ? {
                          ageMs: now - heartbeats[w.name],
                          at: new Date(heartbeats[w.name]).toISOString()
                      }
                    : { ageMs: null, at: null }
            ])
        ),
        zombies: allZombies.map(z => ({
            name: z.worker.name,
            severity: z.worker.severity || 'warning',
            description: z.worker.description,
            ageMs: z.ageMs === Infinity ? null : z.ageMs,
            hasHeartbeat: z.hasHeartbeat
        })),
        pruned: pruned,
        timestamp: new Date().toISOString()
    }

    if (allZombies.length === 0) {
        logger.info('[ZOMBIE-CHECK] All workers healthy', {
            context: 'ZOMBIE_CHECK',
            checked: STANDARD_WORKERS.length
        })
        return NextResponse.json(response, { status: 200 })
    }

    // 5. Route alerts
    const critical = allZombies.filter(z => (z.worker.severity || 'warning') === 'critical')
    const nonCritical = allZombies.filter(z => (z.worker.severity || 'warning') !== 'critical')

    const alerted: string[] = []

    // Critical: route to PagerDuty via notification manager
    for (const z of critical) {
        const title = `Zombie worker (critical): ${z.worker.name}`
        const message = formatZombieMessage(z, now)
        await notificationManager.alert(title, message, 'critical')
        alerted.push(z.worker.name)
    }

    // Non-critical: route to Slack/Telegram via notification manager.
    // We still call alert() with the worker severity (warning/info);
    // PagerDuty will self-skip non-critical and Slack/Telegram will fire.
    for (const z of nonCritical) {
        const severity = (z.worker.severity || 'warning') as 'warning' | 'info'
        const title = `Zombie worker (${severity}): ${z.worker.name}`
        const message = formatZombieMessage(z, now)
        await notificationManager.alert(title, message, severity)
        alerted.push(z.worker.name)
    }

    logger.warn('[ZOMBIE-CHECK] Zombies detected', {
        context: 'ZOMBIE_CHECK',
        total: allZombies.length,
        critical: critical.length,
        nonCritical: nonCritical.length
    })

    return NextResponse.json(
        { ...response, alerted },
        { status: 207 } // Multi-Status - partial signal
    )
}

function formatZombieMessage(z: ZombieResult, now: number): string {
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

export async function GET() {
    return NextResponse.json(
        { error: 'Method not allowed. Use POST.' },
        { status: 405 }
    )
}
