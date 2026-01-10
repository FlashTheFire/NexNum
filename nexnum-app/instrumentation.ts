/**
 * Next.js Instrumentation Hook
 * 
 * Auto-starts the NumberLifecycleManager when the server starts.
 * This ensures polling and timeout handling begins automatically
 * without requiring external cron jobs or manual triggers.
 * 
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
    // Only run in Node.js runtime (not Edge)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        try {
            const { lifecycleManager } = await import('./src/lib/number-lifecycle-manager')

            // Initialize the lifecycle manager (starts BullMQ workers)
            await lifecycleManager.initialize()

            console.log('[Instrumentation] NumberLifecycleManager initialized')

            // Graceful shutdown handlers
            const shutdown = async () => {
                console.log('[Instrumentation] Shutting down gracefully...')
                await lifecycleManager.shutdown()
                process.exit(0)
            }

            process.on('SIGTERM', shutdown)
            process.on('SIGINT', shutdown)

        } catch (error) {
            console.error('[Instrumentation] Failed to initialize lifecycle manager:', error)
            // Don't throw - allow app to start even if lifecycle manager fails
        }
    }
}
