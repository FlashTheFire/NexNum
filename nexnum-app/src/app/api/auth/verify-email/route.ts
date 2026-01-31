import { verifyEmail } from '@/lib/auth/email-verification'
import { prisma } from '@/lib/core/db'
import { generateToken, setAuthCookie } from '@/lib/auth/jwt'
import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'
import { z } from 'zod'
import { logger } from '@/lib/core/logger'

const schema = z.object({
    token: z.string().min(1)
})

export const POST = apiHandler(async (request, { body, security }) => {
    const { token } = body!
    const ip = security?.clientIp || 'unknown'

    const result = await verifyEmail(token)

    if (!result.success) {
        return ResponseFactory.error(result.error || 'Verification failed', 400)
    }

    const user = await prisma.user.findUnique({
        where: { id: result.userId }
    })

    if (!user) {
        return ResponseFactory.error('User not found', 404)
    }

    // Generate a new token with the verified status
    const newToken = await generateToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        version: user.tokenVersion
    })

    // Set the new auth cookie
    await setAuthCookie(newToken)

    // Audit Log
    await prisma.auditLog.create({
        data: {
            userId: user.id,
            action: 'email.verify',
            resourceType: 'user',
            resourceId: user.id,
            ipAddress: ip,
            metadata: { method: 'token' }
        }
    })

    logger.info('[EmailVerify] Success', { userId: user.id })

    return ResponseFactory.success({
        message: 'Email verified successfully',
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified
        }
    })
}, {
    schema,
    rateLimit: 'auth',
    security: { requireCSRF: false }
})
