
import { PrismaClient } from '@prisma/client'
import { prisma } from '../src/lib/db'

async function main() {
    const providers = await prisma.provider.findMany()
    console.log(`Found ${providers.length} providers:`)
    providers.forEach(p => console.log(`- ${p.name} (ID: ${p.id})`))
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
