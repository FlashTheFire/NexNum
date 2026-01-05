
import 'dotenv/config'
import { syncAllProviders } from '../src/lib/provider-sync'
import { prisma } from '../src/lib/db'

async function run() {
    try {
        console.log('🚀 Starting forceful sync (Metadata + Prices + Re-index)...')
        await syncAllProviders()
        console.log('✅ Sync complete.')
    } catch (e) {
        console.error('❌ Sync failed:', e)
    } finally {
        await prisma.$disconnect()
    }
}

run()
