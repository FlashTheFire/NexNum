import { prisma } from '../../src/lib/core/db'
import { createApiKey } from '../../src/lib/api/api-keys'

async function main() {
    const email = 'loadtester@nexnum.com'
    let user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
        console.log('Creating load test user...')
        user = await prisma.user.create({
            data: {
                email,
                name: 'Load Tester',
                passwordHash: 'placeholder', // Not used for API access
                role: 'USER',
                isBanned: false
            }
        })
    }

    console.log('Generating API Key...')
    const result = await createApiKey({
        userId: user.id,
        name: 'Load Test Key ' + Date.now(),
        isTest: true,
        tier: 'ENTERPRISE', // High limits for load testing
        permissions: ['read', 'numbers', 'sms', 'balance']
    })

    console.log('API_KEY=' + result.rawKey)
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
