import { queue, QUEUES } from '../lib/core/queue'
import { orchestrator } from '../lib/core/orchestrator'
import { logger } from '../lib/core/logger'

/**
 * Industrial Sync Trigger CLI
 * Bypasses HTTP Auth to force a provider-sync job.
 */
async function trigger() {
    console.log('🚀 [CLI] Initializing Industrial Sync Trigger...')

    try {
        await orchestrator.bootstrap('CLI:Sync-Trigger')
        await queue.start()

        console.log('📡 [CLI] Publishing PROVIDER_SYNC job for grizzlysms to queue...')
        const jobId = await queue.publish(QUEUES.PROVIDER_SYNC, { provider: 'grizzlysms' })

        console.log(`✅ [CLI] Industrial Sync Job Queued successfully. ID: ${jobId}`)
        console.log('⏳ [CLI] Waiting for worker to pick up the job...')

        // Wait a few seconds to let it settle
        await new Promise(r => setTimeout(r, 5000))

        await queue.stop()
        process.exit(0)
    } catch (error) {
        console.error('❌ [CLI] Industrial Sync Trigger Failed:', error)
        process.exit(1)
    }
}

trigger()
