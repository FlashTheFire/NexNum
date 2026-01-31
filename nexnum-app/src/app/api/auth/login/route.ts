import { prisma } from '@/lib/core/db'
import { generateToken, setAuthCookie } from '@/lib/auth/jwt'
import { loginSchema } from '@/lib/api/validation'
import bcrypt from 'bcryptjs'
import { apiHandler } from '@/lib/api/api-handler'
import { auth_events_total } from '@/lib/metrics'
import { ResponseFactory } from '@/lib/api/response-factory'

export const POST = apiHandler(async (request, { body, security }) => {
    // Body is already validated by apiHandler using loginSchema
    const { email, password } = body!
    const ip = security?.clientIp || 'unknown'

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
        }
    })
}, {
    schema: loginSchema,
    rateLimit: 'auth',
    security: {
        requireBrowserCheck: true,
        browserCheckLevel: 'basic',
        requireCaptcha: true // Enterprise protection
    }
})
