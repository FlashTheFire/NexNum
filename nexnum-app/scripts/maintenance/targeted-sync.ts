
import { prisma } from '../../src/lib/core/db';
import { meili, INDEXES } from '../../src/lib/search/search';
import { syncProviderData, SyncOptions } from '../../src/lib/providers/provider-sync';
import * as dotenv from 'dotenv';
import { refreshAllServiceAggregates } from '../../src/lib/search/service-aggregates';

dotenv.config();

async function runTargetedSync() {
    console.log('══════════════════════════════════════════════════════════════');
    console.log('   NexNum Global Maintenance: Full Asset & Data Resync');
    console.log('══════════════════════════════════════════════════════════════');

    try {
        // 1. GLOBAL WIPE - PRISMA
        console.log('[WIPE] Clearing all pricing data from PostgreSQL...');

        // Use raw SQL for reservations to avoid parameter limits and ensure cascade-like safety
        await prisma.$executeRaw`DELETE FROM offer_reservations`;
        const pricingDeleted = await prisma.providerPricing.deleteMany({});

        console.log(`[WIPE] Deleted ${pricingDeleted.count} pricing records from DB.`);

        // 2. GLOBAL WIPE - MEILISEARCH
        console.log('[WIPE] Clearing "offers" index in MeiliSearch...');
        const index = meili.index(INDEXES.OFFERS);
        const wipeTask = await index.deleteAllDocuments();

        console.log(`[WIPE] MeiliSearch wipe task triggered (ID: ${wipeTask.taskUid})`);

        // 3. TARGETED RESYNC - ALL
        const activeProviders = await prisma.provider.findMany({ where: { isActive: true } });
        console.log(`[SYNC] Starting global sync across ${activeProviders.length} active providers...`);

        const options: SyncOptions = {
            // filterCountryCode: 'india', // REMOVED: Sync ALL countries
            skipWipe: true            // We already wiped everything globally
        };

        for (const provider of activeProviders) {
            console.log(`\n[SYNC] Processing ${provider.name}...`);
            try {
                const result = await syncProviderData(provider.name, options);
                console.log(`[SYNC] Success: ${result.services} services found.`);
            } catch (err) {
                console.error(`[SYNC] Failed for ${provider.name}:`, err);
            }
        }

        // 4. REFRESH AGGREGATES
        console.log('\n[SYNC] Refreshing service aggregates...');
        await refreshAllServiceAggregates();

        console.log('\n✅ Global sync complete.');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ CRITICAL ERROR during global sync:', error);
        process.exit(1);
    }
}

runTargetedSync();
