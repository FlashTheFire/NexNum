import 'dotenv/config'
import { syncAllProviders } from '../../src/lib/providers/provider-sync'
import { prisma } from '../../src/lib/core/db'

async function run() {
    console.log('🚀 Starting Manual Full Sync...')
    try {
        const results = await syncAllProviders()
        console.log('✅ Sync Complete!')
        console.table(results.map(r => ({
            provider: r.provider,
            countries: r.countries,
            services: r.services,
            prices: r.prices,
            duration: `${(r.duration / 1000).toFixed(2)}s`
        })))
    } catch (e) {
        console.error('❌ Sync Failed:', e)
    } finally {
        await prisma.$disconnect()
    }
}

run()
