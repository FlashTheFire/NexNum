
import { prisma } from '../../src/lib/core/db'
import { syncAllProviders } from '../../src/lib/providers/provider-sync'

async function main() {
    console.log('[FORCE_SYNC] Resetting metadata timestamps to force fresh fetch...')

    // 1. Reset timestamps to ensure syncDynamic runs fully
    await prisma.provider.updateMany({
        data: {
            lastMetadataSyncAt: new Date(0) // 1970
        }
    })

    console.log('[FORCE_SYNC] Timestamps reset. Starting sync...')

    // 2. Run Sync
    await syncAllProviders()

    console.log('[FORCE_SYNC] Complete! Check public/icons/services for files.')
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect()
    })
