
import 'dotenv/config'
import { prisma } from './db'

async function showServices() {
    // 1. Get the provider ID for GrizzlySMS
    const provider = await prisma.provider.findFirst({
        where: { name: 'smsbower' }
    })

    if (!provider) {
        console.log('❌ GrizzlySMS provider not found')
        return
    }

    console.log(`\n🔍 Showing raw services for provider: ${provider.name} (ID: ${provider.id})`)

    // 2. Fetch first 10 services
    const services = await prisma.providerService.findMany({
        where: { providerId: provider.id },
        take: 10,
        orderBy: { name: 'asc' } // Alphabetical order
    })

    console.log('\n📊 DATABASE RECORDS (ProviderService Table):')
    console.log(JSON.stringify(services, null, 2))

    // 3. Count total
    const total = await prisma.providerService.count({
        where: { providerId: provider.id }
    })
    console.log(`\n✅ Total Services Fetched: ${total}`)
}

showServices().catch(console.error).finally(() => prisma.$disconnect())
