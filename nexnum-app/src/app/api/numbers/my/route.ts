import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/jwt'

// GET /api/numbers/my - Get user's numbers
export async function GET(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Get query params
        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status') // active, expired, cancelled
        const page = parseInt(searchParams.get('page') || '1')
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

        // Build where clause
        const where: any = { ownerId: user.userId }
        if (status) {
            where.status = status
        }

        // Get numbers with pagination
        const [numbers, total] = await Promise.all([
            prisma.number.findMany({
                where,
                include: {
                    smsMessages: {
                        orderBy: { receivedAt: 'desc' },
                        take: 5, // Only last 5 messages
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.number.count({ where }),
        ])

        return NextResponse.json({
            success: true,
            numbers: numbers.map(n => ({
                id: n.id,
                phoneNumber: n.phoneNumber,
                countryCode: n.countryCode,
                countryName: n.countryName,
                serviceName: n.serviceName,
                price: Number(n.price),
                status: n.status,
                expiresAt: n.expiresAt,
                purchasedAt: n.purchasedAt,
                smsCount: n.smsMessages.length,
                latestSms: n.smsMessages[0] ? {
                    content: n.smsMessages[0].content,
                    code: n.smsMessages[0].code,
                    receivedAt: n.smsMessages[0].receivedAt,
                } : null,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            }
        })

    } catch (error) {
        console.error('Get my numbers error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
