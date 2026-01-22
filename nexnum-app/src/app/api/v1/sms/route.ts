import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey, apiSuccess } from '@/lib/api/api-middleware'
import { prisma } from '@/lib/core/db'

// GET /api/v1/sms - List recent SMS messages
export async function GET(request: NextRequest) {
    const auth = await authenticateApiKey(request)
    if (!auth.success) return auth.error!

    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const numberId = searchParams.get('numberId')

    const where: any = {
        // Only messages for numbers owned by this user
        // We do this by checking number ownership
        number: {
            ownerId: auth.context!.userId
        }
    }

    if (numberId) {
        where.numberId = numberId
    }

    const messages = await prisma.smsMessage.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take: limit,
        include: {
            number: {
                select: {
                    phoneNumber: true,
                    phoneCountryCode: true,
                    phoneNationalNumber: true,
                    serviceName: true,
                    countryName: true
                }
            }
        }
    })

    return apiSuccess({
        messages: messages.map(m => ({
            id: m.id,
            receivedAt: m.receivedAt,
            sender: m.sender,
            content: m.content,
            code: m.code,
            number: {
                id: m.numberId,
                phoneNumber: m.number.phoneNumber,
                service: m.number.serviceName,
                country: m.number.countryName
            }
        }))
    })
}
