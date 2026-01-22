import { prisma } from '@/lib/core/db'
import { randomBytes } from 'crypto'
import { EmailService } from '@/lib/email'
import { ConfirmEmail } from '@/components/emails/ConfirmEmail'

const VERIFICATION_TOKEN_EXPIRY = 48 * 60 * 60 * 1000 // 48 hours

/**
 * Generate verification token and send email
 */
export async function sendVerificationEmail(userId: string, email: string, name: string): Promise<boolean> {
    // Generate token
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY)

    // Store token
    // We clean up old tokens for this user first
    await prisma.emailVerificationToken.deleteMany({
        where: { userId }
    })

    await prisma.emailVerificationToken.create({
        data: {
            userId,
            token,
            expiresAt
        }
    })

    // Send email
    const verificationLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify-email?token=${token}`

    try {
        await EmailService.send({
            to: email,
            subject: 'Confirm your email address',
            component: ConfirmEmail({
                name,
                confirmLink: verificationLink
            })
        })
        return true
    } catch (error) {
        console.error('Failed to send verification email:', error)
        return false
    }
}

/**
 * Verify email using token
 */
export async function verifyEmail(token: string): Promise<{ success: boolean; error?: string }> {
    const verificationToken = await prisma.emailVerificationToken.findUnique({
        where: { token },
        include: { user: true }
    })

    if (!verificationToken) {
        return { success: false, error: 'Invalid token' }
    }

    if (verificationToken.expiresAt < new Date()) {
        return { success: false, error: 'Token expired' }
    }

    // Mark email as verified
    await prisma.$transaction([
        prisma.user.update({
            where: { id: verificationToken.userId },
            data: { emailVerified: new Date() }
        }),
        prisma.emailVerificationToken.delete({
            where: { id: verificationToken.id }
        })
    ])

    return { success: true }
}
