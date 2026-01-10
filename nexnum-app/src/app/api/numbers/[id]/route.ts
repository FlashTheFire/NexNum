import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { getCurrentUser } from '@/lib/auth/jwt'

interface RouteParams {
    params: Promise<{ id: string }>
}

// GET /api/numbers/[id] - Get number details
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const user = await getCurrentUser(request.headers)

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { id } = await params

        // Get number with SMS messages
        const number = await prisma.number.findUnique({
            where: { id },
            include: {
                smsMessages: {
                    orderBy: { receivedAt: 'desc' }
                }
            }
        })

        if (!number) {
            return NextResponse.json(
                { error: 'Number not found' },
                { status: 404 }
            )
        }

        // Verify ownership
        if (number.ownerId !== user.userId) {
            return NextResponse.json(
                { error: 'Forbidden' },
                { status: 403 }
            )
        }

        return NextResponse.json({
            success: true,
            number: {
                id: number.id,
                phoneNumber: number.phoneNumber,
                countryCode: number.countryCode,
                countryName: number.countryName,
                serviceName: number.serviceName,
                price: Number(number.price),
                status: number.status,
                expiresAt: number.expiresAt,
                purchasedAt: number.purchasedAt,
                smsMessages: number.smsMessages.map(sms => ({
                    id: sms.id,
                    sender: sms.sender,
                    content: sms.content,
                    code: sms.code,
                    receivedAt: sms.receivedAt,
                })),
            }
        })

    } catch (error) {
        console.error('Get number error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
