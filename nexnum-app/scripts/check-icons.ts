
import 'dotenv/config'
import { prisma } from '../src/lib/db'

async function checkIcons() {
    // Check ProviderService for iconUrl
    const withIcons = await prisma.providerService.count({
        where: { iconUrl: { not: null } }
    })
    const total = await prisma.providerService.count()
    console.log(`ProviderService: ${withIcons}/${total} have iconUrl`)

    // Sample some with iconUrl
    const samples = await prisma.providerService.findMany({
        where: { iconUrl: { not: null } },
        take: 5,
        select: { name: true, externalId: true, iconUrl: true }
    })
    console.log('Samples:', JSON.stringify(samples, null, 2))

    await prisma.$disconnect()
}

checkIcons()
