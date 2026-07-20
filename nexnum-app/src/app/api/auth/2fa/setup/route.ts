import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/api-handler'
import { prisma } from '@/lib/core/db'
import { generateTwoFactorSecret, generateQrCode } from '@/lib/auth/two-factor'
import { redis } from '@/lib/core/redis'

export const POST = apiHandler(async (req, { user }) => {
    // H8: Use apiHandler user context instead of calling getCurrentUser directly
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if already enabled
    const dbUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { twoFactorEnabled: true, email: true }
    })

    if (!dbUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (dbUser.twoFactorEnabled) {
        return NextResponse.json({ error: '2FA is already enabled' }, { status: 400 })
    }

    // Generate secret
    const { secret, otpauth } = generateTwoFactorSecret(dbUser.email)
    const qrCode = await generateQrCode(otpauth)

    // H5: Store secret in Redis (5min TTL) instead of DB to prevent orphaned secrets
    // The verify route will read from Redis and persist to DB only after successful verification
    await redis.set(`2fa:setup:${user.userId}`, secret, 'EX', 300)

    return NextResponse.json({
        success: true,
        data: {
            secret, // For manual entry if QR fails
            qrCode
        }
    })
}, {
    rateLimit: 'auth', // Strict rate limit
    requiresAuth: true
})
