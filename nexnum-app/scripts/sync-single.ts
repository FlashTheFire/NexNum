
import 'dotenv/config'
import { syncProviderData } from '../src/lib/provider-sync'
import { prisma } from '../src/lib/db'

async function run() {
    const provider = process.argv[2] || 'grizzlysms'
    try {
        console.log(`🚀 Syncing single provider: ${provider}...`)
        const result = await syncProviderData(provider)
        console.log('✅ Sync result:', JSON.stringify(result, null, 2))
    } catch (e) {
        console.error('❌ Sync failed:', e)
    } finally {
        await prisma.$disconnect()
    }
}

run()
