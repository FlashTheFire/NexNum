
import { config } from 'dotenv'
config()

async function debug() {
    console.log('1. Env loaded. DB_URL exists?', !!process.env.DATABASE_URL)

    console.log('2. Dynamically importing modules...')
    const { queue } = await import('../src/lib/core/queue')
    const { prisma } = await import('../src/lib/core/db')

    console.log('3. Starting Queue...')
    await queue.start()

    // Simple Prisma Query
    const userCount = await prisma.user.count()
    console.log(`4. Prisma Connected. User Count: ${userCount}`)

    // Queue publish
    console.log('5. Publishing Test Job...')
    const id = await queue.publish('test-queue', { foo: 'bar' })
    console.log(`6. Job Published: ${id}`)

    process.exit(0)
}

debug().catch(e => {
    console.error('Debug failed:', e)
    process.exit(1)
})
