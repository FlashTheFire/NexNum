
import { prisma } from '../../src/lib/core/db'

async function main() {
    console.log('[CONFIG_FIX] Searching for smsbower...')

    // 1. Find Provider
    const provider = await prisma.provider.findFirst({
        where: { name: { equals: 'smsbower', mode: 'insensitive' } }
    })

    if (!provider) {
        console.error('[CONFIG_FIX] Update failed: Provider "smsbower" not found!')
        return
    }

    console.log('[CONFIG_FIX] Found provider:', provider.name)

    // 2. Update Mappings
    const currentMappings = (provider.mappings as any) || {}

    if (currentMappings.useDynamicMetadata === true) {
        console.log('[CONFIG_FIX] useDynamicMetadata is already TRUE. No changes needed.')
    } else {
        console.log('[CONFIG_FIX] Enabling useDynamicMetadata...')

        const newMappings = {
            ...currentMappings,
            useDynamicMetadata: true, // FORCE TRUE

            // Ensure endpoint mappings are preserved (they are already in the DB object)
        }

        await prisma.provider.update({
            where: { id: provider.id },
            data: {
                mappings: newMappings,
                lastMetadataSyncAt: new Date(0) // Force re-sync
            }
        })

        console.log('[CONFIG_FIX] SUCCESS! Enabled dynamic metadata and reset sync timer.')
    }
}

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect()
    })
