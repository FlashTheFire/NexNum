import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { generateToken, setAuthCookie } from '@/lib/auth/jwt'
import { registerSchema } from '@/lib/api/validation'
import bcrypt from 'bcryptjs'
import { apiHandler } from '@/lib/api/api-handler'
import { sendVerificationEmail } from '@/lib/auth/email-verification'
import { verifyCaptcha } from '@/lib/security/captcha'

export const POST = apiHandler(async (request, { body }) => {
    // Body validation provided by registerSchema
    if (!body) throw new Error('Body is required')
    const { name, email, password, captchaToken } = body

    // Verify CAPTCHA
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    const captchaResult = await verifyCaptcha(captchaToken, ip)
    if (!captchaResult.success) {
        return NextResponse.json(
            { error: captchaResult.error },
            { status: 400 }
        )
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
    })

    if (existingUser) {
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
        version: 1 // Initial version
    })

    // Set auth cookie
    await setAuthCookie(token)

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
        browserCheckLevel: 'basic'
    }
})
