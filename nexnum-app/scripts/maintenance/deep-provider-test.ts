/**
 * Deep Provider Testing Script
 * Tests GrizzlySMS and SMSBower for all core functions
 */

import { prisma } from '../../src/lib/core/db'
import { DynamicProvider } from '../../src/lib/providers/dynamic-provider'
import { GrizzlySmsProvider } from '../../src/lib/sms-providers/grizzlysms'
import { SmsBowerProvider } from '../../src/lib/sms-providers/smsbower'

interface TestResult {
    provider: string
    function: string
    mode: 'dynamic' | 'legacy'
    success: boolean
    count?: number
    sample?: any
    error?: string
    durationMs: number
}

const results: TestResult[] = []

async function testDynamic(providerName: string, fnName: string, fn: () => Promise<any>) {
    const start = Date.now()
    try {
        const data = await fn()
        const count = Array.isArray(data) ? data.length : (typeof data === 'object' ? 1 : 0)
        results.push({
            provider: providerName,
            function: fnName,
            mode: 'dynamic',
            success: true,
            count,
            sample: Array.isArray(data) ? data.slice(0, 2) : data,
            durationMs: Date.now() - start
        })
    } catch (e: any) {
        results.push({
            provider: providerName,
            function: fnName,
            mode: 'dynamic',
            success: false,
            error: e.message,
            durationMs: Date.now() - start
        })
    }
}

async function testLegacy(providerName: string, fnName: string, fn: () => Promise<any>) {
    const start = Date.now()
    try {
        const data = await fn()
        const count = Array.isArray(data) ? data.length : (typeof data === 'object' ? 1 : 0)
        results.push({
            provider: providerName,
            function: fnName,
            mode: 'legacy',
            success: true,
            count,
            sample: Array.isArray(data) ? data.slice(0, 2) : data,
            durationMs: Date.now() - start
        })
    } catch (e: any) {
        results.push({
            provider: providerName,
            function: fnName,
            mode: 'legacy',
            success: false,
            error: e.message,
            durationMs: Date.now() - start
        })
    }
}

async function main() {
    console.log('='.repeat(60))
    console.log('DEEP PROVIDER TESTING - GrizzlySMS & SMSBower')
    console.log('='.repeat(60))

    // Load provider configs from DB
    const providers = await prisma.provider.findMany({
        where: { name: { in: ['grizzlysms', 'smsbower'] } }
    })

    console.log(`\nFound ${providers.length} providers in DB`)
    for (const p of providers) {
        console.log(`  - ${p.name}: useDynamicMetadata=${p.useDynamicMetadata}`)
    }

    // Initialize legacy adapters
    const grizzlyLegacy = new GrizzlySmsProvider()
    const smsbowerLegacy = new SmsBowerProvider()

    // Initialize dynamic engines
    const grizzlyConfig = providers.find(p => p.name === 'grizzlysms')
    const smsbowerConfig = providers.find(p => p.name === 'smsbower')

    let grizzlyDynamic: DynamicProvider | null = null
    let smsbowerDynamic: DynamicProvider | null = null

    if (grizzlyConfig) grizzlyDynamic = new DynamicProvider(grizzlyConfig)
    if (smsbowerConfig) smsbowerDynamic = new DynamicProvider(smsbowerConfig)

    console.log('\n--- GRIZZLYSMS TESTS ---')

    // GrizzlySMS Legacy Tests
    await testLegacy('grizzlysms', 'getCountries', () => grizzlyLegacy.getCountries())
    await testLegacy('grizzlysms', 'getServices', () => grizzlyLegacy.getServices('us'))

    // GrizzlySMS Dynamic Tests
    if (grizzlyDynamic) {
        await testDynamic('grizzlysms', 'getCountries', () => grizzlyDynamic!.getCountries())
        await testDynamic('grizzlysms', 'getServices', () => grizzlyDynamic!.getServices('us'))
        await testDynamic('grizzlysms', 'getPrices', () => grizzlyDynamic!.getPrices('us', 'wa'))
        await testDynamic('grizzlysms', 'getBalance', () => grizzlyDynamic!.getBalance())
    } else {
        console.log('  [SKIP] No grizzlysms config in DB')
    }

    console.log('\n--- SMSBOWER TESTS ---')

    // SMSBower Legacy Tests
    await testLegacy('smsbower', 'getCountries', () => smsbowerLegacy.getCountries())
    await testLegacy('smsbower', 'getServices', () => smsbowerLegacy.getServices('us'))

    // SMSBower Dynamic Tests
    if (smsbowerDynamic) {
        await testDynamic('smsbower', 'getCountries', () => smsbowerDynamic!.getCountries())
        await testDynamic('smsbower', 'getServices', () => smsbowerDynamic!.getServices('us'))
        await testDynamic('smsbower', 'getPrices', () => smsbowerDynamic!.getPrices('us', 'wa'))
        await testDynamic('smsbower', 'getBalance', () => smsbowerDynamic!.getBalance())
    } else {
        console.log('  [SKIP] No smsbower config in DB')
    }

    // Print Results
    console.log('\n' + '='.repeat(60))
    console.log('RESULTS SUMMARY')
    console.log('='.repeat(60))

    const passed = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`)

    for (const r of results) {
        const status = r.success ? '✅' : '❌'
        const countInfo = r.count !== undefined ? `(${r.count} items)` : ''
        console.log(`${status} ${r.provider.padEnd(12)} | ${r.mode.padEnd(8)} | ${r.function.padEnd(15)} | ${r.durationMs}ms ${countInfo}`)
        if (!r.success) {
            console.log(`   └─ Error: ${r.error}`)
        }
    }

    // Print sample data for debugging
    console.log('\n' + '='.repeat(60))
    console.log('SAMPLE DATA')
    console.log('='.repeat(60))
    for (const r of results.filter(r => r.success && r.sample)) {
        console.log(`\n[${r.provider}] ${r.function} (${r.mode}):`)
        console.log(JSON.stringify(r.sample, null, 2))
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
