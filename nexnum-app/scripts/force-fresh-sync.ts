
import 'dotenv/config'
import { prisma } from '../src/lib/db'
import { syncProviderData } from '../src/lib/provider-sync'

async function forceFreshSync() {
    const providerName = process.argv[2] || 'grizzlysms'

    // Reset lastMetadataSyncAt to force fresh fetch
    await prisma.provider.update({
        where: { name: providerName },
        data: { lastMetadataSyncAt: null }
    })
    console.log(`[FORCE] Reset lastMetadataSyncAt for ${providerName}`)

    // Also clear cached services to force re-fetch
    const provider = await prisma.provider.findUnique({ where: { name: providerName } })
    if (provider) {
        await prisma.providerService.deleteMany({ where: { providerId: provider.id } })
        await prisma.providerCountry.deleteMany({ where: { providerId: provider.id } })
        console.log(`[FORCE] Cleared cached countries/services for ${providerName}`)
    }

    // Now sync
    console.log(`[FORCE] Starting fresh sync for ${providerName}...`)
    const result = await syncProviderData(providerName)
    console.log('✅ Result:', JSON.stringify(result, null, 2))

    await prisma.$disconnect()
}

forceFreshSync()
