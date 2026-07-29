/**
 * High-Speed Tier 1 Active Order Poller
 * 
 * Runs high-frequency provider batch status checks (every 3 seconds) for Tier 1 active numbers.
 * Uses zero-DB Redis active stream for near-instant execution and sub-3s OTP delivery.
 */

import { ActiveOrderStream, ActiveOrderData } from '@/lib/activation/active-order-stream'
import { BatchPollManager, BatchPollItem, BatchPollResult } from '@/lib/activation/batch-poll-manager'
import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'

export interface ActivePollerSummary {
    totalActive: number
    polledCount: number
    messagesReceived: number
    errors: string[]
}

/**
 * Executes a single high-speed active poller tick
 */
export async function runActivePollerTick(): Promise<ActivePollerSummary> {
    const startTime = Date.now()
    const summary: ActivePollerSummary = {
        totalActive: 0,
        polledCount: 0,
        messagesReceived: 0,
        errors: []
    }

    try {
        // 1. Fetch active numbers from Redis stream (<1ms)
        const activeOrders = await ActiveOrderStream.getActiveOrders()
        summary.totalActive = activeOrders.length

        if (activeOrders.length === 0) {
            return summary
        }

        const now = Date.now()

        // 2. Filter Tier 1 (Rush Window: age <= 120 seconds or initial attempts)
        const tier1Orders = activeOrders.filter(order => {
            const ageSeconds = (now - (order.createdAt || now)) / 1000
            return ageSeconds <= 120
        })

        if (tier1Orders.length === 0) {
            return summary
        }

        // 3. Prepare BatchPollItems
        const batchItems: BatchPollItem[] = tier1Orders.map(order => ({
            numberId: order.numberId,
            activationId: order.activationId,
            userId: order.userId,
            providerId: order.provider,
            providerName: order.provider
        }))

        summary.polledCount = batchItems.length

        // 4. Execute Provider-Grouped Batch Polling
        const results: BatchPollResult[] = await BatchPollManager.pollBatch(batchItems)

        // 5. Process Results (Message insertion, Real-Time Pub/Sub Broadcast, Stream Cleanup)
        for (const res of results) {
            if (res.error) {
                summary.errors.push(`Activation #${res.activationId}: ${res.error}`)
                continue
            }

            if (res.messages && res.messages.length > 0) {
                summary.messagesReceived += res.messages.length

                for (const msg of res.messages) {
                    try {
                        // DB insertion
                        await prisma.smsMessage.create({
                            data: {
                                numberId: res.numberId,
                                sender: msg.code ? 'Verification Service' : 'SMS System',
                                content: msg.content || msg.text || (msg.code ? `Your verification code is: ${msg.code}` : 'Message received'),
                                code: msg.code || null,
                                receivedAt: new Date()
                            }
                        })

                        // Real-Time Redis Pub/Sub Broadcast (<100ms UI update)
                        const pubSubPayload = JSON.stringify({
                            event: 'sms.received',
                            numberId: res.numberId,
                            activationId: res.activationId,
                            code: msg.code,
                            content: msg.content || msg.text,
                            receivedAt: new Date().toISOString()
                        })
                        await redis.publish('sms:received', pubSubPayload)

                        logger.success(`[ActivePoller] INSTANT OTP RECEIVED for Activation #${res.activationId}: Code ${msg.code}`, {
                            context: 'ACTIVE_POLLER',
                            activationId: res.activationId,
                            code: msg.code
                        })
                    } catch (dbErr: any) {
                        logger.error(`[ActivePoller] Error saving message for #${res.activationId}`, {
                            context: 'ACTIVE_POLLER',
                            error: dbErr.message
                        })
                    }
                }

                // Remove from active stream so we don't re-poll completed number
                await ActiveOrderStream.removeActiveOrder(res.activationId)
            } else if (['COMPLETED', 'CANCELLED', 'EXPIRED', 'REFUNDED'].includes(res.status)) {
                // Terminal state clean up
                await ActiveOrderStream.removeActiveOrder(res.activationId)
            }
        }

        const duration = Date.now() - startTime
        if (summary.messagesReceived > 0 || summary.polledCount > 0) {
            logger.debug(`[ActivePoller] Tick completed in ${duration}ms (${summary.polledCount} polled, ${summary.messagesReceived} SMS)`, {
                context: 'ACTIVE_POLLER',
                duration
            })
        }

    } catch (err: any) {
        logger.error('[ActivePoller] Tick failure', { context: 'ACTIVE_POLLER', error: err.message })
        summary.errors.push(err.message)
    }

    return summary
}
