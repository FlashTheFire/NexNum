import { prisma } from '../lib/core/db'

async function restoreGrizzlySmsFromAuditLog() {
    console.log('[RESTORE] Searching for historical GrizzlySMS provider mapping in Prisma AuditLog...')

    const auditLogs = await prisma.auditLog.findMany({
        where: {
            OR: [
                { resourceId: '92567f6a-ba5d-4f8c-87ed-daf2be79e2bd' },
                { resourceType: { contains: 'provider', mode: 'insensitive' } }
            ]
        },
        orderBy: { createdAt: 'desc' },
        take: 50
    })

    let selectedMeta: any = null
    let selectedDate: string = ''

    for (const log of auditLogs) {
        const meta = log.metadata as any
        if (meta && meta.mappings && meta.mappings.getNumber && meta.mappings.getPrices) {
            selectedMeta = meta
            selectedDate = log.createdAt.toISOString()
            break
        }
    }

    if (!selectedMeta) {
        console.error('[RESTORE] Could not find rich historical AuditLog entry for GrizzlySMS!')
        process.exit(1)
    }

    console.log(`[RESTORE] Found rich AuditLog entry from ${selectedDate}`)

    const provider = await prisma.provider.findFirst({
        where: { name: { equals: 'grizzlysms', mode: 'insensitive' } }
    })

    if (!provider) {
        console.error('[RESTORE] Provider grizzlysms not found!')
        process.exit(1)
    }

    const updated = await prisma.provider.update({
        where: { id: provider.id },
        data: {
            mappings: selectedMeta.mappings,
            endpoints: selectedMeta.endpoints || provider.endpoints,
            updatedAt: new Date()
        }
    })

    console.log('[RESTORE] ✅ Successfully restored EXACT GrizzlySMS mappings & endpoints from Prisma AuditLog snapshot!')
    console.log('Restored Endpoints:', Object.keys(updated.endpoints || {}))
    console.log('Restored Mappings:', Object.keys(updated.mappings || {}))
    console.log(JSON.stringify(updated.mappings, null, 2))
}

restoreGrizzlySmsFromAuditLog()
    .then(() => {
        console.log('[RESTORE] Completed successfully.')
        process.exit(0)
    })
    .catch((err) => {
        console.error('[RESTORE] Error during restoration:', err)
        process.exit(1)
    })
