import { prisma } from '../../src/lib/core/db'

async function main() {
    console.log('[FIX] Updating smsbower dynamicFunctions...')

    const smsbower = await prisma.provider.findFirst({
        where: { name: 'smsbower' }
    })

    if (!smsbower) {
        console.error('smsbower not found!')
        return
    }

    // Clean up mappings - remove dynamicFunctions from inside mappings object
    const mappings = smsbower.mappings as any
    if (mappings.dynamicFunctions) {
        delete mappings.dynamicFunctions
        console.log('[FIX] Removed dynamicFunctions from mappings blob')
    }

    // Update provider with correct dynamicFunctions at top-level
    await prisma.provider.update({
        where: { id: smsbower.id },
        data: {
            useDynamicMetadata: true,
            dynamicFunctions: {
                getBalance: true,
                getCountries: true,
                getServices: true,
                getPrices: true
            },
            mappings: mappings,
            lastMetadataSyncAt: new Date(0) // Force resync
        }
    })

    console.log('[FIX] smsbower updated successfully!')
    console.log('  - useDynamicMetadata: true')
    console.log('  - dynamicFunctions: getBalance, getCountries, getServices, getPrices')
}

main().catch(console.error).finally(() => prisma.$disconnect())
