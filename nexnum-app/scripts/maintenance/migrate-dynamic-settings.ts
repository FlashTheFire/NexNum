
import { prisma } from '../../src/lib/core/db'

async function main() {
    console.log('[MIGRATE] Checking providers for dynamic settings...')

    const providers = await prisma.provider.findMany()
    let count = 0

    for (const p of providers) {
        const mappings = (p.mappings as any) || {}
        let needsUpdate = false
        const updates: any = {}

        // Check useDynamicMetadata
        if (mappings.useDynamicMetadata !== undefined) {
            console.log(`[MIGRATE] ${p.name}: Moving useDynamicMetadata (${mappings.useDynamicMetadata}) to column.`)
            updates.useDynamicMetadata = mappings.useDynamicMetadata
            delete mappings.useDynamicMetadata // Remove from JSON to clean up
            needsUpdate = true
        }

        // Check dynamicFunctions
        if (mappings.dynamicFunctions !== undefined) {
            console.log(`[MIGRATE] ${p.name}: Moving dynamicFunctions to column.`)
            updates.dynamicFunctions = mappings.dynamicFunctions
            delete mappings.dynamicFunctions
            needsUpdate = true
        }

        // SPECIAL FIX FOR SMSBOWER
        if (p.name.toLowerCase() === 'smsbower') {
            if (!updates.useDynamicMetadata && !p.useDynamicMetadata) {
                console.log(`[MIGRATE] ${p.name}: FORCING useDynamicMetadata = true`)
                updates.useDynamicMetadata = true
                needsUpdate = true
            }
        }

        if (needsUpdate) {
            await prisma.provider.update({
                where: { id: p.id },
                data: {
                    ...updates,
                    mappings: mappings, // Save cleaned mappings
                    lastMetadataSyncAt: new Date(0) // Force resync
                }
            })
            console.log(`[MIGRATE] ${p.name}: Updated successfully.`)
            count++
        }
    }

    console.log(`[MIGRATE] Complete. Updated ${count} providers.`)
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect()
    })
