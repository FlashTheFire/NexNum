// This runs once when the server starts
// Last import fix sync: 2024-05-24

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { orchestrator } = await import('@/lib/core/orchestrator')
        const { IndustrialHealthCollector } = await import('@/lib/telemetry/health')
        const { queue } = await import('@/lib/core/queue')
        const { logger } = await import('@/lib/core/logger')

        // 1. Unified Bootstrap
        await orchestrator.bootstrap('NextJS:API')

        // 2. Start Telemetry
        IndustrialHealthCollector.start()

        // 3. Register Global Shutdown Hooks
        orchestrator.onShutdown(async () => {
            logger.info('[NextJS] Stopping background queue...')
            await queue.stop()
        })

        await import('../sentry.server.config')
        const { startQueueWorker } = await import('@/worker-entry')

        // ───────────────────────────────────────────────────────────────────────
        // WORKER SERVICES (Optional Decoupling)
        // ───────────────────────────────────────────────────────────────────────
        if (process.env.NEXT_DISABLE_INTERNAL_WORKERS !== 'true') {
            startQueueWorker().catch(e => logger.error('Failed to start heavy worker', e))
            logger.info('Starting Background Worker Scheduler (Internal Mode)')
        } else {
            logger.info('Background Workers DISABLED (Standalone Worker mode active)')
        }

        logger.divider()
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
        await import('../sentry.edge.config')
    }
}

export const onRequestError = async (err: Error, request: Request, context: { routerKind: string; routePath: string }) => {
    const { getTraceId } = await import('@/lib/api/request-context')
    const Sentry = await import('@sentry/nextjs')

    const traceId = getTraceId()

    Sentry.captureException(err, {
        tags: {
            routerKind: context.routerKind,
            routePath: context.routePath,
            traceId
        },
        extra: { url: request.url, method: request.method },
    })
}
