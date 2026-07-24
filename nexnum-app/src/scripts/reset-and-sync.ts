import 'dotenv/config'
import { meili, INDEXES } from '../lib/search/search'
import { redis } from '../lib/core/redis'
import { syncAllProviders } from '../lib/providers/provider-sync'
import { prisma } from '../lib/core/db'

async function resetAndSync() {
    console.log('🧹 Clearing old search index and cache...')
    try {
        // 1. Delete all documents in MeiliSearch offers index
        const index = meili.index(INDEXES.OFFERS)
        await index.deleteAllDocuments()
        console.log('✅ Cleared all documents from MeiliSearch "offers" index.')

        // 2. Clear Redis cache for getPrices
        try {
            const keys = await redis.keys('v1:getprices:*')
            if (keys.length > 0) {
                await redis.del(...keys)
                console.log(`✅ Flushed ${keys.length} cached price keys from Redis.`)
            }
        } catch (e: any) {
            console.warn('⚠️ Could not clear Redis cache keys:', e.message)
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
    } finally {
        await prisma.$disconnect()
    }
}

resetAndSync()
