/**
 * High-Speed Tier 1 Active Order Poller (v2 — Adaptive Scheduling)
 * 
 * Runs every 3 seconds but respects per-activation adaptive intervals.
 * Instead of polling ALL active orders on every tick, it only polls orders
 * whose `nextPollAt` has elapsed (via ActiveOrderStream.getDueOrders).
 * 
 * After each poll, calculates the next poll time using the age-based
 * AdaptivePollStrategy and stores it in Redis — ensuring sub-second
 * scheduling precision without any cron-gate bottleneck.
 * 
 * This is the PRIMARY and SOLE SMS polling mechanism.
 * The inbox-worker serves only as a safety-net fallback.
 */

import { ActiveOrderStream, ActiveOrderData } from '@/lib/activation/active-order-stream'
import { getNextPollDelay } from '@/lib/activation/adaptive-poll-strategy'
import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'
import { getProviderAdapter } from '@/lib/providers/provider-factory'

export interface ActivePollerSummary {
    totalActive: number
    dueCount: number
    polledCount: number
    messagesReceived: number
    errors: string[]
}

/**
 * Executes a single high-speed active poller tick.
 * Only polls activations that are DUE based on their per-activation nextPollAt.
 */
export async function runActivePollerTick(): Promise<ActivePollerSummary> {
    const startTime = Date.now()
    const summary: ActivePollerSummary = {
        totalActive: 0,
        dueCount: 0,
        polledCount: 0,
        messagesReceived: 0,
        errors: []
    }

    try {
        // 1. Fetch ONLY due orders from Redis (nextPollAt <= now, within 20min lifetime)
        const dueOrders = await ActiveOrderStream.getDueOrders()
        summary.dueCount = dueOrders.length

        if (dueOrders.length === 0) {
            return summary
        }

        // 2. Resolve providers and poll individually or in small batches
        //    We poll each activation individually to avoid provider UUID resolution issues.
        const pollPromises = dueOrders.map(order => pollSingleActivation(order, summary))

        // Execute with concurrency limit (avoid overwhelming providers)
        await limitConcurrency(pollPromises.map(p => () => p), 10)

        const duration = Date.now() - startTime
        if (summary.messagesReceived > 0 || summary.polledCount > 0) {
            logger.info(`[ActivePoller] Tick: ${summary.polledCount} polled, ${summary.messagesReceived} SMS in ${duration}ms`, {
                context: 'ACTIVE_POLLER',
                duration,
                polled: summary.polledCount,
                sms: summary.messagesReceived
            })
        }

    } catch (err: any) {
        logger.error('[ActivePoller] Tick failure', { context: 'ACTIVE_POLLER', error: err.message })
        summary.errors.push(err.message)
    }

    return summary
}

/**
 * Poll a single activation: call provider → process messages → schedule next poll
 */
