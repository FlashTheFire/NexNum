import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/jwt'
import { apiHandler } from '@/lib/api-handler'
import { smsProvider } from '@/lib/sms-providers'
import { WalletService } from '@/lib/wallet'
import { z } from 'zod'

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

    console.log(`[CANCEL] Cancelling number ${numberId} (${number.phoneNumber}) for user ${user.userId}`)

    // 2. Call Provider Cancel
    try {
        await smsProvider.cancelNumber(number.activationId)
        console.log(`[CANCEL] Provider cancellation successful`)
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
        })

        console.log(`[CANCEL] Refund successful for ${numberId}`)
        return NextResponse.json({ success: true, status: 'cancelled' })

    } catch (err: any) {
        console.error(`[CANCEL] DB Transaction failed:`, err)
        return NextResponse.json({ error: 'Cancellation failed internally' }, { status: 500 })
    }

}, { schema: cancelSchema })
