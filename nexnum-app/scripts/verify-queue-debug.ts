
import { config } from 'dotenv'
config()

import { prisma } from '../src/lib/core/db'
import { queue } from '../src/lib/core/queue'

async function debug() {
    console.log('1. Starting Queue...')
    await queue.start()
    console.log('2. Queue Started. Connecting Prisma...')

    // Simple Prisma Query
    const userCount = await prisma.user.count()
    console.log(`3. Prisma Connected. User Count: ${userCount}`)

    // Queue publish
    console.log('4. Publishing Test Job...')
    const id = await queue.publish('test-queue', { foo: 'bar' })
    console.log(`5. Job Published: ${id}`)

    process.exit(0)
}

debug().catch(e => {
    console.error('Debug failed:', e)
    process.exit(1)
})
