import { prisma } from '../../src/lib/core/db'

// Hashes to migrate
const BANNED_HASHES = [
    {
        hash: 'be311539f1b49d644e5a70c1f0023c05a7eebabd282287305e8ca49587087702',
        description: '5sim Bad Bear Icon'
    }
]

async function main() {
    console.log('Seeding banned icons...')

    for (const item of BANNED_HASHES) {
        try {
            await prisma.bannedIcon.upsert({
                where: { hash: item.hash },
                create: item,
                update: item
            })
            console.log(`Synced: ${item.description}`)
        } catch (e) {
            console.warn(`Failed to sync ${item.description}:`, e)
        }
    }
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
