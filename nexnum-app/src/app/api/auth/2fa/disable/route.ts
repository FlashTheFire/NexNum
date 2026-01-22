import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/api-handler'
import { prisma } from '@/lib/core/db'
import { verifyTwoFactorToken } from '@/lib/auth/two-factor'
import { getCurrentUser } from '@/lib/auth/jwt'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

const disableSchema = z.object({
    password: z.string(),
    token: z.string()
})

export const POST = apiHandler(async (req, { body }) => {
    const user = await getCurrentUser(req.headers)
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
        const isValid = verifyTwoFactorToken(token, dbUser.twoFactorSecret)
        if (!isValid) {
            return NextResponse.json({ error: 'Invalid OTP code' }, { status: 400 })
        }
    }

    // Disable
    await prisma.user.update({
        where: { id: user.userId },
        data: {
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorBackupCodes: []
        }
    })

    return NextResponse.json({ success: true })
}, {
    schema: disableSchema,
    rateLimit: 'auth'
})
