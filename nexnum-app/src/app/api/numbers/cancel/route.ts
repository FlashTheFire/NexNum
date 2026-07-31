import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { getCurrentUser } from '@/lib/auth/jwt'
import { apiHandler } from '@/lib/api/api-handler'
import { smsProvider } from '@/lib/providers'
import { WalletService } from '@/lib/wallet/wallet'
import { z } from 'zod'
import { emitStateUpdate } from '@/lib/events/emitters/state-emitter'
import { logger } from '@/lib/core/logger'
import { captureError, addBreadcrumb } from '@/lib/monitoring/sentry'

const cancelSchema = z.object({
    numberId: z.string().uuid(),
    reason: z.string().optional()
})

/**
 * Cancel Number & Refund
 * 
 * 1. Verify ownership & status
 * 2. Call Provider Cancel
 * 3. Verify Cancel Status (ensure provider actually cancelled)
 * 4. Refund User (Transaction)
 * 5. Update Number Status
 */
export const POST = apiHandler(async (request, { body }) => {
    const user = await getCurrentUser(request.headers)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!body) return NextResponse.json({ error: 'Missing request body' }, { status: 400 })
    const { numberId, reason } = body

    // 1. Get Number
    const number = await prisma.number.findUnique({
        where: { id: numberId }
    })

    if (!number) {
        return NextResponse.json({ error: 'Number not found' }, { status: 404 })
    }

    if (number.ownerId !== user.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if already cancelled/refunded
    if (number.status === 'cancelled' || number.status === 'refunded') {
        return NextResponse.json({ error: 'Number already cancelled' }, { status: 400 })
    }

    // Only active numbers can be cancelled/refunded
    // (Expired numbers generally cannot be refunded unless specific policy)
    // For now, allow cancelling 'active' status.
    if (number.status !== 'active' && number.status !== 'pending') {
        return NextResponse.json({ error: `Cannot cancel number in '${number.status}' status` }, { status: 400 })
    }

    // New Guard: Zero-SMS Check
    // If the user received ANY message, they cannot cancel/refund manually.
    const smsCount = await prisma.smsMessage.count({
        where: { numberId: number.id }
    })

    if (smsCount > 0) {
        return NextResponse.json({
            error: 'Cannot cancel: SMS Code already received. Service fulfilled.'
        }, { status: 400 })
    }

    console.log(`[CANCEL] Cancelling number ${numberId} (${number.phoneNumber}) for user ${user.userId}`)

    // 2. Attempt Provider Cancel
    if (number.activationId) {
        const rawId = number.activationId.includes(':')
            ? number.activationId.split(':').slice(1).join(':')
            : number.activationId

        try {
            if (smsProvider.setCancel) {
                await smsProvider.setCancel(rawId)
            } else {
                await smsProvider.cancelNumber(rawId)
            }
            console.log(`[CANCEL] Provider cancellation successful for ${rawId}`)
        } catch (err: any) {
            console.warn(`[CANCEL] Provider cancel rejected/failed for ${rawId}:`, err.message)

            // Cancellation failed — fetch getStatus to check if an OTP/SMS code arrived on provider side!
            try {
                const statusResult = await smsProvider.getStatus(rawId)
                if (statusResult?.messages && statusResult.messages.length > 0) {
                    // SMS code was received! Do NOT refund — save message and mark number received!
                    for (const msg of statusResult.messages) {
                        await prisma.smsMessage.create({
                            data: {
                                numberId: number.id,
                                sender: msg.code ? 'Verification Service' : 'SMS System',
                                content: msg.content || (msg as any).text || (msg.code ? `Your verification code is: ${msg.code}` : 'Message received'),
                                code: msg.code || null,
                                receivedAt: new Date()
                            }
                        }).catch(() => {})
                    }

                    await prisma.number.update({
                        where: { id: numberId },
                        data: { status: 'received' }
                    })

                    emitStateUpdate(user.userId, 'all', 'sms_received').catch(() => {})

                    return NextResponse.json({
                        error: 'Cannot cancel: SMS Code was received from provider. Service fulfilled.',
                        status: 'received'
                    }, { status: 400 })
                }
            } catch (statusErr: any) {
                console.error(`[CANCEL] Fallback getStatus check failed:`, statusErr.message)
            }

            // If no SMS code was found and error indicates already cancelled/expired, allow local cleanup & refund
            const rawMsg = String(err.message || 'Provider rejected cancellation')
            const cleanError = rawMsg.replace(/^Provider error:\s*/i, '')
            const errMsg = rawMsg.toLowerCase()
            const isAlreadyCancelledOrExpired = errMsg.includes('not found') || errMsg.includes('already') || errMsg.includes('bad_key') || errMsg.includes('no_key') || errMsg.includes('expired')

            if (!isAlreadyCancelledOrExpired) {
                return NextResponse.json({
                    error: cleanError
                }, { status: 400 })
            }
        }
    }

    // 3. Refund & Update DB (Transaction)
    try {
        await prisma.$transaction(async (tx) => {
            // A. Update Number Status
            const updatedNumber = await tx.number.update({
                where: { id: numberId },
                data: {
                    status: 'cancelled',
                    // stored reason?
                }
            })

            // B. Refund Wallet
            // We use the ORIGINAL price paid.
            await WalletService.refund(
                user.userId,
                number.price.toNumber(),
                'refund',
                number.id,
                `Refund: Cancelled ${number.serviceName} (${number.countryName})`,
                `refund_${number.id}`, // Idempotency key
                tx
            )

            // Emit update to user (fire and forget inside trans? no, better outside or use event queue)
        })

        // Emit real-time update
        await emitStateUpdate(user.userId, 'numbers', `Order cancelled: ${numberId}`)

        console.log(`[CANCEL] Refund successful for ${numberId}`)

        // Remove from ActiveOrderStream so Tier 1 poller stops polling this activation
        if (number.activationId) {
            const { ActiveOrderStream } = await import('@/lib/activation/active-order-stream')
            ActiveOrderStream.removeActiveOrder(number.activationId).catch(() => {})
        }

        // NEW: Record Stats for Health Monitor
        // Rule: Only count as "Failure" if user waited > 2 minutes.
        if (number.provider && number.purchasedAt) {
            const duration = Date.now() - number.purchasedAt.getTime()
            if (duration > 120000) { // 2 minutes
                const provider = await prisma.provider.findFirst({ where: { name: number.provider } })
                if (provider) {
                    const { healthMonitor } = await import('@/lib/providers/health-monitor')
                    // Record FAILURE (false) - pass 0 latency as irrelevant
                    healthMonitor.recordRequest(provider.id, false, 0, undefined, 'TRANSIENT').catch(console.error)
                }
            }
        }

        // PRODUCTION: Invalidate cache & emit WebSocket event for real-time UI update
        emitStateUpdate(user.userId, 'all', 'number_cancelled').catch(err => logger.warn('[Numbers/cancel] emitStateUpdate failed', { error: err }))

        return NextResponse.json({ success: true, status: 'cancelled' })

    } catch (err: any) {
        console.error(`[CANCEL] DB Transaction failed:`, err)
        captureError(err, { context: 'CANCEL', numberId, userId: user.userId })
        return NextResponse.json({ error: 'Cancellation failed internally' }, { status: 500 })
    }

}, { schema: cancelSchema })
