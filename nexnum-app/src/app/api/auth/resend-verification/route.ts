import { sendVerificationEmail } from '@/lib/auth/email-verification'
import { prisma } from '@/lib/core/db'
import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'
import { logger } from '@/lib/core/logger'
import { redis } from '@/lib/core/redis'

export const POST = apiHandler(async (request, { user, security }) => {
    const ip = security?.clientIp || 'unknown'

    // M7: Per-user rate limiting — max 1 resend per 60 seconds
    const resendKey = `email:resend:${user!.userId}`
    const blocked = await redis.set(resendKey, '1', 'EX', 60, 'NX')
    if (blocked === null) {
        return ResponseFactory.error('Please wait at least 60 seconds before requesting another verification email.', 429, 'E_RATE_LIMIT')
    }

    // Get user details
    const userData = await prisma.user.findUnique({
        where: { id: user!.userId },
        select: { id: true, email: true, name: true, emailVerified: true }
    })

    if (!userData) {
        return ResponseFactory.error('User not found', 404)
    }

    if (userData.emailVerified) {
        return ResponseFactory.error('Email already verified', 400)
    }

    // Send new verification email
    const sent = await sendVerificationEmail(userData.id, userData.email, userData.name || 'User')

    if (!sent) {
        return ResponseFactory.error('Failed to send email', 500)
    }

    // Audit Log
    await prisma.auditLog.create({
        data: {
            userId: userData.id,
            action: 'email.resend_verification',
            resourceType: 'user',
            resourceId: userData.id,
            ipAddress: ip
        }
    })

    logger.info('[EmailResend] Success', { userId: userData.id })

    return ResponseFactory.success({ message: 'Verification email sent' })
}, { rateLimit: 'auth', requiresAuth: true })
