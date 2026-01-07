import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { indexOffers, OfferDocument, initSearchIndexes } from '../src/lib/search'

/**
 * Re-indexing Script (Inventory Sync)
 * 
 * Safely synchronizes all provider pricing data from the database 
 * to MeiliSearch, ensuring the strict Name-Only identity logic is applied.
 */
async function reindexInventory() {
    console.log('🔄 Starting Full Inventory Sync (Database -> MeiliSearch)...')

    try {
        // 1. Ensure indexes are correctly configured
        console.log('⚙️ Initializing search settings...')
        await initSearchIndexes()

        // 2. Fetch all pricing records with relations
        console.log('📥 Fetching pricing data from DB...')
        const pricing = await prisma.providerPricing.findMany({
            where: { deleted: false },
            include: {
                provider: true,
                country: true,
                service: true
            }
        })

        if (pricing.length === 0) {
            console.log('ℹ️ No active pricing records found in DB. Nothing to index.')
            return
        }

        console.log(`📦 Found ${pricing.length} pricing records. Mapping to search documents...`)

        // 3. Map to OfferDocument objects
        // (indexOffers handles the internal Name canonicalization)
        const documents: OfferDocument[] = pricing.map((p, index) => ({
            id: `${p.provider.name}_${p.country.externalId}_${p.service.externalId}_${p.operator || 'default'}`.toLowerCase().replace(/[^a-z0-9_]/g, ''),
            serviceSlug: p.service.code || p.service.name, // Will be normalized in indexOffers
            serviceName: p.service.name,                   // Will be normalized in indexOffers
            iconUrl: p.service.iconUrl || undefined,
            countryCode: p.country.code || p.country.name, // Will be normalized in indexOffers
            countryName: p.country.name,                   // Will be normalized in indexOffers
            flagUrl: p.country.flagUrl || '',
            provider: p.provider.name,
            displayName: p.provider.displayName,
            operatorId: index + 1,
            externalOperator: p.operator || undefined,
            operatorDisplayName: '',
            price: Number(p.sellPrice),
            stock: p.stock,
            lastSyncedAt: p.lastSyncAt.getTime()
        }))

        // 4. Batch Indexing
        console.log(`🚀 Sending ${documents.length} documents to MeiliSearch in batches...`)
        const batchSize = 1000
        for (let i = 0; i < documents.length; i += batchSize) {
            const batch = documents.slice(i, i + batchSize)
            const taskUid = await indexOffers(batch)
            console.log(`   Batch ${Math.ceil((i + 1) / batchSize)} / ${Math.ceil(documents.length / batchSize)} queued (Task: ${taskUid})`)
        }

        console.log('✅ Inventory Re-indexing complete! MeiliSearch is processing the updates.')

    } catch (error) {
        console.error('❌ Re-indexing failed:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

reindexInventory()
