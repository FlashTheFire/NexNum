import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey, apiSuccess } from '@/lib/api/api-middleware'
import { prisma } from '@/lib/core/db'

export async function GET(request: NextRequest) {
    const auth = await authenticateApiKey(request)
    if (!auth.success) return auth.error!

    const numbers = await prisma.number.findMany({
        where: {
            ownerId: auth.context!.userId,
            // Only active or recently active numbers
            status: { in: ['active', 'reserved'] }
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            phoneNumber: true,
            phoneCountryCode: true,
            phoneNationalNumber: true,
            countryCode: true,
            countryName: true,
            serviceCode: true,
            serviceName: true,
            price: true,
            status: true,
            expiresAt: true,
            createdAt: true,
            smsMessages: {
                orderBy: { receivedAt: 'desc' },
                select: {
                    sender: true,
                    content: true,
                    code: true,
                    receivedAt: true
                }
            }
        }
    })

    return apiSuccess({
        numbers: numbers.map(n => ({
            id: n.id,
            phoneNumber: n.phoneNumber,
            parsed: {
                countryCode: n.phoneCountryCode,
                nationalNumber: n.phoneNationalNumber
            },
            country: {
                code: n.countryCode,
                name: n.countryName
            },
            service: {
                code: n.serviceCode,
                name: n.serviceName
            },
            status: n.status,
            expiresAt: n.expiresAt,
            messages: n.smsMessages
        }))
    })
}
