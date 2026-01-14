
import { config } from 'dotenv'
config()

import { queue } from '../src/lib/core/queue'

async function verify() {
    console.log('Testing Queue connection...')

    // 1. Start Queue
    await queue.start()
    console.log('✅ Queue connected successfully!')

    // 2. Publish Test Job
    console.log('Publishing Verification Job...')
    const jobId = await queue.publish('notification-delivery', {
        notificationId: 'verify-' + Date.now(),
        userId: 'verify-user',
        title: 'Verification Notification',
        message: 'System Integrity Check',
        data: { source: 'verify-queue-script' }
    })

    console.log(`✅ Job Published: ${jobId}`)
    console.log('ℹ️  Ensure "npm run worker" is active to process this job.')

    process.exit(0)
}

verify().catch(err => {
    console.error('❌ Queue verification failed:', err)
    process.exit(1)
})
