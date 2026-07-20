import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/api-handler'
import { prisma } from '@/lib/core/db'
import { verifyTwoFactorToken } from '@/lib/auth/two-factor'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

const disableSchema = z.object({
    password: z.string(),
    token: z.string()
})

export const POST = apiHandler(async (req, { body, user }) => {
    // H8: Use apiHandler user context instead of calling getCurrentUser directly
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { password, token } = body!

    const dbUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { passwordHash: true, twoFactorSecret: true, twoFactorEnabled: true }
    })

    if (!dbUser || !dbUser.twoFactorEnabled) {
        return NextResponse.json({ error: '2FA is not enabled' }, { status: 400 })
    }

    // 1. Verify Password
    const validPassword = await bcrypt.compare(password, dbUser.passwordHash)
    if (!validPassword) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 400 })
    }

    // 2. Verify OTP (Security best practice: ensure they still have the device before removing)
    if (dbUser.twoFactorSecret) {
        // H2: Add missing await — verifyTwoFactorToken is async
        const isValid = await verifyTwoFactorToken(token, dbUser.twoFactorSecret)
        if (!isValid) {
            return NextResponse.json({ error: 'Invalid OTP code' }, { status: 400 })
        }
    }

    // Disable — H3: increment tokenVersion to invalidate existing sessions
    await prisma.user.update({
        where: { id: user.userId },
        data: {
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorBackupCodes: [],
            tokenVersion: { increment: 1 }
        }
    })

    return NextResponse.json({ success: true })
}, {
    schema: disableSchema,
    rateLimit: 'auth',
    requiresAuth: true
})