async function pollSingleActivation(order: ActiveOrderData, summary: ActivePollerSummary): Promise<void> {
    try {
        summary.polledCount++

        // 1. Resolve provider adapter
        const provider = await prisma.provider.findFirst({
            where: {
                OR: [
                    ...(order.providerId ? [{ id: order.providerId }, { name: order.providerId }] : []),
                    ...(order.provider ? [{ name: order.provider }] : [])
                ]
            }
        })

        if (!provider) {
            logger.warn(`[ActivePoller] Provider not found for activation #${order.activationId}`, {
                context: 'ACTIVE_POLLER',
                providerId: order.providerId,
                providerName: order.provider
            })
            // Schedule retry in 10s if provider not found
            await ActiveOrderStream.updatePollSchedule(order.activationId, Date.now() + 10000)
            summary.errors.push(`Provider not found for activation #${order.activationId}`)
            return
        }

        // 2. Call provider getStatus with raw numeric activation ID
        const adapter = getProviderAdapter(provider)
        if (!adapter.getStatus) {
            await ActiveOrderStream.updatePollSchedule(order.activationId, Date.now() + 30000)
            return
        }

        const rawId = order.activationId.includes(':')
            ? order.activationId.split(':').slice(1).join(':')
            : order.activationId

        let statusResult: any
        try {
            statusResult = await Promise.race([
                adapter.getStatus(rawId),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Provider timeout')), 15000)
                )
            ])
        } catch (providerErr: any) {
            // Provider error — backoff and retry
            const errorDelay = Math.min(20, 5 + (order.pollCount || 0) * 2)
            await ActiveOrderStream.updatePollSchedule(
                order.activationId,
                Date.now() + (errorDelay * 1000)
            )
            logger.error(`[ActivePoller] getStatus failed for #${order.activationId}`, {
                context: 'ACTIVE_POLLER',
                error: providerErr.message
            })
            summary.errors.push(`Activation #${order.activationId}: ${providerErr.message}`)
            return
        }

        // 3. Check for terminal states
        const status = statusResult?.status || 'pending'
        if (['COMPLETED', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'received', 'completed', 'cancelled', 'expired', 'refunded'].includes(status)) {
            // Handle terminal lifecycle errors
            if (['CANCELLED', 'EXPIRED', 'cancelled', 'expired'].includes(status)) {
                await ActiveOrderStream.removeActiveOrder(order.activationId)
                return
            }
        }

        // 4. Process messages
        const messages = statusResult?.messages ?? []
        let newSmsCount = order.smsCount || 0
        let lastSmsAt = order.lastSmsAt || 0

        if (messages.length > 0) {
            for (const msg of messages) {
                try {
                    // DB insertion
                    await prisma.smsMessage.create({
                        data: {
                            numberId: order.numberId,
                            sender: msg.code ? 'Verification Service' : 'SMS System',
                            content: msg.content || msg.text || (msg.code ? `Your verification code is: ${msg.code}` : 'Message received'),
                            code: msg.code || null,
                            receivedAt: new Date()
                        }
                    })

                    // Real-Time Redis Pub/Sub Broadcast (<100ms UI update)
                    const pubSubPayload = JSON.stringify({
                        event: 'sms.received',
                        numberId: order.numberId,
                        activationId: order.activationId,
                        code: msg.code,
                        content: msg.content || msg.text,
                        receivedAt: new Date().toISOString()
                    })
                    await redis.publish('sms:received', pubSubPayload)

                    summary.messagesReceived++
                    newSmsCount++
                    lastSmsAt = Date.now()

                    logger.success(`[ActivePoller] OTP RECEIVED #${order.activationId}: Code ${msg.code}`, {
                        context: 'ACTIVE_POLLER',
                        activationId: order.activationId,
                        code: msg.code
                    })
                } catch (dbErr: any) {
                    // Skip duplicates silently (P2002 = unique constraint)
                    if (dbErr.code !== 'P2002') {
                        logger.error(`[ActivePoller] Error saving message for #${order.activationId}`, {
                            context: 'ACTIVE_POLLER',
                            error: dbErr.message
                        })
                    }
                }
            }

            // Update number status to 'received' in DB (non-blocking)
            prisma.number.updateMany({
                where: { activationId: order.activationId, status: 'active' },
                data: { status: 'received', updatedAt: new Date() }
            }).catch(() => { })

            // Request next SMS from provider (setStatus=3 equivalent, non-blocking)
            if (typeof (adapter as any).setResendCode === 'function') {
                (adapter as any).setResendCode(order.activationId).catch(() => { })
            }
        }

        // 5. Calculate NEXT poll time using Adaptive Strategy
        const pollAttempt = (order.pollCount || 0) + 1
        const orderAgeSeconds = (Date.now() - order.createdAt) / 1000

        const timeSinceLastSmsSeconds = lastSmsAt > 0 ? (Date.now() - lastSmsAt) / 1000 : undefined

        const decision = getNextPollDelay({
            orderAgeSeconds,
            smsCount: newSmsCount,
            pollAttempt,
            lastPollError: false,
            timeSinceLastSmsSeconds
        })

        const nextPollAt = Date.now() + (decision.delaySeconds * 1000)

        // 6. Store next poll time in Redis
        await ActiveOrderStream.updatePollSchedule(order.activationId, nextPollAt, {
            smsCount: newSmsCount,
            lastSmsAt: lastSmsAt || undefined
        })

        // Also update the DB record for the inbox-worker safety-net
        prisma.number.updateMany({
            where: { activationId: order.activationId },
            data: {
                pollCount: pollAttempt,
                nextPollAt: new Date(nextPollAt),
                lastPolledAt: new Date(),
                errorCount: 0
            }
        }).catch(() => { }) // Non-blocking DB sync

    } catch (err: any) {
        logger.error(`[ActivePoller] Failed polling #${order.activationId}`, {
            context: 'ACTIVE_POLLER',
            error: err.message
        })
        // Schedule retry in 15s on unexpected error
        await ActiveOrderStream.updatePollSchedule(order.activationId, Date.now() + 15000).catch(() => { })
        summary.errors.push(`#${order.activationId}: ${err.message}`)
    }
}

/**
 * Simple concurrency limiter
 */
async function limitConcurrency<T>(
    tasks: (() => Promise<T>)[],
    limit: number
): Promise<T[]> {
    const results: T[] = []
    const executing: Promise<void>[] = []

    for (const task of tasks) {
        const p = Promise.resolve().then(() => task()).then(result => {
            results.push(result)
        }).catch(() => { })
        executing.push(p)

        if (executing.length >= limit) {
            await Promise.race(executing)
            for (let i = executing.length - 1; i >= 0; i--) {
                const settled = await Promise.race([
                    executing[i].then(() => true),
                    Promise.resolve(false)
                ])
                if (settled) executing.splice(i, 1)
            }
        }
    }

    await Promise.all(executing)
    return results
}
