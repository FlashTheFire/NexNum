
import { prisma } from '../src/lib/core/db'
import { MeiliSearch } from 'meilisearch'
import dotenv from 'dotenv'

dotenv.config()

const meili = new MeiliSearch({
    host: process.env.MEILISEARCH_HOST || 'http://localhost:7700',
    apiKey: process.env.MEILISEARCH_API_KEY || 'dev_master_key',
})

async function main() {
    console.log('🚨 STARTING INVENTORY FLUSH 🚨')
    console.log('-----------------------------------')

    // 1. SQL Cleanup
    console.log('🗑️  Cleaning SQL Database...')

    // Order matters due to foreign keys
    const t0 = performance.now()

    // Reservations depend on Pricing
    const deletedReservations = await prisma.offerReservation.deleteMany({})
    console.log(`   - Deleted ${deletedReservations.count} reservations`)

    // Pricing depends on Country, Service, Provider
    const deletedPricing = await prisma.providerPricing.deleteMany({})
    console.log(`   - Deleted ${deletedPricing.count} pricing records`)

    // Service Aggregates (Derived data)
    const deletedAggregates = await prisma.serviceAggregate.deleteMany({})
    console.log(`   - Deleted ${deletedAggregates.count} service aggregates`)

    // Provider Services
    const deletedServices = await prisma.providerService.deleteMany({})
    console.log(`   - Deleted ${deletedServices.count} provider services`)

    // Provider Countries
    const deletedCountries = await prisma.providerCountry.deleteMany({})
    console.log(`   - Deleted ${deletedCountries.count} provider countries`)

    const t1 = performance.now()
    console.log(`✅ SQL Cleanup complete in ${((t1 - t0) / 1000).toFixed(2)}s`)


    // 2. MeiliSearch Cleanup
    console.log('\n🗑️  Cleaning MeiliSearch...')
    const t2 = performance.now()

    try {
        const index = meili.index('offers')
        const stats = await index.getStats()
        console.log(`   - Found ${stats.numberOfDocuments} documents in 'offers'`)

        const task = await index.deleteAllDocuments()
        console.log(`   - Delete task enqueued: ${task.taskUid}`)

        // Wait for task to complete
        // @ts-ignore - type definition mismatch in 0.54.0
        await meili.waitForTask(task.taskUid)
        console.log('   - Create specific task finished.')

    } catch (error: any) {
        console.warn('   ⚠️  MeiliSearch warning:', error.message)
    }

    const t3 = performance.now()
    console.log(`✅ MeiliSearch cleanup complete in ${((t3 - t2) / 1000).toFixed(2)}s`)

    console.log('\n🎉 FLUSH COMPLETE')
    process.exit(0)
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
