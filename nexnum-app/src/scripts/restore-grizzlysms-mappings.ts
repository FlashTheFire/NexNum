import { prisma } from '../lib/core/db'
import providersTemplate from '../config/templates/providers.json'

async function restoreGrizzlySmsMapping() {
    console.log('[RESTORE] Fetching GrizzlySMS template from providers.json...')
    
    const template = (providersTemplate as any)['grizzlysms']
    if (!template) {
        throw new Error('GrizzlySMS template not found in providers.json')
    }

    const templateMappings = template.mappings
    const templateEndpoints = template.endpoints

    console.log('[RESTORE] Searching for GrizzlySMS provider in database...')
    const provider = await prisma.provider.findFirst({
        where: {
            name: { equals: 'grizzlysms', mode: 'insensitive' }
        }
    })

    if (!provider) {
        console.error('[RESTORE] GrizzlySMS provider not found in database!')
        process.exit(1)
    }

    console.log(`[RESTORE] Found provider: ${provider.name} (ID: ${provider.id})`)
    
    // Preserve staticCatalog if existing, merge template mappings
    const currentMappings = (provider.mappings as any) || {}
    const updatedMappings = {
        ...currentMappings,
        ...templateMappings
    }

    const updatedProvider = await prisma.provider.update({
        where: { id: provider.id },
        data: {
            mappings: updatedMappings,
            endpoints: templateEndpoints || provider.endpoints,
            updatedAt: new Date()
        }
    })

    console.log('[RESTORE] ✅ Successfully restored GrizzlySMS mappings!')
    console.log('[RESTORE] Restored Mappings:')
    console.log(JSON.stringify(updatedProvider.mappings, null, 2))
}

restoreGrizzlySmsMapping()
    .then(() => {
        console.log('[RESTORE] Complete.')
        process.exit(0)
    })
    .catch((err) => {
        console.error('[RESTORE] Failed:', err)
        process.exit(1)
    })
