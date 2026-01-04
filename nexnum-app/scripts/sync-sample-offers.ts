/**
 * Sample Data Sync for MeiliSearch
 * 
 * This script populates the offers index with sample data
 * to demonstrate the MeiliSearch-first architecture.
 * 
 * Usage: npx tsx scripts/sync-sample-offers.ts
 */

import { config } from "dotenv";
config({ path: '.env' });

import { initSearchIndexes, indexOffers, waitForTask, OfferDocument } from "../src/lib/search";

// Helper to sanitize service names to slugs
function sanitizeSlug(name: string): string {
    return name.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

// Sample data - simulating provider sync
const SAMPLE_SERVICES = [
    'WhatsApp', 'Telegram', 'Discord', 'Twitter', 'Instagram',
    'Facebook', 'TikTok', 'Uber', 'Amazon', 'Google',
    'Netflix', 'Spotify', 'PayPal', 'Binance', 'Coinbase'
];

const SAMPLE_COUNTRIES = [
    { code: 'US', name: 'United States' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'IN', name: 'India' },
    { code: 'BR', name: 'Brazil' },
    { code: 'RU', name: 'Russia' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
    { code: 'ID', name: 'Indonesia' },
];

const SAMPLE_PROVIDERS = [
    { name: '5sim', displayName: '5sim' },
    { name: 'smsbower', displayName: 'SMS Bower' },
    { name: 'grizzly', displayName: 'Grizzly SMS' },
    { name: 'smsactivate', displayName: 'SMS Activate' },
];

function generateRandomOffer(service: string, country: typeof SAMPLE_COUNTRIES[0], provider: typeof SAMPLE_PROVIDERS[0]): OfferDocument {
    const price = Math.round((Math.random() * 2 + 0.05) * 100) / 100; // $0.05 - $2.05
    const stock = Math.floor(Math.random() * 5000) + 100; // 100 - 5100
    const successRate = Math.floor(Math.random() * 30) + 70; // 70% - 100%

    return {
        id: `${provider.name}_${country.code}_${sanitizeSlug(service)}`,
        serviceSlug: sanitizeSlug(service),
        serviceName: service,
        countryCode: country.code,
        countryName: country.name,
        // formatted price
        serviceIcon: `https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/${country.code.toLowerCase()}.svg`, // Just using flag as placeholder or null if prefer
        flagUrl: `https://raw.githubusercontent.com/HatScripts/circle-flags/gh-pages/flags/${country.code.toLowerCase()}.svg`,
        provider: provider.name,
        displayName: provider.displayName,
        price,
        stock,
        successRate,
        lastSyncedAt: Date.now(),
    };
}

async function main() {
    console.log("🔄 Generating sample offers data...\n");

    try {
        // Initialize indexes first
        console.log("📋 Initializing MeiliSearch indexes...");
        await initSearchIndexes();

        // Generate sample offers
        const offers: OfferDocument[] = [];

        for (const service of SAMPLE_SERVICES) {
            // Each service available in 5-10 random countries
            const numCountries = Math.floor(Math.random() * 6) + 5;
            const selectedCountries = [...SAMPLE_COUNTRIES]
                .sort(() => Math.random() - 0.5)
                .slice(0, numCountries);

            for (const country of selectedCountries) {
                // Each country has 1-4 providers
                const numProviders = Math.floor(Math.random() * 4) + 1;
                const selectedProviders = [...SAMPLE_PROVIDERS]
                    .sort(() => Math.random() - 0.5)
                    .slice(0, numProviders);

                for (const provider of selectedProviders) {
                    offers.push(generateRandomOffer(service, country, provider));
                }
            }
        }

        console.log(`\n📦 Generated ${offers.length} sample offers`);
        console.log(`   Services: ${SAMPLE_SERVICES.length}`);
        console.log(`   Countries: ${SAMPLE_COUNTRIES.length}`);
        console.log(`   Providers: ${SAMPLE_PROVIDERS.length}`);

        // Index offers
        console.log("\n⏳ Indexing offers to MeiliSearch...");
        const taskId = await indexOffers(offers);

        if (taskId) {
            console.log(`   Waiting for task ${taskId} to complete...`);
            const success = await waitForTask(taskId);
            console.log(success ? "   ✅ Offers indexed successfully!" : "   ❌ Indexing failed");
        }

        console.log("\n✅ Sample data sync complete!");
        console.log("\nTest the API:");
        console.log("  curl http://localhost:3000/api/search/services");
        console.log("  curl http://localhost:3000/api/search/countries?service=whatsapp");
        console.log("  curl http://localhost:3000/api/search/providers?service=whatsapp&country=US");

    } catch (error) {
        console.error("\n❌ Sync failed:", error);
        process.exitCode = 1;
    }
}

main();
