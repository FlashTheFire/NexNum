import { prisma } from '../lib/core/db'

async function activate() {
    const providerName = process.argv[2] || 'grizzlysms'
    console.log(`🚀 [ACTIVATE] Target: ${providerName}`)

    try {
        const provider = await prisma.provider.upsert({
            where: { name: providerName },
            update: { isActive: true },
            create: {
                name: providerName,
                displayName: providerName.charAt(0).toUpperCase() + providerName.slice(1),
                isActive: true,
                priority: 1,
                apiBaseUrl: 'https://api.grizzlysms.com',
                endpoints: {},
                mappings: {}
            }
        })

        console.log(`✅ [ACTIVATE] Success: ${provider.name} (ID: ${provider.id}) is now ACTIVE.`)
    } catch (error: any) {
        console.error(`❌ [ACTIVATE] Failure:`, error.message)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

activate()
