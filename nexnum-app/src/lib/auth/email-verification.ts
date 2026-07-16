import { prisma } from '@/lib/core/db'
import { randomBytes } from 'crypto'
import { EmailService } from '@/lib/email'
import { ConfirmEmail } from '@/components/emails/ConfirmEmail'
import { SecurityLog } from '@/lib/security-logger'

const VERIFICATION_TOKEN_EXPIRY = 48 * 60 * 60 * 1000 // 48 hours
const VERIFICATION_TOKEN_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_VERIFICATION_ATTEMPTS = 5 // Max attempts per window

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
    const verificationLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify?token=${token}`

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
 * Verify email using token with brute force protection
 */
export async function verifyEmail(token: string, ipAddress: string): Promise<{ success: boolean; error?: string; userId?: string }> {
    // Check for brute force attempts
    const now = Date.now()
    const windowStart = now - VERIFICATION_TOKEN_ATTEMPTS_WINDOW_MS

    // Count recent failed attempts for this IP
    const recentFailedAttempts = await prisma.verificationAttempt.count({
        where: {
            ipAddress,
            success: false,
            attemptedAt: {
                gte: new Date(windowStart)
            }
        }
    })

    // If too many failed attempts, log and reject
    if (recentFailedAttempts >= MAX_VERIFICATION_ATTEMPTS) {
        await SecurityLog.logSecurityEvent({
            eventType: 'BRUTE_FORCE_ATTEMPT',
            ipAddress,
            details: `Exceeded maximum verification attempts (${MAX_VERIFICATION_ATTEMPTS}) in ${VERIFICATION_TOKEN_ATTEMPTS_WINDOW_MS / 60000} minutes`
        })

        return {
            success: false,
            error: 'Too many verification attempts. Please try again later.'
        }
    }

    // Find the token
    const verificationToken = await prisma.emailVerificationToken.findUnique({
        where: { token },
        include: { user: true }
    })

    // Record the attempt (whether successful or not)
    await prisma.verificationAttempt.create({
        data: {
            token,
            ipAddress,
            success: !!verificationToken && verificationToken.expiresAt > new Date(),
            attemptedAt: new Date()
        }
    })

    // If token not found or expired, return error
    if (!verificationToken) {
        return { success: false, error: 'Invalid token' }
    }

    if (verificationToken.expiresAt < new Date()) {
        return { success: false, error: 'Token expired' }
    }

    // Mark email as verified in a transaction
    await prisma.$transaction([
        prisma.user.update({
            where: { id: verificationToken.userId },
            data: { emailVerified: new Date() }
        }),
        prisma.emailVerificationToken.delete({
            where: { id: verificationToken.id }
        }),
        // Clean up old verification attempts for this user (optional cleanup)
        prisma.verificationAttempt.deleteMany({
            where: {
                userId: verificationToken.userId,
                attemptedAt: {
                    lt: new Date(now - 24 * 60 * 60 * 1000) // Older than 24 hours
                }
            }
        })
    ])

    return { success: true, userId: verificationToken.userId }
}