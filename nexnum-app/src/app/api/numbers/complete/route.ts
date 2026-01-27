
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { getCurrentUser } from '@/lib/auth/jwt'
import { apiHandler } from '@/lib/api/api-handler'
import { z } from 'zod'
import { smsProvider } from '@/lib/providers'
import { emitStateUpdate } from '@/lib/events/emitters/state-emitter'

const completeNumberSchema = z.object({
    numberId: z.string().uuid('Invalid number ID'),
})

export const POST = apiHandler(async (request, { body }) => {
    // 1. Auth & Input Validation
    const user = await getCurrentUser(request.headers)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { numberId } = body

    // 2. Fetch Active Number
    const number = await prisma.number.findUnique({
        where: { id: numberId }
    })

    if (!number) {
        return NextResponse.json({ error: 'Number not found' }, { status: 404 })
    }

    // @ts-ignore - Prisma typing check
    if (number.ownerId !== user.userId) {
        return NextResponse.json({ error: 'Not your number' }, { status: 403 })
    }

    if (number.status !== 'active') {
        return NextResponse.json({
            success: true,
            message: 'Number already completed or inactive',
            number
        })
    }

    // 3. Provider Call: Set Status 6 (Activation Complete)
    let providerSuccess = false
    try {
        // Fetch related activation manually (no relation in schema)
        const activation = await prisma.activation.findUnique({
            where: { numberId: number.id }
        })

        if (activation?.providerActivationId && number.provider) {
            // Status 6 = ACTIVATION_COMPLETE in standard SMS protocols
            // SmartRouter expects "provider:id" format
            const compositeId = `${number.provider}:${activation.providerActivationId}`
            await smsProvider.setStatus(compositeId, 6)
            providerSuccess = true
        }
    } catch (err) {
        console.warn(`[COMPLETE] Failed to set provider status for ${numberId}:`, err)
        // We continue even if provider API fails, as user action is paramount locally
    }

    // 4. Update Database
    const updatedNumber = await prisma.$transaction(async (tx) => {
        // Complete the number
        const n = await tx.number.update({
            where: { id: numberId },
            data: {
                status: 'completed',
                expiresAt: new Date() // Expire immediately
            }
        })

        // Complete the activation
        if (number.activationId) {
            await tx.activation.update({
                where: { id: number.activationId },
                data: { state: 'RECEIVED' }
            })
        }

        return n
    })

    // 5. Emit Update to Frontend
    emitStateUpdate(user.userId, 'numbers', 'completed').catch(() => { })

    return NextResponse.json({
        success: true,
        message: 'Activation marked as complete',
        number: updatedNumber
    })

}, {
    schema: completeNumberSchema
})
