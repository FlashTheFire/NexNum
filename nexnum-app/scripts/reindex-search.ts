
import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { indexOffers, OfferDocument, initSearchIndexes, meili, INDEXES } from '../src/lib/search'

async function reindexSearch() {
    console.log('🔄 Starting Re-Index from Database...')

    try {
        // 1. Clear Index (Optional, but cleaner)
        // console.log('🗑️  Clearing Offers index...')
        // await meili.index(INDEXES.OFFERS).deleteAllDocuments()
        // Or better: Let indexOffers overwrite by ID. 
        // BUT if we want to remove "tg" document, we MUST delete it if the new ID is different?
        // Wait. "tg" normalization changes the SLUG, not necessarily the ID?
        // ID generation: `${provider.name}_${p.country}_${p.service}`.
        // If p.service (from DB externalId) is "tg", then ID contains "tg".
        // The normalization in `indexOffers` changes `serviceSlug` property but DOES NOT CHANGE ID.
        // `indexOffers` line 706: `primaryKey: 'id'`.
        // If ID remains `grizzly_us_tg`, but `serviceSlug` becomes `telegram`:
        // The old document `grizzly_us_tg` with `serviceSlug="tg"` will be OVERWRITTEN by `grizzly_us_tg` with `serviceSlug="telegram"`.
        // So overwriting is fine!
        // HOWEVER, if the user has BOTH "tg" and "telegram" in DB (from different providers),
        // they have different IDs: `grizzly_us_tg` vs `5sim_us_telegram`.
        // MeiliSearch will have TWO documents.
        // 1. `grizzly_us_tg` -> slug: `telegram`
        // 2. `5sim_us_telegram` -> slug: `telegram`
        // Search Aggregation (`searchServices`) groups by `slug`.
        // So they will be merged into ONE bucket "Telegram".
        // So simply re-indexing is enough!

        // 2. Fetch all pricing data with relations
        console.log('📥 Fetching pricing data from DB...')
        const pricing = await prisma.providerPricing.findMany({
            include: {
                provider: true,
                country: true,
                service: true
            }
        })

        console.log(`📦 Found ${pricing.length} pricing records. Preparing documents...`)

        const documents: OfferDocument[] = pricing.map((p, index) => {
            // Reconstruct ID logic from provider-sync.ts
            // id: `${provider.name}_${p.country}_${p.service}`
            // We use external IDs from the relations
            const providerName = p.provider.name
            const countryCode = p.country.externalId
            const serviceCode = p.service.externalId
            const operator = p.operator || 'default'

            const rawId = `${providerName}_${countryCode}_${serviceCode}_${operator}`.toLowerCase().replace(/[^a-z0-9_]/g, '')

            return {
                id: rawId,
                provider: providerName,
                displayName: p.provider.displayName,
                countryCode: countryCode,
                countryName: p.country.name,
                flagUrl: p.country.flagUrl || '',
                serviceSlug: serviceCode.toLowerCase(), // This will be normalized by indexOffers
                serviceName: p.service.name, // Will be normalized if "tg"
                iconUrl: p.service.iconUrl || undefined,
                // Operator fields
                operatorId: index + 1, // Sequential ID for re-indexing
                externalOperator: operator !== 'default' ? operator : undefined,
                operatorDisplayName: '',
                price: Number(p.sellPrice),
                stock: p.stock,
                lastSyncedAt: p.lastSyncAt.getTime()
            }
        })

        // 3. Batch Index
        console.log('🚀 Sending to MeiliSearch...')
        const chunkSize = 5000
        for (let i = 0; i < documents.length; i += chunkSize) {
            const chunk = documents.slice(i, i + chunkSize)
            const taskUid = await indexOffers(chunk)
            console.log(`   Batch ${Math.ceil(i / chunkSize) + 1} queued (Task ${taskUid})`)
        }

        console.log('✅ Re-indexing triggered. Please wait a few seconds for MeiliSearch to process.')

    } catch (e) {
        console.error('❌ Re-index failed:', e)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

reindexSearch()
