/**
 * Debug Script - Trace getServices flow for SMSBower
 */

import { prisma } from '../../src/lib/core/db'
import { DynamicProvider } from '../../src/lib/providers/dynamic-provider'

async function main() {
    console.log('='.repeat(60))
    console.log('DEBUG: SMSBower getServices Flow')
    console.log('='.repeat(60))

    const smsbower = await prisma.provider.findFirst({
        where: { name: 'smsbower' }
    })

    if (!smsbower) {
        console.error('SMSBower not found!')
        return
    }

    // Manually check shouldUseDynamic logic
    const dynamicFunctions = smsbower.dynamicFunctions as Record<string, boolean> | null
    const useDynamicMetadata = smsbower.useDynamicMetadata

    console.log('\n[DYNAMIC CHECK]')
    console.log('dynamicFunctions:', JSON.stringify(dynamicFunctions))
    console.log('useDynamicMetadata:', useDynamicMetadata)
    console.log('dynamicFunctions.getServices:', dynamicFunctions?.getServices)

    // Should be TRUE based on config
    const shouldUseDynamic =
        (dynamicFunctions?.getServices === true) ||
        (useDynamicMetadata === true && ['getCountries', 'getServices'].includes('getServices'))
    console.log('\n=> shouldUseDynamic("getServices"):', shouldUseDynamic)

    // Create engine and make raw request
    const engine = new DynamicProvider(smsbower)

    console.log('\n[RAW REQUEST TEST]')
    console.log('Calling engine.request("getServices", {})...')

    try {
        // @ts-ignore - accessing private method for debug
        const response = await engine.request('getServices', {})
        console.log('\n[RESPONSE TYPE]:', typeof response, response?.type)
        console.log('[RESPONSE DATA]:', JSON.stringify(response?.data, null, 2)?.slice(0, 3000))
    } catch (e: any) {
        console.error('[REQUEST ERROR]:', e.message)
        // @ts-ignore
        console.log('[TRACE]:', JSON.stringify(engine.lastRequestTrace, null, 2))
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
