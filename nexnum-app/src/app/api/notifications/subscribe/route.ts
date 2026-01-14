
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/jwt'
import { prisma } from '@/lib/core/db'
import { z } from 'zod'

// Validation schema for subscription data
const subscriptionSchema = z.object({
    endpoint: z.string().url(),
    keys: z.object({
        p256dh: z.string(),
        auth: z.string()
    }),
    userAgent: z.string().optional()
})

export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser(req.headers)
        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 })
        }

        const body = await req.json()
        const validation = subscriptionSchema.safeParse(body)

        if (!validation.success) {
            return new NextResponse('Invalid subscription data', { status: 400 })
        }

        const { endpoint, keys, userAgent } = validation.data

        // Save or update the subscription
        await prisma.pushSubscription.upsert({
            where: { endpoint },
            update: {
                userId: user.userId,
                p256dh: keys.p256dh,
                auth: keys.auth,
                userAgent: userAgent || req.headers.get('user-agent') || 'Unknown',
                updatedAt: new Date()
            },
            create: {
                userId: user.userId,
                endpoint,
                p256dh: keys.p256dh,
                auth: keys.auth,
                userAgent: userAgent || req.headers.get('user-agent') || 'Unknown'
            }
        })

        return NextResponse.json({ success: true, message: 'Subscription saved' })

    } catch (error) {
        console.error('[API] Failed to save push subscription:', error)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
