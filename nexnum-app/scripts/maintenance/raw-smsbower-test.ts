/**
 * Raw API Test for SMSBower
 * Tests getServices endpoint directly to see actual response format
 */

import { prisma } from '../../src/lib/core/db'
import { DynamicProvider } from '../../src/lib/providers/dynamic-provider'

async function main() {
    console.log('='.repeat(60))
    console.log('RAW API TEST - SMSBower getServices')
    console.log('='.repeat(60))

    const smsbower = await prisma.provider.findFirst({
        where: { name: 'smsbower' }
    })

    if (!smsbower) {
        console.error('SMSBower not found in DB!')
        return
    }

    console.log('\n[CONFIG]')
    console.log('useDynamicMetadata:', smsbower.useDynamicMetadata)
    console.log('dynamicFunctions:', JSON.stringify(smsbower.dynamicFunctions))

    const endpoints = smsbower.endpoints as any
    console.log('\n[ENDPOINT - getServices]')
    console.log(JSON.stringify(endpoints.getServices, null, 2))

    const mappings = smsbower.mappings as any
    console.log('\n[MAPPING - getServices]')
    console.log(JSON.stringify(mappings.getServices, null, 2))

    // Create dynamic provider and test
    const engine = new DynamicProvider(smsbower)

    console.log('\n[TEST] Calling getServices("us")...')
    try {
        const result = await engine.getServices('us')
        console.log('\n[RESULT] Count:', result.length)
        console.log('[RESULT] First 3:', JSON.stringify(result.slice(0, 3), null, 2))

        // Check raw response
        console.log('\n[RAW RESPONSE]')
        console.log(JSON.stringify(engine.lastRawResponse, null, 2).slice(0, 2000))
    } catch (e: any) {
        console.error('[ERROR]', e.message)
        console.log('\n[TRACE]', JSON.stringify(engine.lastRequestTrace, null, 2))
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
