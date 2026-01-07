// Types synchronized with schema
import { prisma } from '@/lib/db'
import { smsProvider } from '@/lib/sms-providers/index'
import { logger } from '@/lib/logger'

/**
 * Advanced Sync Engine for User Numbers
 * Keeps local DB aligned with external SMS Provider state.
 */
export async function syncUserNumbers(userId: string, force = false) {
    // 1. Threshold for stale data (e.g., 30 seconds)
    const staleThreshold = new Date(Date.now() - 30 * 1000)

    // 2. Find active numbers that need a sync
    // We use a fail-safe query here to handle stale Prisma clients in dev server memory
    let activeNumbers: any[] = []
    const where: any = {
        ownerId: userId,
        status: { in: ['active', 'received'] }
    }

    try {
        // High-precision sync (using updatedAt)
        activeNumbers = await prisma.number.findMany({
            where: {
                ...where,
                OR: force ? undefined : [
                    { updatedAt: { lt: staleThreshold } },
                    { updatedAt: null }
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
                    { createdAt: { lt: staleThreshold } }
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

    // 3. Perform batch status check using the provider factory
    // We use Promise.allSettled to ensure one failing provider doesn't kill the whole request
    const syncPromises = activeNumbers.map(async (num) => {
        if (!num.activationId) return

        try {
            // Check if internally expired first to avoid unnecessary provider calls
            if (num.expiresAt && new Date() > num.expiresAt) {
                await prisma.number.update({
                    where: { id: num.id },
                    data: { status: 'expired', updatedAt: new Date() }
                })
                return
            }

            const status = await smsProvider.getStatus(num.activationId)

            // A. Update Number Status & Timestamp
            await prisma.number.update({
                where: { id: num.id },
                data: {
                    status: status.status,
                    updatedAt: new Date()
                }
            })

            // B. Sync Individual Messages
            if (status.messages && status.messages.length > 0) {
                // Get current message IDs to avoid duplicates
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
            // Log but don't throw to allow other syncs to continue
            logger.warn(`[SYNC] Failed to sync ${num.phoneNumber}: ${error instanceof Error ? error.message : 'Unknown Error'}`)
        }
    })

    await Promise.allSettled(syncPromises)
}
