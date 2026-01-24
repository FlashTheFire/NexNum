
import { prisma } from '../../src/lib/core/db'
import { currencyService } from '../../src/lib/currency/currency-service'

async function verifySmartAuto() {
    console.log('--- VERIFYING SMART-AUTO NORMALIZATION ---')

    const providerName = 'verify_test_provider'

    // 1. Setup provider with Smart-Auto configuration
    console.log('Setting up test provider...')
    await prisma.provider.upsert({
        where: { name: providerName },
        update: {
            currency: 'RUB',
            normalizationMode: 'SMART_AUTO',
            depositSpent: 100.0,      // Spent $100
            depositReceived: 9000.0,   // Received 9000 RUB (Effective 1 USD = 90 RUB)
            priceMultiplier: 1.0,
            fixedMarkup: 0
        },
        create: {
            name: providerName,
            displayName: 'Verify Provider',
            apiBaseUrl: 'http://localhost',
            authType: 'none',
            currency: 'RUB',
            normalizationMode: 'SMART_AUTO',
            depositSpent: 100.0,
            depositReceived: 9000.0,
            priceMultiplier: 1.0,
            fixedMarkup: 0,
            endpoints: {},
            mappings: {}
        }
    })

    // 2. Normalize a price
    const rawCost = 90.0 // 90 RUB should be exactly 1 USD (POINTS)
    console.log(`Normalizing raw cost: ${rawCost} RUB...`)

    const normalizedPoints = await currencyService.normalizeProviderPrice(rawCost, providerName)
    console.log(`Normalized Result: ${normalizedPoints} POINTS`)

    const settings = await currencyService.getSettings()
    const pointsRate = Number(settings.pointsRate)
    const expectedPoints = (rawCost / (9000 / 100)) * pointsRate

    if (Math.abs(normalizedPoints - expectedPoints) < 0.1) {
        console.log('✅ SUCCESS: Smart-Auto rate correctly applied!')
    } else {
        console.error(`❌ FAILURE: Expected around ${expectedPoints}, got ${normalizedPoints}`)
    }

    // 3. Test Manual Override
    console.log('\nTesting Manual Override...')
    await prisma.provider.update({
        where: { name: providerName },
        data: {
            normalizationMode: 'MANUAL',
            normalizationRate: 95.0 // 1 USD = 95 RUB
        }
    })

    const manualPoints = await currencyService.normalizeProviderPrice(rawCost, providerName)
    console.log(`Manual Result (90 RUB at 95 rate): ${manualPoints} POINTS`)

    if (manualPoints < 1.0 && manualPoints > 0.9) {
        console.log('✅ SUCCESS: Manual override correctly applied!')
    }

    // Cleanup
    await prisma.provider.delete({ where: { name: providerName } })
}

verifySmartAuto()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
