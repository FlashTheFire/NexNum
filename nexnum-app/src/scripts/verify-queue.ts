
import { config } from 'dotenv'
config()

import { queue } from '../src/lib/core/queue'

async function verify() {
    console.log('Testing Queue connection...')

    // 1. Start Queue
    await queue.start()
    console.log('✅ Queue connected successfully!')

    // 2. Publish Test Job
    console.log('Publishing Verification Job to WEBHOOK_PROCESSING...')

    // Simulate a payload
    const testPayload = {
        activationId: 'test-activation-' + Date.now(),
        eventType: 'sms.received',
        timestamp: new Date().toISOString()
    }

    const jobId = await queue.publish('process-webhook', {
        provider: 'mock-provider',
        payload: testPayload
    })

    console.log(`✅ Job Published: ${jobId}`)
    console.log('ℹ️  Ensure "npm run worker" is active to process this job.')

    process.exit(0)
}

verify().catch(err => {
    console.error('❌ Queue verification failed:', err)
    process.exit(1)
})
