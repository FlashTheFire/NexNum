import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { rateLimit } from '@/lib/core/rate-limit'
import { generateToken, setAuthCookie } from '@/lib/auth/jwt'
import { loginSchema } from '@/lib/api/validation'
import bcrypt from 'bcryptjs'
import { apiHandler } from '@/lib/api/api-handler'
import { verifyCaptcha } from '@/lib/security/captcha'
import { auth_events_total } from '@/lib/metrics'

export const POST = apiHandler(async (request, { body }) => {
    // Body is already validated by apiHandler using loginSchema
    if (!body) throw new Error('Body is required')
    const { email, password, captchaToken } = body

    // 1. Rate Limit
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const limit = await rateLimit(`auth:${ip}`, 5, 10) // 5 reqs / 10s

    if (!limit.success) {
        return NextResponse.json(
            { error: 'Too Many Requests', message: 'Please try again in a few seconds' },
            {
                status: 429,
                headers: {
                    'X-RateLimit-Limit': String(limit.limit),
                    'X-RateLimit-Remaining': String(limit.remaining),
                    'X-RateLimit-Reset': String(limit.reset)
                }
            }
        )
    }

    // Verify CAPTCHA
    const captchaResult = await verifyCaptcha(captchaToken, ip)
    if (!captchaResult.success) {
        return NextResponse.json(
            { error: captchaResult.error },
            { status: 400 }
        )
    }

    // Find user
    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
    })

    if (!user) {
        auth_events_total.labels('login', 'failed_user_not_found').inc()
        return NextResponse.json(
            { error: 'Invalid email or password' },
            { status: 401 }
        )
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash)

    if (!isValidPassword) {
        auth_events_total.labels('login', 'failed_invalid_password').inc()
        return NextResponse.json(
            { error: 'Invalid email or password' },
            { status: 401 }
        )
    }

    // Check for 2FA
    if (user.twoFactorEnabled) {
        // Generate temporary token for 2FA validation
        const tempToken = await generateToken({
            userId: user.id,
            email: user.email,
            name: user.name,
            role: '2FA_PENDING',
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

        return NextResponse.json({
            success: true,
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
        version: user.tokenVersion
    })

    // Set auth cookie
    await setAuthCookie(token)

    // Audit log
    // ip is already defined above
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

    return NextResponse.json({
        success: true,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
        },
        token,
    })
}, {
    schema: loginSchema,
    rateLimit: 'auth',
    security: {
        requireBrowserCheck: true,
        browserCheckLevel: 'basic'
    }
})
