import 'dotenv/config'
import { getServiceAggregates } from '../lib/search/service-aggregates'
import { searchCountries, searchProviders, getOfferForPurchase } from '../lib/search/search'
import { prisma } from '../lib/core/db'

async function runDeepSearchPipelineTest() {
    console.log('================================================================');
    console.log('🧪 DEEP SEARCH PIPELINE TEST SUITE: STEPS 1 → 2 → 3');
    console.log('================================================================\n');

    let passedCount = 0;
    let failedCount = 0;

    function assert(condition: boolean, testName: string, details?: any) {
        if (condition) {
            console.log(`  ✅ [PASS] ${testName}`);
            if (details) console.log(`     └─ Details:`, JSON.stringify(details));
            passedCount++;
        } else {
            console.error(`  ❌ [FAIL] ${testName}`);
            if (details) console.error(`     └─ Failed Context:`, details);
            failedCount++;
        }
    }

    // ================================================================
    // STEP 1: SERVICE SEARCH & AGGREGATES
    // ================================================================
    console.log('----------------------------------------------------------------');
    console.log('📌 STEP 1: Service Search & Catalog Aggregates');
    console.log('----------------------------------------------------------------');

    // 1.1 Default Service List (No query)
    try {
        const step1Default = await getServiceAggregates({ page: 1, limit: 10, sortBy: 'stock' })
        assert(step1Default.total > 0 && step1Default.items.length > 0, 'Step 1.1: Fetch default service catalog list', {
            totalServices: step1Default.total,
            topService: step1Default.items[0]?.serviceName,
            stock: step1Default.items[0]?.totalStock
        })
    } catch (e: any) {
        assert(false, 'Step 1.1: Fetch default service catalog list', { error: e.message })
    }

    // 1.2 Exact Name Search: "Telegram"
    try {
        const step1Tg = await getServiceAggregates({ query: 'telegram', page: 1, limit: 10 })
        const match = step1Tg.items.find(i => i.serviceName.toLowerCase().includes('telegram'))
        assert(Boolean(match), 'Step 1.2: Search service by name ("telegram")', {
            foundCount: step1Tg.total,
            matchedName: match?.serviceName,
            stock: match?.totalStock,
            lowestPrice: match?.lowestPrice
        })
    } catch (e: any) {
        assert(false, 'Step 1.2: Search service by name ("telegram")', { error: e.message })
    }

    // 1.3 Provider Code Search: "tg"
    try {
        const step1TgCode = await getServiceAggregates({ query: 'tg', page: 1, limit: 10 })
        const match = step1TgCode.items.find(i => i.serviceCode.toLowerCase() === 'telegram' || i.serviceName.toLowerCase().includes('telegram'))
        assert(Boolean(match), 'Step 1.3: Search service by provider code ("tg")', {
            foundCount: step1TgCode.total,
            matchedName: match?.serviceName
        })
    } catch (e: any) {
        assert(false, 'Step 1.3: Search service by provider code ("tg")', { error: e.message })
    }

    // 1.4 Short Code Search: "wa" (WhatsApp)
    try {
        const step1Wa = await getServiceAggregates({ query: 'wa', page: 1, limit: 10 })
        const match = step1Wa.items.find(i => i.serviceName.toLowerCase().includes('whatsapp'))
        assert(Boolean(match), 'Step 1.4: Search service by short code ("wa")', {
            foundCount: step1Wa.total,
            matchedName: match?.serviceName
        })
    } catch (e: any) {
        assert(false, 'Step 1.4: Search service by short code ("wa")', { error: e.message })
    }

    // ================================================================
    // STEP 2: COUNTRY SEARCH PER SERVICE
    // ================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('📌 STEP 2: Country Search & Pricing for Selected Service');
    console.log('----------------------------------------------------------------');

    // 2.1 Fetch All Countries for Telegram
    try {
        const step2AllCty = await searchCountries('Telegram', '', { page: 1, limit: 10, sort: 'price_asc' })
        assert(step2AllCty.total > 0 && step2AllCty.countries.length > 0, 'Step 2.1: Fetch countries for "Telegram"', {
            totalCountries: step2AllCty.total,
            cheapestCountry: step2AllCty.countries[0]?.name,
            lowestPrice: step2AllCty.countries[0]?.lowestPrice,
            stock: step2AllCty.countries[0]?.totalStock
        })
    } catch (e: any) {
        assert(false, 'Step 2.1: Fetch countries for "Telegram"', { error: e.message })
    }

    // 2.2 Filter Country by Query: "india"
    try {
        const step2India = await searchCountries('Telegram', 'india', { page: 1, limit: 10 })
        const match = step2India.countries.find(c => c.name.toLowerCase().includes('india'))
        assert(Boolean(match), 'Step 2.2: Filter country by query ("india" for Telegram)', {
            matchedCountry: match?.name,
            lowestPrice: match?.lowestPrice,
            stock: match?.totalStock
        })
    } catch (e: any) {
        assert(false, 'Step 2.2: Filter country by query ("india" for Telegram)', { error: e.message })
    }

    // 2.3 Filter Country by ISO/5sim Code: "84" (Vietnam)
    try {
        const step2Vietnam = await searchCountries('Telegram', 'vietnam', { page: 1, limit: 10 })
        const match = step2Vietnam.countries.find(c => c.name.toLowerCase().includes('vietnam') || c.code.toLowerCase() === 'vietnam')
        assert(Boolean(match), 'Step 2.3: Filter country by name ("vietnam" for Telegram)', {
            matchedCountry: match?.name,
            lowestPrice: match?.lowestPrice,
            stock: match?.totalStock
        })
    } catch (e: any) {
        assert(false, 'Step 2.3: Filter country by name ("vietnam" for Telegram)', { error: e.message })
    }

    // ================================================================
    // STEP 3: PROVIDER SELECTION & PURCHASE ROUTING
    // ================================================================
    console.log('\n----------------------------------------------------------------');
    console.log('📌 STEP 3: Provider Selection & Purchase Routing');
    console.log('----------------------------------------------------------------');

    // 3.1 Search Providers for Telegram + India
    try {
        const step3Providers = await searchProviders('Telegram', 'India', { page: 1, limit: 10, sort: 'price_asc' })
        assert(step3Providers.total > 0 && step3Providers.providers.length > 0, 'Step 3.1: Search active providers for Telegram + India', {
            totalOffers: step3Providers.total,
            topProvider: step3Providers.providers[0]?.provider,
            pointPrice: step3Providers.providers[0]?.pointPrice,
            stock: step3Providers.providers[0]?.stock
        })
    } catch (e: any) {
        assert(false, 'Step 3.1: Search active providers for Telegram + India', { error: e.message })
    }

    // 3.2 Lookup Single Offer for Purchase Routing
    try {
        const offer = await getOfferForPurchase('Telegram', 'India')
        assert(Boolean(offer && offer.provider && offer.pointPrice > 0), 'Step 3.2: Resolve single purchase offer for Telegram + India', {
            offerId: offer?.id,
            provider: offer?.provider,
            pointPrice: offer?.pointPrice,
            stock: offer?.stock,
            countryId: offer?.countryId,
            serviceId: offer?.serviceId
        })
    } catch (e: any) {
        assert(false, 'Step 3.2: Resolve single purchase offer for Telegram + India', { error: e.message })
    }

    // 3.3 Verify Inactive Provider Protection
    try {
        const activeProviders = await prisma.provider.findMany({ where: { isActive: true }, select: { name: true } })
        const activeNames = new Set(activeProviders.map(p => p.name.toLowerCase()))

        const sampleOffer = await getOfferForPurchase('Telegram', 'India')
        const isProviderActive = sampleOffer ? activeNames.has(sampleOffer.provider.toLowerCase()) : true

        assert(isProviderActive, 'Step 3.3: Verify offer provider is active in PostgreSQL DB', {
            providerName: sampleOffer?.provider,
            isActiveInDB: isProviderActive
        })
    } catch (e: any) {
        assert(false, 'Step 3.3: Verify offer provider is active in PostgreSQL DB', { error: e.message })
    }

    console.log('\n================================================================');
    console.log(`📊 TEST SUITE COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('================================================================\n');

    await prisma.$disconnect()
}

runDeepSearchPipelineTest()
