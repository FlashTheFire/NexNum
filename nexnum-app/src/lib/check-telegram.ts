
import 'dotenv/config'
import { prisma } from './db'

async function checkLookup() {
    const name = "Telegram"
    const slug = "telegram"

    console.log(`Searching for name: "${name}" or code: "${slug}"`)

    const result = await prisma.serviceLookup.findFirst({
        where: {
            OR: [
                { code: { equals: slug, mode: 'insensitive' } },
                { name: { equals: name, mode: 'insensitive' } }
            ]
        }
    })

    console.log('Result:', result)

    // Also check the specific code 'tg'
    const tg = await prisma.serviceLookup.findUnique({ where: { code: 'tg' } })
    console.log('Direct TG check:', tg)
}

checkLookup().finally(() => prisma.$disconnect())
