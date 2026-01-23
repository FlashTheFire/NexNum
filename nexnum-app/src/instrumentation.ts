// Instrumentation file for Sentry initialization
// This runs once when the server starts
// Last import fix sync: 2024-05-24

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        await import('../sentry.server.config')

        const { runMasterWorker } = await import('@/workers/master-worker')
        const { startQueueWorker } = await import('@/worker-entry') // Unified Worker Entry
        const { logger } = await import('@/lib/core/logger')

        logger.splash()

        // Start Heavy Worker (Queue & Sync) - Fire and forget to not block startup
        startQueueWorker().catch(e => logger.error('Failed to start heavy worker', e))

        // Wait for splash to clear terminal before showing startup logs
        setTimeout(() => {
            logger.info('Starting Background Worker Scheduler (Internal Loop)')
            logger.divider()
        }, 1600)

        if (!process.env.NEXT_MANUAL_SIGINT) {
            let isRunning = false
            setInterval(async () => {
                if (isRunning) return
                isRunning = true
                try {
                    const res = await runMasterWorker()

                    const timestamp = new Date().toLocaleTimeString('en-GB')
                    const status = res.errors.length > 0 ? `\x1b[31m🚫 ERROR\x1b[0m` : `\x1b[32m✅ SUCCESS\x1b[0m`

                    const reports = [
                        `[${timestamp}] ${status}   Master Worker Cycle Completed in \x1b[34m${res.duration}ms\x1b[0m`,
                        ``,
                        `📦 \x1b[1mINBOX:   \x1b[0m ${res.inbox?.processed || 0} numbers checked`,
                        `📤 \x1b[1mOUTBOX:  \x1b[0m ${res.outbox?.processed || 0} events dispatched`,
                        `🔔 \x1b[1mPUSH:    \x1b[0m ${res.notifications?.processed || 0} messages delivered`,
                        `🧹 \x1b[1mCLEANUP: \x1b[0m ${res.reservations?.processed || 0} expired items cleared`
                    ]

                    if (res.errors.length > 0) {
                        reports.push(``)
                        reports.push(`\x1b[31m⚠️  ERROR LOG:\x1b[0m`)
                        res.errors.slice(0, 3).forEach(err => reports.push(`   - ${err}`))
                    }

                    const hasActivity = (res.inbox?.processed || 0) > 0 ||
                        (res.outbox?.processed || 0) > 0 ||
                        (res.notifications?.processed || 0) > 0 ||
                        (res.reservations?.processed || 0) > 0 ||
                        res.errors.length > 0

                    // Only update dashboard if something actually happened
                    if (hasActivity) {
                        logger.drawDashboard('NEXNUM MASTER WORKER', reports)
                    }

                } catch (err: any) {
                    logger.error('Worker loop critical failure', { error: err.message })
                } finally {
                    isRunning = false
                }
            }, 15000) // 15s resolution (optimized for Redis limit)
        }
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('../sentry.edge.config')
    }
}

export const onRequestError = async (
    err: Error,
    request: Request,
    context: { routerKind: string; routePath: string }
) => {
    // This captures errors in API routes and middleware
    const Sentry = await import('@sentry/nextjs')

    Sentry.captureException(err, {
        tags: {
            routerKind: context.routerKind,
            routePath: context.routePath,
        },
        extra: {
            url: request.url,
            method: request.method,
        },
    })
}
