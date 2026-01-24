
import * as dotenv from 'dotenv';
dotenv.config();

console.log('MASTER RESET: Initializing...');

// Force connection limit to 1 to avoid 'MaxClientsInSessionMode'
if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('connection_limit')) {
    const separator = process.env.DATABASE_URL.includes('?') ? '&' : '?';
    process.env.DATABASE_URL = `${process.env.DATABASE_URL}${separator}connection_limit=1`;
}

async function main() {
    // Dynamic imports to pick up env vars
    const { prisma } = await import('@/lib/core/db');
    const { meili } = await import('@/lib/search/search');
    const fs = await import('fs');
    const path = await import('path');

    console.log('🗑️  Step 1: Wiping Database Tables...');
    // Order matters for foreign keys
    try {
        await prisma.providerPricing.deleteMany({});
        console.log('   - ProviderPricing deleted');

        await prisma.providerService.deleteMany({});
        console.log('   - ProviderService deleted');

        await prisma.providerCountry.deleteMany({});
        console.log('   - ProviderCountry deleted');

        // Optional: Reset sync status on providers
        await prisma.provider.updateMany({
            data: {
                lastMetadataSyncAt: null,
                lastBalanceSync: null,
                syncStatus: 'idle',
                syncCount: 0
            }
        });
        console.log('   - Provider sync stats reset');
    } catch (e: any) {
        console.error('   ❌ Database Wipe Failed:', e.message);
    }

    console.log('🗑️  Step 2: Clearing MeiliSearch Index...');
    try {
        await meili.index('offers').deleteAllDocuments();
        console.log('   - Index "offers" cleared');
    } catch (e: any) {
        console.warn('   ⚠️ MeiliSearch clear warning (might be empty):', e.message);
    }

    console.log('🗑️  Step 3: Deleting Service Icons...');
    try {
        const iconsDir = path.join(process.cwd(), 'public/icons/services');
        if (fs.existsSync(iconsDir)) {
            const files = fs.readdirSync(iconsDir);
            for (const file of files) {
                if (file !== '.gitkeep') { // Preserve gitkeep if exists
                    fs.unlinkSync(path.join(iconsDir, file));
                }
            }
            console.log(`   - Deleted ${files.length} icon files`);
        } else {
            console.log('   - Icon directory does not exist (skipping)');
        }
    } catch (e: any) {
        console.error('   ❌ Icon Wipe Failed:', e.message);
    }

    console.log('✅ MASTER RESET COMPLETE. You can now execute a fresh sync.');
    process.exit(0);
}

main().catch(e => {
    console.error('Fatal Error:', e);
    process.exit(1);
});
