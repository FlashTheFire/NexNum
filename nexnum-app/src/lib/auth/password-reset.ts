import { prisma } from '@/lib/core/db'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { EmailService } from '@/lib/email'
import { PasswordResetEmail } from '@/components/emails/PasswordResetEmail'
import { logger } from '@/lib/core/logger'

const RESET_TOKEN_EXPIRY = 30 * 60 * 1000 // 30 minutes

export interface RequestPasswordResetResult {
    success: boolean
    error?: string
}

/**
 * Request a password reset for an email
 */
export async function requestPasswordReset(email: string, ipAddress?: string): Promise<RequestPasswordResetResult> {
    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
    })

    if (!user) {
        // Silent failure to prevent email enumeration
        return { success: true }
    }

    if (user.googleId) {
        // User signed up with Google, cannot reset password
        logger.warn('Password reset attempted for Google-auth user', { userId: user.id })
        return { success: true }
    }

    // Generate token
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY)

    // Delete existing unused tokens
    await prisma.passwordReset.deleteMany({
        where: { userId: user.id }
    })

    // Create new token
    await prisma.passwordReset.create({
        data: {
            userId: user.id,
            token,
            expiresAt,
            ipAddress
        }
    })

    // Send email
    const resetLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${token}`

    try {
        await EmailService.send({
            to: user.email,
            subject: 'Reset your NexNum password',
            component: PasswordResetEmail({
                name: user.name,
                resetLink
            })
        })
        return { success: true }
    } catch (error: any) {
        logger.error('Failed to send reset email', { error: error.message, userId: user.id })
        return { success: false, error: 'Failed to send email' }
    }
}

/**
 * Reset password using a valid token
 */
export async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const resetRecord = await prisma.passwordReset.findUnique({
        where: { token },
        include: { user: true }
    })

    if (!resetRecord) {
        return { success: false, error: 'Invalid or expired token' }
    }

    if (resetRecord.expiresAt < new Date()) {
        return { success: false, error: 'Token expired' }
    }

    if (resetRecord.usedAt) {
        return { success: false, error: 'Token already used' }
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12)

    // Update user and mark token used
    await prisma.$transaction([
        prisma.user.update({
            where: { id: resetRecord.userId },
            data: { passwordHash }
        }),
        prisma.passwordReset.update({
            where: { id: resetRecord.id },
            data: { usedAt: new Date() }
        })
    ])

    logger.info('Password reset successful', { userId: resetRecord.userId, ipAddress: resetRecord.ipAddress })

    return { success: true }
}
