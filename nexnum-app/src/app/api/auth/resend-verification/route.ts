import { sendVerificationEmail } from '@/lib/auth/email-verification'
import { prisma } from '@/lib/core/db'
import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'
import { logger } from '@/lib/core/logger'

export const POST = apiHandler(async (request, { user }) => {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'

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
})
