
import { prisma } from '@/lib/core/db'
import { smsProvider } from '@/lib/sms-providers/index'
import { NotificationFactory } from '@/lib/notifications/notification-service'
import { logger } from '@/lib/core/logger'

interface ProcessResult {
    processed: number
    activeNumbers: number
    newMessages: number
    errors: number
}

/**
 * Inbox Worker
 * Polls active numbers for new SMS messages from providers.
 * Designed to be run frequently (e.g., every 5-10s) via Cron.
 */
export async function processInboxBatch(batchSize = 50): Promise<ProcessResult> {
    const result: ProcessResult = { processed: 0, activeNumbers: 0, newMessages: 0, errors: 0 }

    // 1. Fetch active numbers
    // We also check 'received' status as they might get more messages? 
    // Usually 'active' is the main state. 'received' is just a UI state, logically still active until timeout/expiry.
    const activeNumbers = await prisma.number.findMany({
        where: {
            status: { in: ['active', 'received'] },
            activationId: { not: null },
            expiresAt: { gt: new Date() },
            OR: [
                { nextPollAt: null },
                { nextPollAt: { lte: new Date() } }
            ]
        },
        orderBy: { createdAt: 'desc' }, // Poll newest first? Or oldest? Newest likely to get SMS.
        take: batchSize
    })

    if (activeNumbers.length === 0) {
        return result
    }

    result.activeNumbers = activeNumbers.length
    logger.debug(`Polling ${activeNumbers.length} active numbers`)

    // 2. Poll concurrently (limited concurrency could be added if batch is huge, but 50 is fine for Promise.all)
    const pollPromises = activeNumbers.map(async (number) => {
        result.processed++
        try {
            if (!number.activationId) return

            // Call Provider API
            const providerStatus = await smsProvider.getStatus(number.activationId)

            // 3. Process new messages
            // Check what we already have
            const existingMsgIds = new Set(
                (await prisma.smsMessage.findMany({
                    where: { numberId: number.id },
                    select: { id: true }
                })).map(m => m.id)
            )

            const newMessages = providerStatus.messages.filter(m => !existingMsgIds.has(m.id))

            if (newMessages.length > 0) {
                // Insert new messages
                await prisma.smsMessage.createMany({
                    data: newMessages.map(m => ({
                        id: m.id,
                        numberId: number.id,
                        sender: m.sender,
                        content: m.content,
                        code: m.code,
                        receivedAt: m.receivedAt,
                    }))
                })

                result.newMessages += newMessages.length

                // Update status if changed to 'received'
                // Only if it wasn't already 'received' or 'completed'
                if (providerStatus.status === 'received' && number.status !== 'received') {
                    await prisma.$transaction(async (tx) => {
                        await tx.number.update({
                            where: { id: number.id },
                            data: { status: 'received' }
                        })

                        // CRITICAL: Sync Activation state to RECEIVED to prevent erroneous cleanup/refunds
                        if (number.activationId) {
                            await tx.activation.updateMany({
                                where: {
                                    providerActivationId: number.activationId,
                                    state: { notIn: ['RECEIVED', 'REFUNDED'] }
                                },
                                data: { state: 'RECEIVED' }
                            })
                        }
                    })
                }

                // Trigger Notification
                const firstNewMsg = newMessages[0]
                // Find owner to notify
                if (number.ownerId) {
                    // We don't await this to avoid blocking the batch? 
                    // Safe to await as NotificationFactory enqueues job (fast).
                    await NotificationFactory.smsReceived(
                        number.ownerId,
                        number.phoneNumber,
                        firstNewMsg.code || undefined,
                        number.serviceName || undefined
                    )
                }

                logger.info(`New SMS for ${number.phoneNumber} (${newMessages.length})`)
            }

            // Sync status if expired or cancelled on provider side?
            // If provider says 'cancelled' or 'timeout', we should reflect that?
            // Providers usually return STATUS_CANCELLED or STATUS_WAIT_CODE.
            // If we are 'active' but provider says something else key... 
            // For now, only 'received' is critical.

            // 4. Update nextPollAt and pollCount for rotation
            const pollCount = (number.pollCount || 0) + 1
            const ageSec = (Date.now() - number.createdAt.getTime()) / 1000

            let backoffSec = 10
            const cycle = (pollCount - 1) % 3

            if (ageSec < 300) { // Fast Tier: 0-5m
                backoffSec = [2, 4, 6][cycle]
            } else if (ageSec < 600) { // Mid Tier: 5-10m
                backoffSec = [4, 6, 8][cycle]
            } else if (ageSec < 900) { // Deep Tier: 10-15m
                backoffSec = [6, 8, 10][cycle]
            } else if (ageSec < 1200) { // Final Tier: 15-20m
                backoffSec = [8, 10, 12][cycle]
            } else { // Maintenance Tier: 20m+
                backoffSec = 15
            }

            const jitter = Math.random() * 500 // 500ms jitter to spread load
            const nextPollAt = new Date(Date.now() + (backoffSec * 1000) + jitter)

            await prisma.number.update({
                where: { id: number.id },
                data: {
                    pollCount,
                    nextPollAt,
                    updatedAt: new Date()
                }
            })

        } catch (error: any) {
            // Check for Terminal Provider States (Business Lifecycle Terminal States)
            // These mean the provider has cleaned up the order or it has expired/cancelled.
            // Using centralized DynamicProvider categorization for a professional, universal approach.
            if (error.isLifecycleTerminal) {
                const messageCount = await prisma.smsMessage.count({
                    where: { numberId: number.id }
                })

                // Uniform Logic: If we got at least one message, mark as COMPLETED.
                // Otherwise, mark as EXPIRED (timeout/cleanup with no result).
                const terminalStatus = messageCount > 0 ? 'completed' : 'expired'
                const activationState = messageCount > 0 ? 'RECEIVED' : 'EXPIRED'

                logger.info(`Terminal state reached for ${number.phoneNumber}: ${terminalStatus.toUpperCase()} (${error.errorType})`)

                await prisma.$transaction(async (tx) => {
                    await tx.number.update({
                        where: { id: number.id },
                        data: {
                            status: terminalStatus,
                            updatedAt: new Date()
                        }
                    })
                    // SYNC: Update Activation state to match Number
                    if (number.activationId) {
                        await tx.activation.update({
                            where: { id: number.activationId },
                            data: { state: activationState }
                        })
                    }
                })
                return // Exit early, no more polling for this number
            }

            result.errors++
            logger.warn(`Failed to poll ${number.id}: ${error.message}`)

            // Still update nextPollAt on error to avoid immediate retry loop
            await prisma.number.update({
                where: { id: number.id },
                data: { nextPollAt: new Date(Date.now() + 10000) } // 10s wait after error
            }).catch(() => { })
        }
    })

    await Promise.all(pollPromises)

    return result
}
