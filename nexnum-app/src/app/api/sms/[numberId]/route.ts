import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/jwt'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { smsProvider } from '@/lib/sms-providers'

interface RouteParams {
    params: Promise<{ numberId: string }>
}

// GET /api/sms/[numberId] - Poll for SMS messages
export async function GET(request: Request, { params }: RouteParams) {
    try {
        const user = await getCurrentUser(request.headers)

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Rate limiting
        const rateLimitResult = await rateLimit(user.userId, 'sms')

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
            )
        }

        const { numberId } = await params

        // Get number
        const number = await prisma.number.findUnique({
            where: { id: numberId }
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

        // Check if number is still active
        if (number.status === 'expired' || number.status === 'cancelled') {
            // Return existing messages
            const existingMessages = await prisma.smsMessage.findMany({
                where: { numberId },
                orderBy: { receivedAt: 'desc' }
            })

            return NextResponse.json({
                success: true,
                status: number.status,
                messages: existingMessages.map(m => ({
                    id: m.id,
                    sender: m.sender,
                    content: m.content,
                    code: m.code,
                    receivedAt: m.receivedAt,
                }))
            })
        }

        // Check if expired
        if (number.expiresAt && new Date() > number.expiresAt) {
            // Mark as expired
            await prisma.number.update({
                where: { id: numberId },
                data: { status: 'expired' }
            })

            const existingMessages = await prisma.smsMessage.findMany({
                where: { numberId },
                orderBy: { receivedAt: 'desc' }
            })

            return NextResponse.json({
                success: true,
                status: 'expired',
                messages: existingMessages.map(m => ({
                    id: m.id,
                    sender: m.sender,
                    content: m.content,
                    code: m.code,
                    receivedAt: m.receivedAt,
                }))
            })
        }

        // Poll provider for new messages
        if (!number.activationId) {
            return NextResponse.json(
                { error: 'Invalid activation' },
                { status: 400 }
            )
        }

        const providerStatus = await smsProvider.getStatus(number.activationId)

        // Save any new messages to database
        const existingMsgIds = new Set(
            (await prisma.smsMessage.findMany({
                where: { numberId },
                select: { id: true }
            })).map(m => m.id)
        )

        const newMessages = providerStatus.messages.filter(m => !existingMsgIds.has(m.id))

        if (newMessages.length > 0) {
            await prisma.smsMessage.createMany({
                data: newMessages.map(m => ({
                    id: m.id,
                    numberId,
                    sender: m.sender,
                    content: m.content,
                    code: m.code,
                    receivedAt: m.receivedAt,
                }))
            })

            // Update number status if SMS received
            if (providerStatus.status === 'received') {
                await prisma.number.update({
                    where: { id: numberId },
                    data: { status: 'received' }
                })
            }
        }

        // Get all messages
        const allMessages = await prisma.smsMessage.findMany({
            where: { numberId },
            orderBy: { receivedAt: 'desc' }
        })

        return NextResponse.json({
            success: true,
            status: providerStatus.status,
            messages: allMessages.map(m => ({
                id: m.id,
                sender: m.sender,
                content: m.content,
                code: m.code,
                receivedAt: m.receivedAt,
            }))
        })

    } catch (error) {
        console.error('Get SMS error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
