import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/api-handler'
import { prisma } from '@/lib/core/db'
import { verifyTwoFactorToken, generateBackupCodes } from '@/lib/auth/two-factor'
import { getCurrentUser } from '@/lib/auth/jwt'
import { z } from 'zod'

const verifySchema = z.object({
    token: z.string().min(6).max(6)
})

export const POST = apiHandler(async (req, { body }) => {
    const user = await getCurrentUser(req.headers)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { token } = body!

    // Fetch user secret
    const dbUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { twoFactorSecret: true, twoFactorEnabled: true }
    })

    if (!dbUser || !dbUser.twoFactorSecret) {
        return NextResponse.json({ error: '2FA setup not initiated' }, { status: 400 })
    }

    if (dbUser.twoFactorEnabled) {
        return NextResponse.json({ error: '2FA is already enabled' }, { status: 400 })
    }

    // Verify
    const isValid = verifyTwoFactorToken(token, dbUser.twoFactorSecret)

    if (!isValid) {
        return NextResponse.json({ error: 'Invalid OTP code' }, { status: 400 })
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes()

    // Enable 2FA and save backup codes
    await prisma.user.update({
        where: { id: user.userId },
        data: {
            twoFactorEnabled: true,
            twoFactorBackupCodes: backupCodes
        }
    })

    return NextResponse.json({
        success: true,
        data: {
            backupCodes
        }
    })
}, {
    schema: verifySchema,
    rateLimit: 'auth'
})
