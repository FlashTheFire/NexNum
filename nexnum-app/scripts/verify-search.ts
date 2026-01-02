import { config } from "dotenv";
config({ path: '.env' });

async function main() {
    const { meili, INDEXES, getIndexStats, searchServices, searchCountries, searchProviders } = await import("../src/lib/search");

    console.log("=== MeiliSearch Verification ===\n");

    // Check index stats
    const stats = await getIndexStats();
    console.log("📊 Offers Index Stats:", stats);

    // Test searchServices
    console.log("\n📦 Testing searchServices():");
    const servicesResult = await searchServices('', { limit: 5 });
    console.log(`   Found ${servicesResult.total} services`);
    if (servicesResult.services.length > 0) {
        console.log("   Sample:", servicesResult.services.slice(0, 3).map(s =>
            `${s.name}: $${s.lowestPrice}, ${s.totalStock} stock, ${s.serverCount} servers`
        ));
    }

    // Test searchCountries (if we have data)
    if (servicesResult.services.length > 0) {
        const firstService = servicesResult.services[0].slug;
        console.log(`\n🌍 Testing searchCountries(${firstService}):`);
        const countriesResult = await searchCountries(firstService, '', { limit: 5 });
        console.log(`   Found ${countriesResult.total} countries`);
        if (countriesResult.countries.length > 0) {
            console.log("   Sample:", countriesResult.countries.slice(0, 3).map(c =>
                `${c.name}: $${c.lowestPrice}, ${c.totalStock} stock`
            ));

            // Test searchProviders
            const firstCountry = countriesResult.countries[0].code;
            console.log(`\n🏢 Testing searchProviders(${firstService}, ${firstCountry}):`);
            const providersResult = await searchProviders(firstService, firstCountry, { limit: 5 });
            console.log(`   Found ${providersResult.total} providers`);
            if (providersResult.providers.length > 0) {
                console.log("   Sample:", providersResult.providers.map(p =>
                    `${p.displayName}: $${p.price}, ${p.stock} stock`
                ));
            }
        }
    }

    console.log("\n✅ Verification complete!");
}

main().catch(console.error);
