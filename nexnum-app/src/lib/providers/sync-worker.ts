import { parentPort, workerData } from 'node:worker_threads'
import { syncProviderData } from './provider-sync.ts'
import { logger } from '@/lib/core/logger'

/**
 * Sync Worker Thread
 * 
 * Offloads heavy fetching, parsing, and indexing logic from the main thread.
 * This ensures the API remains responsive during 50k+ offer syncs.
 */
async function runSync() {
    if (!parentPort) return

    const { providerName, options } = workerData

    try {
        logger.info('Worker sync started', { provider: providerName })
        const result = await syncProviderData(providerName, options)
        parentPort.postMessage({ status: 'success', result })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error('Worker sync failed', { provider: providerName, error: message })
        parentPort.postMessage({ status: 'error', error: message })
    } finally {
        process.exit(0)
    }
}

runSync()

