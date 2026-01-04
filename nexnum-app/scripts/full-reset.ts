
import 'dotenv/config'
import { MeiliSearch } from 'meilisearch'
import { prisma } from '../src/lib/db'
import { initSearchIndexes } from '../src/lib/search'

const MEILI_HOST = process.env.MEILISEARCH_HOST || 'http://127.0.0.1:7700'
const MEILI_KEY = process.env.MEILISEARCH_API_KEY || ''

async function fullReset() {
    console.log('🔥 FULL DATA RESET STARTING...\n')

    // 1. Reset MeiliSearch
    console.log('📊 Step 1: Resetting MeiliSearch...')
    const meili = new MeiliSearch({ host: MEILI_HOST, apiKey: MEILI_KEY })
    try {
        const indexes = await meili.getIndexes()
        for (const idx of indexes.results) {
            console.log(`   🗑️  Deleting index: ${idx.uid}`)
            await meili.deleteIndex(idx.uid)
        }
        // Wait for deletion to complete
        await new Promise(r => setTimeout(r, 2000))
        console.log('   ✅ MeiliSearch indexes cleared\n')
    } catch (e) {
        console.error('   ❌ MeiliSearch reset failed:', e)
    }

    // 2. Reset Database Tables
    console.log('🗄️  Step 2: Resetting Database Tables...')
    try {
        // Delete in order to respect foreign keys
        console.log('   Deleting ProviderPricing...')
        await prisma.providerPricing.deleteMany({})

        console.log('   Deleting ProviderService...')
        await prisma.providerService.deleteMany({})

        console.log('   Deleting ProviderCountry...')
        await prisma.providerCountry.deleteMany({})

        console.log('   Deleting ServiceAggregate...')
        await prisma.serviceAggregate.deleteMany({})

        console.log('   Deleting ServiceLookup...')
        await prisma.serviceLookup.deleteMany({})

        console.log('   Deleting CountryLookup...')
        await prisma.countryLookup.deleteMany({})

        console.log('   Deleting Provider (configs)...')
        await prisma.provider.deleteMany({})

        console.log('   ✅ Database tables cleared\n')
    } catch (e) {
        console.error('   ❌ Database reset failed:', e)
    }

    // 3. Re-initialize MeiliSearch indexes
    console.log('🔄 Step 3: Re-initializing MeiliSearch indexes...')
    try {
        await initSearchIndexes()
        console.log('   ✅ MeiliSearch indexes initialized\n')
    } catch (e) {
        console.error('   ❌ Index initialization failed:', e)
    }

    console.log('🎉 FULL RESET COMPLETE! Ready for fresh sync.\n')
}

fullReset()
    .catch(e => console.error('Reset failed:', e))
    .finally(() => prisma.$disconnect())
