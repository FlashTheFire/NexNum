import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/jwt'
import { smsProvider } from '@/lib/sms-providers/index'
import { apiHandler } from '@/lib/api-handler'

interface RouteParams {
    params: Promise<{ numberId: string }>
}

// GET /api/sms/[numberId] - Poll for SMS messages
export const GET = apiHandler(async (request, context) => {
    // Note: apiHandler automatically passes params in context
    // But since Next.js 15+, params is a Promise which apiHandler might not resolve automatically if it's generic.
    // However, in our implementation we pass context "as is".
    // Let's resolve params manually to be safe or rely on apiHandler.
    // Actually, Next.js passes `context` as the second arg.
    // `apiHandler` wrapper receives this content.
    // We should treat `context.params` as the Promise it is in Next 15.

    // BUT, the context passed to apiHandler wrapper contains params.
    // Let's inspect apiHandler implementation: `return async (req: Request, context: { params: any })`.
    // Next.js 15 Route handlers receive `props: { params: Promise<P> }`.
    // So `context.params` IS a Promise.

    // We need to resolve it.
    // However, context coming from Next.js looks like { params: Promise... }
    // The apiHandler signature was `(req, context) => ...`.

    const params = await context.params // Await the promise from context.params (if apiHandler passes it through)
    // Wait, let's look at apiHandler.ts again.
    // It captures `context`. `return await handler(req, { ...context, body })`. 
    // So context.params inside handler is what Next.js passed.

    const { numberId } = params // Next.js 15: params is a Promise, so we must await it.
    // Note: In strict TypeScript with Next 15 types, params is Promise.

    const user = await getCurrentUser(request.headers)

    if (!user) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        )
    }

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
})

export const POST = GET
