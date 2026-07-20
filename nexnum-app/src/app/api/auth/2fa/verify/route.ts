import { prisma } from '@/lib/core/db'
import { verifyTwoFactorToken, generateBackupCodes, hashBackupCodes } from '@/lib/auth/two-factor'
import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'
import { redis } from '@/lib/core/redis'
import { z } from 'zod'

const verifySchema = z.object({
    token: z.string().min(6).max(6)
})

export const POST = apiHandler(async (req, { body, user }) => {
    if (!user) {
        return ResponseFactory.error('Unauthorized', 401)
    }

    const { token } = body!

    // H5: Read secret from Redis (where setup route stored it temporarily)
    const secret = await redis.get(`2fa:setup:${user.userId}`)
    if (!secret) {
        return ResponseFactory.error('2FA setup not initiated or expired. Please restart setup.', 400)
    }

    // Check if already enabled
    const dbUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { twoFactorEnabled: true }
    })

    if (!dbUser) {
        return ResponseFactory.error('User not found', 404)
    }

    if (dbUser.twoFactorEnabled) {
        return ResponseFactory.error('2FA is already enabled', 400)
    }

    // Verify
    const isValid = await verifyTwoFactorToken(token, secret)

    if (!isValid) {
        return ResponseFactory.error('Invalid OTP code', 400)
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes()
    const hashedBackupCodes = await hashBackupCodes(backupCodes)

    // Enable 2FA — persist secret to DB now that verification is complete
    await prisma.user.update({
        where: { id: user.userId },
        data: {
            twoFactorEnabled: true,
            twoFactorSecret: secret,
            twoFactorBackupCodes: hashedBackupCodes
        }
    })

    // Clean up Redis temp key
    await redis.del(`2fa:setup:${user.userId}`)

    return ResponseFactory.success({
        backupCodes // Return plaintext to user once
    })
}, {
    schema: verifySchema,
    rateLimit: 'auth',
    requiresAuth: true
})
