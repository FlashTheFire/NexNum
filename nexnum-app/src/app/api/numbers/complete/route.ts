import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { getCurrentUser } from '@/lib/auth/jwt'
import { apiHandler } from '@/lib/api/api-handler'
import { smsProvider } from '@/lib/sms-providers'

/**
 * Complete Activation Manually
 * 
 * Allows user to mark an activation as "Completed" (Status 6) if they have received SMS.
 * This stops polling and releases the number at the provider level without refunding.
 */
export const POST = apiHandler(async (request, { body }) => {
    const user = await getCurrentUser(request.headers)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { numberId } = body

    if (!numberId) {
        return NextResponse.json({ error: 'Number ID required' }, { status: 400 })
    }

    // 1. Get Number
    const number = await prisma.number.findUnique({
        where: { id: numberId },
        include: { _count: { select: { smsMessages: true } } }
    })

    if (!number) {
        return NextResponse.json({ error: 'Number not found' }, { status: 404 })
    }

    if (number.ownerId !== user.userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 2. Validate Status
    if (number.status !== 'active' && number.status !== 'pending') {
        return NextResponse.json({ error: `Cannot complete number in '${number.status}' status` }, { status: 400 })
    }

    // 3. Validate SMS Presence (Safety check)
    // We generally only allow completing if services was actually used (has SMS), 
    // otherwise they should cancel (and refund).
    if (number._count.smsMessages === 0) {
        return NextResponse.json({
            error: 'No SMS received. Please use "Cancel" to refund the order instead.'
        }, { status: 400 })
    }

    console.log(`[COMPLETE] Completing number ${numberId} for user ${user.userId}`)

    // 4. Notify Provider (Status 6 = Activation Complete)
    try {
        if (smsProvider.setStatus) {
            await smsProvider.setStatus(number.activationId, 6)
            console.log(`[COMPLETE] Provider notified (Status 6)`)
        }
    } catch (err: any) {
        // Log but continue - we want to update local state regardless
        console.warn(`[COMPLETE] Provider update warning:`, err.message)
    }

    // 5. Update Local DB
    await prisma.number.update({
        where: { id: numberId },
        data: {
            status: 'completed',
        }
    })

    return NextResponse.json({ success: true, status: 'completed' })
})
