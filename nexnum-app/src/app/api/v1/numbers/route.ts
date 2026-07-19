import { NextRequest, NextResponse } from 'next/server'
import { authenticateApiKey, apiSuccess } from '@/lib/api/api-middleware'
import { prisma } from '@/lib/core/db'

export async function GET(request: NextRequest) {
    const auth = await authenticateApiKey(request)
    if (!auth.success) return auth.error!

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)))
    const offset = (page - 1) * limit

    const [numbers, total] = await Promise.all([
        prisma.number.findMany({
            where: {
                ownerId: auth.context!.userId,
                status: { in: ['active', 'reserved'] }
            },
            orderBy: { createdAt: 'desc' },
            skip: offset,
            take: limit,
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
                    take: 10,
                    select: {
                        sender: true,
                        content: true,
                        code: true,
                        receivedAt: true
                    }
                }
            }
        }),
        prisma.number.count({
            where: {
                ownerId: auth.context!.userId,
                status: { in: ['active', 'reserved'] }
            }
        })
    ])

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
        })),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    })
}
