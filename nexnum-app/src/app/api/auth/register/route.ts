import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { rateLimit } from '@/lib/core/rate-limit'
import { generateToken, setAuthCookie } from '@/lib/auth/jwt'
import { registerSchema } from '@/lib/api/validation'
import bcrypt from 'bcryptjs'
import { apiHandler } from '@/lib/api/api-handler'
import { sendVerificationEmail } from '@/lib/auth/email-verification'
import { verifyCaptcha } from '@/lib/security/captcha'
import { auth_events_total } from '@/lib/metrics'

export const POST = apiHandler(async (request, { body }) => {
    // Body validation provided by registerSchema
    if (!body) throw new Error('Body is required')
    const { name, email, password, captchaToken } = body

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

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
    })

    if (existingUser) {
        auth_events_total.labels('register', 'failed_email_exists').inc()
        return NextResponse.json(
            { error: 'Email already registered' },
            { status: 409 }
        )
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)


    // Create user and wallet in transaction
    const user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
            data: {
                name,
                email: email.toLowerCase(),
                passwordHash,
            }
        })

        // Create wallet for user
        await tx.wallet.create({
            data: {
                userId: newUser.id
            }
        })

        // Audit log
        await tx.auditLog.create({
            data: {
                userId: newUser.id,
                action: 'user.register',
                resourceType: 'user',
                resourceId: newUser.id,
                ipAddress: ip,
            }
        })

        return newUser
    })

    // Send verification email (async, non-blocking)
    try {
        await sendVerificationEmail(user.id, user.email, user.name)
    } catch (emailError) {
        console.error('Failed to send verification email:', emailError)
        // Don't fail registration if email fails
    }

    // Generate JWT token
    const token = await generateToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerified: user.emailVerified,
        version: 1 // Initial version
    })

    // Set auth cookie
    await setAuthCookie(token)

    auth_events_total.labels('register', 'success').inc()

    return NextResponse.json({
        success: true,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
        },
        token,
    })
}, {
    schema: registerSchema,
    rateLimit: 'auth',
    security: {
        requireBrowserCheck: true, // Block bots
        browserCheckLevel: 'basic',
        requireCaptcha: true // Enterprise protection
    }
})
