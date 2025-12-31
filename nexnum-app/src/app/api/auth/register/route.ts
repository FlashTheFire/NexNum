import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateToken, setAuthCookie } from '@/lib/jwt'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { validate, registerSchema } from '@/lib/validation'
import bcrypt from 'bcryptjs'

export async function POST(request: Request) {
    try {
        // Rate limiting
        const ip = request.headers.get('x-forwarded-for') || 'unknown'
        const rateLimitResult = await rateLimit(ip, 'auth')

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
            )
        }

        // Parse and validate input
        const body = await request.json()
        const validation = validate(registerSchema, body)

        if (!validation.success) {
            const errorMessage = 'error' in validation ? validation.error : 'Invalid input'
            return NextResponse.json(
                { error: errorMessage },
                { status: 400 }
            )
        }

        const { name, email, password } = validation.data

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

        // Generate JWT token
        const token = await generateToken({
            userId: user.id,
            email: user.email,
            name: user.name,
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

    } catch (error) {
        console.error('Registration error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
