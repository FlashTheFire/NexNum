// Types synchronized with schema
import { prisma } from '@/lib/db'
import { smsProvider } from '@/lib/sms-providers/index'
import { logger } from '@/lib/logger'
import { getServiceIconUrlByName } from '@/lib/search'
import { getCountryFlagUrl } from '@/lib/country-flags'
import { WalletService } from '@/lib/wallet'

/**
 * Advanced Sync Engine for User Numbers
 * Keeps local DB aligned with external SMS Provider state.
 */
export async function syncUserNumbers(userId: string, options: { force?: boolean, numberIds?: string[] } = {}) {
    const { force, numberIds } = options

    // 1. Threshold for stale data (e.g., 30 seconds)
    const staleThreshold = new Date(Date.now() - 30 * 1000)

    // 2. Find active numbers that need a sync
    // We use a fail-safe query here to handle stale Prisma clients in dev server memory
    let activeNumbers: any[] = []
    const where: any = {
        ownerId: userId,
        status: { in: ['active', 'received'] }
    }

    if (numberIds && numberIds.length > 0) {
        where.id = { in: numberIds }
    }

    try {
        // High-precision sync (using updatedAt)
        activeNumbers = await prisma.number.findMany({
            where: {
                ...where,
                OR: force ? undefined : [
                    { updatedAt: { lt: staleThreshold } },
                    { updatedAt: null },
                    { expiresAt: { lt: new Date() } }
                ]
            }
        })
    } catch (e) {
        // Fallback sync (Legacy client detected, use createdAt)
        logger.warn(`[SYNC] Stale Prisma client detected, falling back to createdAt for sync query`)
        activeNumbers = await prisma.number.findMany({
            where: {
                ...where,
                OR: force ? undefined : [
                    { createdAt: { lt: staleThreshold } },
                    { expiresAt: { lt: new Date() } }
                ]
            }
        })
    }

    if (activeNumbers.length === 0) {
        // Even if no active numbers, check if any should be marked as expired locally
        await prisma.number.updateMany({
            where: {
                ownerId: userId,
                status: 'active',
                expiresAt: { lt: new Date() }
            },
            data: { status: 'expired' }
        })
        return
    }

    logger.debug(`[SYNC] Refreshing ${activeNumbers.length} numbers for user ${userId}`)

    // 3. Perform PARALLEL status check (Phase 10)
    // We use Promise.all to sync multiple numbers concurrently, significantly shrinking latency
    await Promise.all(activeNumbers.map(async (num) => {
        if (!num.activationId) return

        try {
            // Check if internally expired first
            if (num.expiresAt && new Date() > num.expiresAt) {
                // Perform Refund if no messages
                const msgCount = await prisma.smsMessage.count({ where: { numberId: num.id } })

                await prisma.$transaction(async (tx) => {
                    await tx.number.update({
                        where: { id: num.id },
                        data: { status: 'expired', updatedAt: new Date() }
                    })

                    if (msgCount === 0) {
                        await WalletService.refund(
                            userId,
                            Number(num.price),
                            'refund',
                            num.id,
                            `Refund: Expired ${num.serviceName} (${num.countryName})`,
                            `sync_refund_${num.id}`,
                            tx
                        )
                    }
                })
                return
            }

            const status = await smsProvider.getStatus(num.activationId)

            // B. Populate Missing Metadata (Optimization)
            const metadataToUpdate: any = {}
            if (!num.serviceIconUrl && num.serviceName) {
                metadataToUpdate.serviceIconUrl = await getServiceIconUrlByName(num.serviceName)
            }
            if (!num.countryIconUrl && num.countryName) {
                metadataToUpdate.countryIconUrl = await getCountryFlagUrl(num.countryName)
            }

            // A. Update Number Status & Timestamp
            if (status.status === 'expired' || status.status === 'cancelled') {
                const msgCount = (status.messages?.length || 0) || (await prisma.smsMessage.count({ where: { numberId: num.id } }))

                await prisma.$transaction(async (tx) => {
                    await tx.number.update({
                        where: { id: num.id },
                        data: {
                            status: status.status,
                            updatedAt: new Date(),
                            ...metadataToUpdate
                        }
                    })

                    if (msgCount === 0) {
                        await WalletService.refund(
                            userId,
                            Number(num.price),
                            'refund',
                            num.id,
                            `Refund: ${status.status} ${num.serviceName}`,
                            `sync_status_refund_${num.id}`,
                            tx
                        )
                    }
                })
            } else {
                await prisma.number.update({
                    where: { id: num.id },
                    data: {
                        status: status.status,
                        updatedAt: new Date(),
                        ...metadataToUpdate
                    }
                })
            }

            // C. Sync Individual Messages
            if (status.messages && status.messages.length > 0) {
                const existingMsgIds = new Set(
                    (await prisma.smsMessage.findMany({
                        where: { numberId: num.id },
                        select: { id: true }
                    })).map(m => m.id)
                )

                const newMessages = status.messages.filter(m => !existingMsgIds.has(m.id))
                if (newMessages.length > 0) {
                    await prisma.smsMessage.createMany({
                        data: newMessages.map(m => ({
                            id: m.id,
                            numberId: num.id,
                            sender: m.sender || 'Unknown',
                            content: m.content || '',
                            code: m.code,
                            receivedAt: m.receivedAt
                        }))
                    })
                    logger.info(`[SYNC] Ingested ${newMessages.length} new messages for ${num.phoneNumber}`)
                }
            }
        } catch (error) {
            logger.warn(`[SYNC] Failed to sync ${num.phoneNumber}: ${error instanceof Error ? error.message : 'Unknown Error'}`)
        }
    }))
}
