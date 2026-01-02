
import * as dotenv from 'dotenv'
dotenv.config()

async function run() {
    console.log('Loading env vars...')
    // Dynamic import ensures dotenv runs first
    const { syncProviderData } = await import('./src/lib/provider-sync')
    const { prisma } = await import('./src/lib/db')

    console.log('Enabling Dynamic Metadata for 5sim...')
    // 1. Enable Toggle
    const provider = await prisma.provider.findUnique({ where: { name: '5sim' } })
    let originalMappings: any = {}

    if (provider) {
        let mappings = provider.mappings as any
        if (typeof mappings === 'string') mappings = JSON.parse(mappings)
        originalMappings = mappings

        await prisma.provider.update({
            where: { id: provider.id },
            data: { mappings: { ...mappings, useDynamicMetadata: true } }
        })
    } else {
        console.error('Provider 5sim not found!')
        return
    }

    console.log('Triggering manual sync for 5sim (Dynamic Mode)...')
    try {
        const result = await syncProviderData('5sim')
        console.log('Sync Result:', JSON.stringify(result, null, 2))
    } catch (e) {
        console.error('Sync Failed:', e)
    } finally {
        // Revert
        if (provider) {
            await prisma.provider.update({
                where: { id: provider.id },
                data: { mappings: originalMappings } // Restore original
            })
            console.log('Reverted 5sim to Legacy Mode')
        }
        await prisma.$disconnect()
    }
}

run()
