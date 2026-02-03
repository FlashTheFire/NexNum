
import { prisma } from '../src/lib/core/db'
import { encrypt } from '../src/lib/security/encryption'

async function migrate() {
    console.log('🚀 Starting Secret Migration...')

    // 1. Providers Migration
    const providers = await prisma.provider.findMany({
        where: {
            authKey: {
                not: null,
                notIn: [], // Dummy to allow complex not logic if needed, but 'not' with startsWith is better
            },
            AND: [
                { authKey: { not: { startsWith: 'v1:' } } }
            ]
        }
    })

    console.log(`🔍 Found ${providers.length} providers with legacy plain-text keys.`)

    for (const provider of providers) {
        if (!provider.authKey) continue

        console.log(`🔒 Encrypting key for: ${provider.name}`)
        const encrypted = encrypt(provider.authKey)

        await prisma.provider.update({
            where: { id: provider.id },
            data: { authKey: encrypted }
        })
    }

    // 2. Add other migrations here if needed (e.g. SMTP pass if it was plain text)

    console.log('✅ Migration Complete.')
}

migrate()
    .catch(e => {
        console.error('❌ Migration Failed:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
