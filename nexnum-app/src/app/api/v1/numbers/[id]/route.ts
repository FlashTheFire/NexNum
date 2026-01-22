import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api/api-middleware'
import { prisma } from '@/lib/core/db'
import { smsProvider } from '@/lib/sms-providers'
import { WalletService } from '@/lib/wallet/wallet'

interface RouteParams {
    params: Promise<{ id: string }>
}

// GET /api/v1/numbers/[id] - Get number details
export async function GET(request: NextRequest, { params }: RouteParams) {
    const auth = await authenticateApiKey(request)
    if (!auth.success) return auth.error!

    const { id } = await params

    const number = await prisma.number.findUnique({
        where: { id },
        include: {
            smsMessages: {
                orderBy: { receivedAt: 'desc' }
            }
        }
    })

    if (!number) {
        return apiError('Number not found', 404)
    }

    if (number.ownerId !== auth.context!.userId) {
        return apiError('Forbidden', 403)
    }

    return apiSuccess({
        id: number.id,
        phoneNumber: number.phoneNumber,
        parsed: {
            countryCode: number.phoneCountryCode,
            nationalNumber: number.phoneNationalNumber
        },
        country: {
            code: number.countryCode,
            name: number.countryName
        },
        service: {
            code: number.serviceCode,
            name: number.serviceName
        },
        provider: number.provider, // Maybe hide this for public API? Or user needs to know? user provided it usually.
        status: number.status,
        expiresAt: number.expiresAt,
        messages: number.smsMessages.map(m => ({
            id: m.id,
            sender: m.sender,
            content: m.content,
            code: m.code,
            receivedAt: m.receivedAt
        }))
    })
}

// DELETE /api/v1/numbers/[id] - Cancel number and refund if eligible
export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const auth = await authenticateApiKey(request)
    if (!auth.success) return auth.error!

    const { id } = await params

    // 1. Get Number
    const number = await prisma.number.findUnique({
        where: { id }
    })

    if (!number) {
        return apiError('Number not found', 404)
    }

    if (number.ownerId !== auth.context!.userId) {
        return apiError('Forbidden', 403)
    }

    // Check status
    if (number.status === 'cancelled' || number.status === 'refunded') {
        return apiError('Number already cancelled', 409)
    }

    if (number.status !== 'active' && number.status !== 'pending') {
        return apiError(`Cannot cancel number in '${number.status}' status`, 409)
    }

    // Zero-SMS Check
    const smsCount = await prisma.smsMessage.count({
        where: { numberId: number.id }
    })

    if (smsCount > 0) {
        return apiError('Cannot cancel: SMS already received.', 409) // Conflict
    }

    // 2. Call Provider Cancel
    try {
        await smsProvider.cancelNumber(number.activationId)
    } catch (err: any) {
        console.warn(`[V1 CANCEL] Provider cancel warning for ${id}:`, err.message)
        // Proceed even if provider warns, but maybe log it.
    }

    // 3. Refund & Update DB
    try {
        await prisma.$transaction(async (tx) => {
            // Update Status
            await tx.number.update({
                where: { id },
                data: { status: 'cancelled' }
            })

            // Refund logic uses 'number.price' which is Decimal in Prisma but checks often expect number.
            // WalletService.refund expects number or string? Checking implementation it takes number.
            await WalletService.refund(
                number.ownerId,
                Number(number.price),
                'refund',
                number.id,
                `Refund: Cancelled ${number.serviceName} (via API)`,
                `refund_${number.id}`,
                tx
            )
        })

        return apiSuccess({
            status: 'cancelled',
            refunded: true,
            amount: Number(number.price)
        })

    } catch (err: any) {
        console.error(`[V1 CANCEL] Transaction failed:`, err)
        return apiError('Internal server error', 500)
    }
}
