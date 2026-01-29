import { parentPort, workerData } from 'node:worker_threads'
import { syncProviderData } from './provider-sync.ts'

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
        console.log(`[WORKER] Starting sync for ${providerName}...`)
        const result = await syncProviderData(providerName, options)
        parentPort.postMessage({ status: 'success', result })
    } catch (error: any) {
        console.error(`[WORKER] Sync failed for ${providerName}:`, error)
        parentPort.postMessage({ status: 'error', error: error.message })
    } finally {
        process.exit(0)
    }
}

runSync()
