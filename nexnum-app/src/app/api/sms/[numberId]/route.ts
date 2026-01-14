import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { getCurrentUser } from '@/lib/auth/jwt'
import { smsProvider } from '@/lib/sms-providers/index'
import { apiHandler } from '@/lib/api/api-handler'
import { NotificationFactory } from '@/lib/notifications/notification-service'

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
    if (number.status === 'expired' || number.status === 'cancelled' || number.status === 'timeout' || number.status === 'completed') {
        // Return existing messages
        const existingMessages = await prisma.smsMessage.findMany({
            where: { numberId },
            orderBy: { receivedAt: 'desc' }
        })

        // Check if status should be repaired (e.g., marked expired/timeout but has messages)
        let status = number.status
        if ((status === 'expired' || status === 'timeout') && existingMessages.length > 0) {
            status = 'completed'
            // Repair in background
            await prisma.number.update({
                where: { id: numberId },
                data: { status: 'completed' }
            })
        }

        return NextResponse.json({
            success: true,
            status: status,
            messages: existingMessages.map(m => ({
                id: m.id,
                sender: m.sender,
                content: formatMessageContent(m),
                code: m.code,
                receivedAt: m.receivedAt,
            }))
        })
    }

    // Check if expired
    if (number.expiresAt && new Date() > number.expiresAt) {
        // Check if any messages were received
        const existingMessages = await prisma.smsMessage.findMany({
            where: { numberId },
            orderBy: { receivedAt: 'desc' }
        })

        // If SMS was received, mark as COMPLETED, not EXPIRED
        const finalStatus = existingMessages.length > 0 ? 'completed' : 'expired'

        await prisma.number.update({
            where: { id: numberId },
            data: { status: finalStatus }
        })

        return NextResponse.json({
            success: true,
            status: finalStatus,
            messages: existingMessages.map(m => ({
                id: m.id,
                sender: m.sender,
                content: formatMessageContent(m),
                code: m.code,
                receivedAt: m.receivedAt,
            }))
        })
    }


    // Note: Provider polling is now handled by the background worker (process-inbox).
    // This endpoint is read-only from the database.


    // Get all messages
    const allMessages = await prisma.smsMessage.findMany({
        where: { numberId },
        orderBy: { receivedAt: 'desc' }
    })

    return NextResponse.json({
        success: true,
        status: number.status,
        messages: allMessages.map(m => ({
            id: m.id,
            sender: m.sender,
            content: formatMessageContent(m),
            code: m.code,
            receivedAt: m.receivedAt,
        }))
    })
})

function formatMessageContent(m: { content: string | null, code: string | null }): string | null {
    if ((!m.content || m.content.trim() === '') && m.code) {
        return `Your verification code is: ${m.code}`
    }
    return m.content
}

export const POST = GET
