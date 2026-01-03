/**
 * Script to flush all GrizzlySMS data
 * 
 * Deletes:
 * - ProviderPricing
 * - ProviderService
 * - ProviderCountry
 * - Search Index (via deleteOffersByProvider)
 */

import 'dotenv/config'

import { prisma } from './db'
import { deleteOffersByProvider } from './search'

async function flushGrizzly() {
    console.log('='.repeat(60))
    console.log('🧹 FLUSHING GRIZZLYSMS DATA')
    console.log('='.repeat(60))

    try {
        const provider = await prisma.provider.findFirst({
            where: { name: { contains: 'grizzly', mode: 'insensitive' } }
        })

        if (!provider) {
            console.log('❌ GrizzlySMS provider not found in DB')
            return
        }

        console.log(`Found provider: ${provider.name} (${provider.id})`)

        // 1. Delete Pricing
        console.log('1️⃣ Deleting Pricing...')
        const { count: pricingCount } = await prisma.providerPricing.deleteMany({
            where: { providerId: provider.id }
        })
        console.log(`   - Deleted ${pricingCount} pricing records`)

        // 2. Delete Services
        console.log('2️⃣ Deleting Services...')
        const { count: servicesCount } = await prisma.providerService.deleteMany({
            where: { providerId: provider.id }
        })
        console.log(`   - Deleted ${servicesCount} service records`)

        // 3. Delete Countries
        console.log('3️⃣ Deleting Countries...')
        const { count: countriesCount } = await prisma.providerCountry.deleteMany({
            where: { providerId: provider.id }
        })
        console.log(`   - Deleted ${countriesCount} country records`)

        // 4. Clear Search Index
        console.log('4️⃣ Clearing Search Index...')
        try {
            await deleteOffersByProvider(provider.name)
            console.log('   - Search index cleared')
        } catch (e) {
            console.log(`   - Failed to clear search index: ${e instanceof Error ? e.message : e}`)
        }

        // 5. Reset Provider Sync Status
        console.log('5️⃣ Resetting Provider Status...')
        await prisma.provider.update({
            where: { id: provider.id },
            data: {
                lastSyncAt: null,
                lastMetadataSyncAt: null,
                syncStatus: 'idle',
                syncCount: 0,
                cachedCountries: 0,
                cachedServices: 0
            }
        })
        console.log('   - Provider status reset')

        console.log('\n✅ FLUSH COMPLETE')

    } catch (e) {
        console.error('❌ Error flushing data:', e)
    } finally {
        await prisma.$disconnect()
    }
}

flushGrizzly().catch(console.error)
