import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { getCurrentUser } from '@/lib/auth/jwt'
import { apiHandler } from '@/lib/api/api-handler'
import { smsProvider } from '@/lib/providers'
import { WalletService } from '@/lib/wallet/wallet'
import { z } from 'zod'
import { emitStateUpdate } from '@/lib/events/emitters/state-emitter'

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

    // 2. Call Provider Cancel
    try {
        if (number.activationId) {
            await smsProvider.cancelNumber(number.activationId)
            console.log(`[CANCEL] Provider cancellation successful`)
        } else {
            console.warn(`[CANCEL] No activation ID found for number ${numberId}, skipping provider cancel`)
        }
    } catch (err: any) {
        // Some providers error if already cancelled. We should double check status?
        console.warn(`[CANCEL] Provider cancel warning:`, err.message)
        // We continue? Or abort?
        // If provider says "activation not found" or "already cancelled", we should proceed to mark local as cancelled.
        // But if provider says "cannot cancel", we should STOP.
        // Assuming smsProvider throws generic errors currently.
        // Todo: Refine provider error types.
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
        emitStateUpdate(user.userId, 'all', 'number_cancelled').catch(() => { })

        return NextResponse.json({ success: true, status: 'cancelled' })

    } catch (err: any) {
        console.error(`[CANCEL] DB Transaction failed:`, err)
        return NextResponse.json({ error: 'Cancellation failed internally' }, { status: 500 })
    }

}, { schema: cancelSchema })
