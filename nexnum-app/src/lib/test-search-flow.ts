/**
 * Test Script: Demonstrate MeiliSearch Search Flow with REAL DATA
 */

import { searchServices, searchCountries, searchProviders, getIndexStats } from './search'

async function demonstrateSearchFlow() {
    console.log('='.repeat(80))
    console.log('🔍 MEILISEARCH SEARCH FLOW - REAL DATA DEMONSTRATION')
    console.log('='.repeat(80))

    // Get index stats first
    const stats = await getIndexStats()
    console.log(`\n📊 Index Stats: ${stats.offers} total offers in MeiliSearch\n`)

    // ============================================
    // STEP 1: Search Services (User types "telegram")
    // ============================================
    console.log('─'.repeat(80))
    console.log('STEP 1: searchServices("telegram")')
    console.log('─'.repeat(80))
    console.log('→ User types "telegram" in the search bar\n')

    const servicesResult = await searchServices('telegram', { limit: 5 })

    console.log(`Found ${servicesResult.total} matching services:\n`)
    servicesResult.services.forEach((svc, i) => {
        console.log(`  ${i + 1}. ${svc.name}`)
        console.log(`     ├─ Slug: ${svc.slug}`)
        console.log(`     ├─ Lowest Price: $${svc.lowestPrice.toFixed(2)}`)
        console.log(`     ├─ Total Stock: ${svc.totalStock.toLocaleString()}`)
        console.log(`     ├─ Available in ${svc.countryCount} countries`)
        console.log(`     └─ From ${svc.serverCount} providers\n`)
    })

    // Pick the first service for next step
    const selectedService = servicesResult.services[0]
    if (!selectedService) {
        console.log('❌ No services found. Run a sync first!')
        return
    }

    // ============================================
    // STEP 2: Search Countries for selected service
    // ============================================
    console.log('─'.repeat(80))
    console.log(`STEP 2: searchCountries("${selectedService.slug}")`)
    console.log('─'.repeat(80))
    console.log(`→ User selects "${selectedService.name}", showing available countries\n`)

    const countriesResult = await searchCountries(selectedService.slug, '', { limit: 10, sort: 'price' })

    console.log(`Found ${countriesResult.total} countries with ${selectedService.name}:\n`)
    console.log('  Rank | Country          | Price   | Stock    | Providers')
    console.log('  ─────┼──────────────────┼─────────┼──────────┼──────────')
    countriesResult.countries.forEach((country, i) => {
        const name = country.name.padEnd(16).slice(0, 16)
        const price = `$${country.lowestPrice.toFixed(2)}`.padEnd(7)
        const stock = country.totalStock.toLocaleString().padStart(8)
        console.log(`  ${String(i + 1).padStart(4)} | ${name} | ${price} | ${stock} | ${country.serverCount}`)
    })
    console.log()

    // Pick the first country for next step
    const selectedCountry = countriesResult.countries[0]
    if (!selectedCountry) {
        console.log('❌ No countries found!')
        return
    }

    // ============================================
    // STEP 3: Get Providers for service + country
    // ============================================
    console.log('─'.repeat(80))
    console.log(`STEP 3: searchProviders("${selectedService.slug}", "${selectedCountry.code}")`)
    console.log('─'.repeat(80))
    console.log(`→ User selects "${selectedCountry.name}", showing provider options\n`)

    const providersResult = await searchProviders(selectedService.slug, selectedCountry.code, { limit: 10 })

    console.log(`Found ${providersResult.total} provider offers:\n`)
    console.log('  Provider      | Price   | Stock    ')
    console.log('  ──────────────┼─────────┼──────────')
    providersResult.providers.forEach(offer => {
        const provider = offer.provider.padEnd(13)
        const price = `$${offer.price.toFixed(2)}`.padEnd(7)
        const stock = String(offer.stock).padStart(8)
        console.log(`  ${provider} | ${price} | ${stock}`)
    })

    console.log('\n' + '='.repeat(80))
    console.log('✅ FLOW COMPLETE: User can now click "Buy" on any provider!')
    console.log('='.repeat(80))

    // ============================================
    // BONUS: Show raw document structure
    // ============================================
    if (providersResult.providers.length > 0) {
        console.log('\n📦 BONUS: Raw OfferDocument structure (what MeiliSearch stores):')
        console.log(JSON.stringify(providersResult.providers[0], null, 2))
    }
}

demonstrateSearchFlow().catch(console.error)
