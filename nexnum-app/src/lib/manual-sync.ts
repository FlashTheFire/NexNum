
import 'dotenv/config'

import { syncAllProviders } from './provider-sync'
import { prisma } from './db'

async function runSync() {
    console.log('='.repeat(60))
    console.log('🔄 MANUAL DATA SYNC STARTED')
    console.log('='.repeat(60))

    try {
        const results = await syncAllProviders()
        console.log('\n✅ Sync Results:')
        console.log(JSON.stringify(results, null, 2))
    } catch (e) {
        console.error('❌ Sync Failed:', e)
    } finally {
        await prisma.$disconnect()
    }
}

runSync().catch(console.error)
