/**
 * Next.js Instrumentation Entry Point
 * Runs once when the Next.js server boots up.
 * 
 * Used to initialize background worker services in internal mode.
 */

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // Detect Next.js build phase to prevent DB/Redis connection attempts during static compilation
        const isBuild =
            process.env.NEXT_PHASE === 'phase-production-build' ||
            process.env.NEXT_IS_BUILDING === '1' ||
            process.env.npm_lifecycle_event === 'build' ||
            process.argv.some(arg => arg.includes('next-build') || (arg.includes('next') && process.argv.includes('build')))

        if (isBuild) {
            return
        }

        // Initialize Sentry server-side error monitoring
        try {
            await import('../sentry.server.config')
        } catch {
            // Non-fatal if Sentry not configured
        }

        // Start background worker services unless explicitly disabled
        if (process.env.NEXT_DISABLE_INTERNAL_WORKERS !== 'true') {
            try {
                const { startQueueWorker } = await import('./worker-entry')
                startQueueWorker().catch(e => {
                    const msg = e instanceof Error ? e.message : String(e)
                    console.error('[INSTRUMENTATION] Internal worker startup failed:', msg)
                })
            } catch (err: any) {
                console.error('[INSTRUMENTATION] Failed to load worker-entry module:', err?.message || err)
            }
        }
    }
}

export const onRequestError = async (err: Error, request: Request, context: { routerKind: string; routePath: string }) => {
    try {
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
    } catch {
        // Fallback error logging if Sentry or request-context fails
    }
}
