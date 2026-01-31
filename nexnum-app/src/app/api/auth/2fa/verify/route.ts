import { prisma } from '@/lib/core/db'
import { verifyTwoFactorToken, generateBackupCodes, hashBackupCodes } from '@/lib/auth/two-factor'
import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'
import { z } from 'zod'

const verifySchema = z.object({
    token: z.string().min(6).max(6)
})

export const POST = apiHandler(async (req, { body, user }) => {
    if (!user) {
        return ResponseFactory.error('Unauthorized', 401)
    }

    const { token } = body!

    // Fetch user secret
    const dbUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { twoFactorSecret: true, twoFactorEnabled: true }
    })

    if (!dbUser || !dbUser.twoFactorSecret) {
        return ResponseFactory.error('2FA setup not initiated', 400)
    }

    if (dbUser.twoFactorEnabled) {
        return ResponseFactory.error('2FA is already enabled', 400)
    }

    // Verify
    const isValid = await verifyTwoFactorToken(token, dbUser.twoFactorSecret)

    if (!isValid) {
        return ResponseFactory.error('Invalid OTP code', 400)
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes()
    const hashedBackupCodes = await hashBackupCodes(backupCodes)

    // Enable 2FA and save hashed backup codes
    await prisma.user.update({
        where: { id: user.userId },
        data: {
            twoFactorEnabled: true,
            twoFactorBackupCodes: hashedBackupCodes
        }
    })

    return ResponseFactory.success({
        backupCodes // Return plaintext to user once
    })
}, {
    schema: verifySchema,
    rateLimit: 'auth'
})
