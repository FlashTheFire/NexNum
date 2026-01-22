import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/api-handler'
import { prisma } from '@/lib/core/db'
import { generateTwoFactorSecret, generateQrCode } from '@/lib/auth/two-factor'
import { getCurrentUser } from '@/lib/auth/jwt'

export const POST = apiHandler(async (req) => {
    const user = await getCurrentUser(req.headers)
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

    // Return secret and QR code
    // We do NOT save it to the DB yet, or we could save it as "pending".
    // Better stateless approach: Send it to client, client sends it back with token to verify.
    // OR: Save it to DB temp column? Schema doesn't have temp column.
    // Alternative: Save it to `twoFactorSecret` but keep `twoFactorEnabled` false.
    // Ideally we verify BEFORE saving, but to verify we need the secret.
    // So we can save it to `twoFactorSecret` now. If they never complete setup, `twoFactorEnabled` stays false.
    // This is acceptable.

    await prisma.user.update({
        where: { id: user.userId },
        data: { twoFactorSecret: secret }
    })

    return NextResponse.json({
        success: true,
        data: {
            secret, // For manual entry if QR fails
            qrCode
        }
    })
}, {
    rateLimit: 'auth' // Strict rate limit
})
