
import { config } from 'dotenv'
config({ path: '.env' })
import { meili, INDEXES, initSearchIndexes } from '../src/lib/search'

async function resetSearch() {
    console.log('🔄 Connecting to MeiliSearch...')

    try {
        // Delete main index
        console.log(`🗑️  Deleting index: ${INDEXES.OFFERS}`)
        await meili.deleteIndex(INDEXES.OFFERS)

        // Allow some time for deletion
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Re-initialize
        console.log('✨ Re-initializing indexes...')
        await initSearchIndexes()

        console.log('✅ MeiliSearch reset complete. Ready for resync.')
    } catch (error) {
        console.error('❌ Reset failed:', error)
        process.exit(1)
    }
}

resetSearch()
