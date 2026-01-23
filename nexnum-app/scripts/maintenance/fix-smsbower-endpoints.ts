/**
 * Fix SMSBower endpoints to use correct URLs
 * - getServices needs full URL to alternate endpoint
 * - getCountries works on handler API
 */

import { prisma } from '../../src/lib/core/db'

async function main() {
    console.log('[FIX] Updating smsbower endpoints with correct URLs...')

    const smsbower = await prisma.provider.findFirst({
        where: { name: 'smsbower' }
    })

    if (!smsbower) {
        console.error('smsbower not found!')
        return
    }

    const endpoints = smsbower.endpoints as any
    const mappings = smsbower.mappings as any

    // Fix getServices - use the alternate REST API endpoint (full URL)
    // This is NOT the handler_api.php, it's a different endpoint
    endpoints.getServices = {
        path: 'https://smsbower.org/activations/getPricesByService?serviceId=5&withPopular=true',  // FULL URL
        method: 'GET',
        queryParams: {}  // No query params needed, they're in the path
    }

    // Fix getServices mapping to match the response format
    mappings.getServices = {
        type: 'json_array',
        rootPath: 'services',
        fields: {
            code: 'activate_org_code|slug|code',
            name: 'title|name',
            iconUrl: 'img_path'
        }
    }

    await prisma.provider.update({
        where: { id: smsbower.id },
        data: {
            endpoints: endpoints,
            mappings: mappings
        }
    })

    console.log('[AFTER] getServices endpoint:', JSON.stringify(endpoints.getServices, null, 2))
    console.log('[AFTER] getServices mapping:', JSON.stringify(mappings.getServices, null, 2))
    console.log('[FIX] Done!')
}

main().catch(console.error).finally(() => prisma.$disconnect())
