/**
 * Industrial Core Orchestrator
 * 
 * The single source of truth for application lifecycle and process state.
 * Unifies bootstrapping and graceful shutdown across:
 * - Next.js (instrumentation.ts)
 * - Background Workers (worker-entry.ts)
 * - Socket Server (socket-entry.ts)
 */

import { logger } from './logger'
import { validateEnv } from './env'
import { prisma } from './db'
import { redis } from './redis'

export type SystemState = 'STARTING' | 'READY' | 'SHUTTING_DOWN' | 'EXITED'

export type ShutdownHook = () => Promise<void> | void

class CoreOrchestrator {
    private state: SystemState = 'STARTING'
    private shutdownHooks: Set<ShutdownHook> = new Set()
    private isInitialized = false

    /**
     * Bootstrap the application core.
     * Ensures environment is valid and resources are warmed up.
     */
    async bootstrap(context: string) {
        if (this.isInitialized) return
        this.isInitialized = true

        // 0. Senior-Grade Branding (Splash)
        logger.splash()

        logger.info(`[Orchestrator] 🚀 Bootstrapping Core (${context})...`)


        try {
            // 1. Environment Validation (Fail Fast)
            validateEnv()

            // 2. Resource Warming (Pre-flight connectivity)
            // If we are in the build phase, failures should be non-fatal
            const isBuild =
                process.env.NEXT_PHASE === 'phase-production-build' ||
                process.env.NEXT_IS_BUILDING === '1' ||
                process.env.npm_lifecycle_event === 'build' ||
                process.argv.some(arg => arg.includes('next-build') || (arg.includes('next') && process.argv.includes('build')));

            await Promise.all([
                this.warmPrisma(),
                this.warmRedis().catch(e => {
                    if (isBuild) logger.warn('[Orchestrator] Redis warm-up failed during build (expected if no Redis available)')
                    else throw e
                }),
                this.warmMeiliSearch()
            ])

            // 3. Initialize Signal Handling
            this.initSignalHandling()

            this.state = 'READY'
            logger.success(`[Orchestrator] ✅ System READY (${context})`)
            logger.divider()
        } catch (error: any) {
            const isBuild =
                process.env.NEXT_PHASE === 'phase-production-build' ||
                process.env.NEXT_IS_BUILDING === '1' ||
                process.env.npm_lifecycle_event === 'build' ||
                process.argv.some(arg => arg.includes('next-build') || (arg.includes('next') && process.argv.includes('build')));

            if (isBuild) {
                logger.warn(`[Orchestrator] ⚠️ Bootstrap encountered error during build phase, but continuing: ${error?.message}`)
                this.state = 'READY' // Force ready for build to proceed
                return
            }

            logger.error(`[Orchestrator] ❌ FATAL BOOTSTRAP FAILURE (${context})`, {
                errorMessage: error?.message || 'Unknown error',
                stack: error?.stack
            })
            process.exit(1)
        }
    }

    /**
     * Register a graceful shutdown hook.
     */
    onShutdown(hook: ShutdownHook) {
        this.shutdownHooks.add(hook)
    }

    /**
     * Trigger a graceful shutdown of all core services.
     */
    async shutdown(signal: string) {
        if (this.state === 'SHUTTING_DOWN' || this.state === 'EXITED') return
        this.state = 'SHUTTING_DOWN'

        logger.divider()
        logger.warn(`[Orchestrator] 🛑 SHUTDOWN SIGNAL RECEIVED (${signal})`)
        logger.info(`[Orchestrator] Executing ${this.shutdownHooks.size} registered hooks...`)

        const timeout = setTimeout(() => {
            logger.error('[Orchestrator] ⚠️ Shutdown timed out! Forcing exit.')
            process.exit(1)
        }, 10000) // 10s max for graceful exit

        try {
            // Execute hooks in reverse order (LIFO) or as they come
            for (const hook of Array.from(this.shutdownHooks).reverse()) {
                await Promise.resolve(hook())
            }

            // Core Resource Cleanup
            await Promise.allSettled([
                prisma.$disconnect(),
                redis.quit()
            ])

            logger.success('[Orchestrator] 👋 Graceful shutdown completed.')
            clearTimeout(timeout)
            this.state = 'EXITED'

            // Only exit process if not in a Next.js environment that manages its own exit
            if (process.env.NEXT_RUNTIME !== 'nodejs' || !contextIsNextJS()) {
                process.exit(0)
            }
        } catch (error) {
            logger.error('[Orchestrator] ❌ Shutdown error', { error })
            process.exit(1)
        }
    }

    private async warmPrisma() {
        await prisma.$connect()
        logger.debug('[Orchestrator] DB connected')
    }

    private async warmRedis() {
        const ping = await redis.ping()
        if (ping !== 'PONG') throw new Error('Redis PING failed')
        logger.debug('[Orchestrator] Redis connected')
    }

    private async warmMeiliSearch() {
        try {
            const { initSearchIndexes } = await import('@/lib/search/search')
            await initSearchIndexes()
            logger.debug('[Orchestrator] MeiliSearch indexes initialized')
        } catch (error) {
            logger.error('[Orchestrator] MeiliSearch warming failed', { error })
            // We don't fail bootstrap for search indexes (non-critical compared to DB/Redis)
        }
    }

    private initSignalHandling() {
        process.on('SIGTERM', () => this.shutdown('SIGTERM'))
        process.on('SIGINT', () => this.shutdown('SIGINT'))
    }

    getState() { return this.state }
}

function contextIsNextJS() {
    // Detect if we are running inside the main Next.js server process
    return !!process.env.NEXT_RUNTIME && !process.argv[1]?.includes('worker-entry') && !process.argv[1]?.includes('socket-entry')
}

export const orchestrator = new CoreOrchestrator()
