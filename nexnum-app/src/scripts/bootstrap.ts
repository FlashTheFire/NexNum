import 'dotenv/config'
import { prisma } from '../lib/core/db'
import { seedSystemSettings } from './seeds/seed-system-settings'
import { initSearchIndexes, meili, INDEXES } from '../lib/search/search'
import { syncAllProviders } from '../lib/providers/provider-sync'
import { execSync } from 'child_process'

/**
 * PRODUCTION BOOTSTRAP SCRIPT
 * 
 * Ensures the application is adequately prepared for traffic.
 * 1. Applies database migrations
 * 2. Seeds essential configuration (Settings, Currencies, Providers)
 * 3. Initializes MeiliSearch indexes
 * 4. Triggers initial inventory sync if empty
 */
/**
 * PRODUCTION BOOTSTRAP SCRIPT
 * 
 * Ensures the application is adequately prepared for traffic.
 * 1. Applies database migrations
 * 2. Seeds essential configuration (Settings, Currencies, Providers)
 * 3. Initializes/Reconfigures MeiliSearch indexes
 * 4. Triggers initial inventory sync if empty
 * 5. Generates professional system integrity report
 */
async function bootstrap() {
    console.log('\n' + '='.repeat(60))
    console.log('🚀 SYSTEM BOOTSTRAP INITIATED')
    console.log('📅 ' + new Date().toISOString())
    console.log('='.repeat(60) + '\n')

    try {
        // 0. Infrastructure Check (Docker)
        console.log('🐳 Phase 1: Infrastructure Verification')
        try {
            execSync('docker --version', { stdio: 'ignore' })
            console.log('   - Spawning services (Redis, MeiliSearch)...')
            execSync('docker compose up -d redis meilisearch', { stdio: 'inherit' })

            console.log('   - Waiting for services to stabilize...')
            await new Promise(r => setTimeout(r, 2000))
            console.log('   ✅ Infrastructure is ready.')
        } catch (e) {
            console.warn('   ⚠️ Docker check skipped/failed. Assuming managed services.')
        }

        // 1. Database Migrations
        console.log('\n📦 Phase 2: Database Schema Synchronization')
        try {
            execSync('npx prisma migrate deploy', { stdio: 'inherit' })
            console.log('   ✅ Schema is up to date.')
        } catch (e) {
            console.error('   ❌ Migration failure. Check database connection.')
            throw e
        }

        // 2. Configuration Seeds
        console.log('\n🌱 Phase 3: Configuration & Seed Management')
        await seedSystemSettings()
        console.log('   ✅ Seeding complete.')

        // 3. Search Engine Hardening
        console.log('\n🔍 Phase 4: Search Engine Configuration')
        console.log('   - Applying Deep Search settings...')
        await initSearchIndexes()
        console.log('   ✅ Search indexes configured.')

        // 4. Inventory Health Check
        console.log('\n📊 Phase 5: Inventory Audit')
        const index = meili.index(INDEXES.OFFERS)
        const stats = await index.getStats()

        if (stats.numberOfDocuments === 0) {
            console.log('   ⚠️ Index empty. Triggering initial full sync...')
            await syncAllProviders()
            console.log('   ✅ Initial sync complete.')
        } else {
            console.log(`   ℹ️ Index active (${stats.numberOfDocuments} documents).`)
        }

        // 5. Final System Integrity Report
        await showSystemReport(stats.numberOfDocuments)

        console.log('\n' + '='.repeat(60))
        console.log('🎉 BOOTSTRAP COMPLETE! System is ready for traffic.')
        console.log('='.repeat(60) + '\n')

    } catch (error) {
        console.error('\n❌ BOOTSTRAP FAILED CRITICAL:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

/**
 * Professional System Integrity Report
 * Merges logic from legacy check-cache.ts and check-index.ts
 */
async function showSystemReport(docCount: number) {
    console.log('\n' + '.'.repeat(60))
    console.log('📝 SYSTEM INTEGRITY REPORT')
    console.log('.'.repeat(60))

    try {
        // 1. Database Inventory Stats
        const [lookupServices, lookupCountries, providerServices, providerCountries, providers] = await Promise.all([
            prisma.serviceLookup.count(),
            prisma.countryLookup.count(),
            prisma.providerService.count(),
            prisma.providerCountry.count(),
            prisma.provider.findMany({
                include: { _count: { select: { services: true, countries: true } } }
            })
        ]);

        console.log('\n🌍 LOOKUP TABLES:')
        console.log(`   - Service Registry:  ${lookupServices}`)
        console.log(`   - Country Registry:  ${lookupCountries}`)

        console.log('\n🏢 PROVIDER INVENTORY:')
        console.log(`   - Total Services:   ${providerServices}`)
        console.log(`   - Total Countries:  ${providerCountries}`)

        console.log('\n📊 PROVIDER BREAKDOWN:')
        providers.forEach(p => {
            const s = (p as any)._count;
            console.log(`   - ${p.name.padEnd(12)} | Services: ${String(s?.services || 0).padEnd(5)} | Countries: ${s?.countries || 0}`)
        })

        // 2. Search Engine Quick Audit
        console.log('\n🔎 SEARCH ENGINE AUDIT:')
        const index = meili.index(INDEXES.OFFERS)

        // Spot check for critical service
        const tgCheck = await index.search('telegram', { limit: 1 })
        const statusIcon = tgCheck.hits.length > 0 ? '✅' : '⚠️'
        console.log(`   - Primary Document Count: ${docCount}`)
        console.log(`   - Telegram Spot-check:    ${statusIcon} (${tgCheck.hits.length} matches)`)

    } catch (e) {
        console.warn('   ⚠️ Failed to generate full report:', (e as Error).message)
    }
}

// Execute
if (require.main === module) {
    bootstrap()
}
