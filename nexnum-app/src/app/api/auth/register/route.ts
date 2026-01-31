import { prisma } from '@/lib/core/db'
import { generateToken, setAuthCookie } from '@/lib/auth/jwt'
import { registerSchema } from '@/lib/api/validation'
import bcrypt from 'bcryptjs'
import { apiHandler } from '@/lib/api/api-handler'
import { sendVerificationEmail } from '@/lib/auth/email-verification'
import { auth_events_total } from '@/lib/metrics'
import { ResponseFactory } from '@/lib/api/response-factory'
import { checkDisposableEmail, isDisposableCheckEnabled } from '@/lib/email/disposable-checker'

export const POST = apiHandler(async (request, { body, security }) => {
    // Body validation provided by registerSchema
    const { name, email, password } = body!
    const ip = security?.clientIp || 'unknown'

    // Check for disposable/temp email
    if (await isDisposableCheckEnabled()) {
        const emailCheck = await checkDisposableEmail(email)
        if (emailCheck.isDisposable) {
            auth_events_total.labels('register', 'failed_disposable_email').inc()
            return ResponseFactory.error(
                'Disposable email addresses are not allowed',
                400,
                'DISPOSABLE_EMAIL_NOT_ALLOWED'
            )
        }
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
    })

    if (existingUser) {
        auth_events_total.labels('register', 'failed_email_exists').inc()
        return ResponseFactory.error('Email already registered', 409)
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

    return ResponseFactory.success({
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
        }
    })
}, {
    schema: registerSchema,
    rateLimit: 'auth',
    security: {
        requireBrowserCheck: true,
        browserCheckLevel: 'basic',
        requireCaptcha: true
    }
})
