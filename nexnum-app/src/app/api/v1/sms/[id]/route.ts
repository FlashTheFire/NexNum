import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey, apiSuccess, apiError } from '@/lib/api/api-middleware'
import { prisma } from '@/lib/core/db'

interface RouteParams {
    params: Promise<{ id: string }>
}

// GET /api/v1/sms/[id] - Get message details
export async function GET(request: NextRequest, { params }: RouteParams) {
    const auth = await authenticateApiKey(request)
    if (!auth.success) return auth.error!

    const { id } = await params

    const message = await prisma.smsMessage.findUnique({
        where: { id },
        include: {
            number: {
                select: {
                    ownerId: true,
                    phoneNumber: true,
                    serviceName: true,
                    countryName: true
                }
            }
        }
    })

    if (!message) {
        return apiError('Message not found', 404)
    }

    if (message.number.ownerId !== auth.context!.userId) {
        return apiError('Forbidden', 403)
    }

    return apiSuccess({
        id: message.id,
        receivedAt: message.receivedAt,
        sender: message.sender,
        content: message.content,
        code: message.code,
        number: {
            id: message.numberId,
            phoneNumber: message.number.phoneNumber,
            service: message.number.serviceName,
            country: message.number.countryName
        }
    })
}
