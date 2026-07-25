import 'dotenv/config'
import { meili, INDEXES } from '../lib/search/search'
import { redis } from '../lib/core/redis'
import { syncAllProviders } from '../lib/providers/provider-sync'
import { prisma } from '../lib/core/db'

async function resetAndSync() {
    console.log('🧹 Clearing old search index and cache...')
    try {
        // 1. Delete all documents in MeiliSearch offers index and wait for completion
        const index = meili.index(INDEXES.OFFERS)
        const deleteTask = await index.deleteAllDocuments()
        await meili.waitForTask(deleteTask.taskUid)
        console.log('✅ Cleared all documents from MeiliSearch "offers" index.')

        // 2. Clear Redis cache for getPrices using SCAN
        try {
            let cursor = '0'
            let totalFlushed = 0
            do {
                const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'v1:getprices:*', 'COUNT', 1000)
                cursor = nextCursor
                if (keys.length > 0) {
                    await redis.unlink(...keys)
                    totalFlushed += keys.length
                }
            } while (cursor !== '0')
            if (totalFlushed > 0) {
                console.log(`✅ Flushed ${totalFlushed} cached price keys from Redis.`)
            }
        } catch (e: any) {
            console.error('❌ Could not clear Redis cache keys:', e.message)
            throw new Error(`Redis cache clearance failed: ${e.message}`)
        }

        // 3. Run full provider sync
        console.log('🚀 Triggering fresh provider sync...')
        const results = await syncAllProviders()
        console.log('✅ Fresh Sync Complete!')
        console.table(results.map(r => ({
            provider: r.provider,
            countries: r.countries,
            services: r.services,
            prices: r.prices,
            duration: `${(r.duration / 1000).toFixed(2)}s`
        })))
    } catch (e) {
        console.error('❌ Reset & Sync Failed:', e)
        process.exitCode = 1
    } finally {
        await prisma.$disconnect()
    }
}

resetAndSync().catch((e) => {
    console.error('❌ Cleanup Failed:', e)
    process.exitCode = 1
})
