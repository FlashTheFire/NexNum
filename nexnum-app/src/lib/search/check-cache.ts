
import 'dotenv/config'
import { prisma } from '@/lib/core/db'

async function checkCache() {
    console.log('='.repeat(50))
    console.log('📦 CACHE CONTENT REPORT')
    console.log('='.repeat(50))

    // 1. Global Lookups (Shared across all providers)
    const lookupServices = await prisma.serviceLookup.count()
    const lookupCountries = await prisma.countryLookup.count()

    console.log('\n🌍 GLOBAL LOOKUP TABLES (Used for normalization/fallback):')
    console.log(`   - ServiceLookup: ${lookupServices} records`)
    console.log(`   - CountryLookup: ${lookupCountries} records`)

    // 2. Provider Specific (Actual available inventory)
    const providerServices = await prisma.providerService.count()
    const providerCountries = await prisma.providerCountry.count()

    console.log('\n🏢 PROVIDER SPECIFIC TABLES (Inventory):')
    console.log(`   - ProviderService: ${providerServices} records`)
    console.log(`   - ProviderCountry: ${providerCountries} records`)

    // 3. Breakdown by Provider
    const providers = await prisma.provider.findMany({
        include: {
            _count: {
                select: { services: true, countries: true, pricing: true }
            }
        }
    })

    console.log('\n📊 BREAKDOWN BY PROVIDER:')
    providers.forEach(p => {
        console.log(`   - ${p.name}:`)
        console.log(`     • Services:  ${p._count.services}`)
        console.log(`     • Countries: ${p._count.countries}`)
        console.log(`     • Prices:    ${p._count.pricing}`)
    })
}

checkCache().catch(console.error).finally(() => prisma.$disconnect())
