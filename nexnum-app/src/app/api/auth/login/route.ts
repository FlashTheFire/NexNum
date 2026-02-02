import { prisma } from '@/lib/core/db'
import { generateToken, setAuthCookie } from '@/lib/auth/jwt'
import { loginSchema } from '@/lib/api/validation'
import bcrypt from 'bcryptjs'
import { apiHandler } from '@/lib/api/api-handler'
import { auth_events_total } from '@/lib/metrics'
import { ResponseFactory } from '@/lib/api/response-factory'

import { verifyCaptcha, isCaptchaRequired } from '@/lib/security/captcha'
import { logger } from '@/lib/core/logger'

export const POST = apiHandler(async (request, { body, security }) => {
    // Body is already validated by apiHandler using loginSchema
    const { email, password, captchaToken } = body!
    const ip = security?.clientIp || 'unknown'

    // 0. Manual CAPTCHA Verification with Admin Bypass
    const isRequired = await isCaptchaRequired()
    if (isRequired) {
        const captchaResult = await verifyCaptcha(captchaToken || '', ip)

        if (!captchaResult.success) {
            // Check if user is an ADMIN (requires finding user first)
            const potentialUser = await prisma.user.findUnique({
                where: { email: email.toLowerCase() },
                select: { role: true }
            })

            const isAdmin = potentialUser?.role === 'ADMIN'

            if (isAdmin) {
                logger.info('CAPTCHA bypass granted for administrative user', { email, ip })
            } else {
                return ResponseFactory.error(captchaResult.error || 'Security verification failed', 403)
            }
        }
    }

    // Find user
    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
    })

    if (!user) {
        auth_events_total.labels('login', 'failed_user_not_found').inc()
        return ResponseFactory.error('Invalid email or password', 401)
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash)

    if (!isValidPassword) {
        auth_events_total.labels('login', 'failed_invalid_password').inc()
        return ResponseFactory.error('Invalid email or password', 401)
    }

    // Check for 2FA
    if (user.twoFactorEnabled) {
        // Generate temporary token for 2FA validation
        const tempToken = await generateToken({
            userId: user.id,
            email: user.email,
            name: user.name,
            role: '2FA_PENDING',
            emailVerified: user.emailVerified,
            version: user.tokenVersion
        })

        // Audit Log (2FA Challenge)
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'LOGIN_2FA_CHALLENGE',
                resourceType: 'user',
                resourceId: user.id,
                ipAddress: ip,
            }
        })

        return ResponseFactory.success({
            requires2Fa: true,
            tempToken
        })
    }

    // Generate JWT token
    const token = await generateToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        version: user.tokenVersion
    })

    // Set auth cookie
    await setAuthCookie(token)

    // Audit log
    await prisma.auditLog.create({
        data: {
            userId: user.id,
            action: 'user.login',
            resourceType: 'user',
            resourceId: user.id,
            ipAddress: ip,
        }
    })

    auth_events_total.labels('login', 'success').inc()

    return ResponseFactory.success({
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            emailVerified: user.emailVerified,
            preferredCurrency: user.preferredCurrency
        }
    })
}, {
    schema: loginSchema,
    rateLimit: 'auth',
    security: {
        requireBrowserCheck: true,
        browserCheckLevel: 'basic',
        requireCaptcha: false // Manual verification below for Admin Bypass logic
    }
})
