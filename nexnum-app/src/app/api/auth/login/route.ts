import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateToken, setAuthCookie } from '@/lib/jwt'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { validate, loginSchema } from '@/lib/validation'
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
        const validation = validate(loginSchema, body)

        if (!validation.success) {
            const errorMessage = 'error' in validation ? validation.error : 'Invalid input'
            return NextResponse.json(
                { error: errorMessage },
                { status: 400 }
            )
        }

        const { email, password } = validation.data

        // Find user
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        })

        if (!user) {
            return NextResponse.json(
                { error: 'Invalid email or password' },
                { status: 401 }
            )
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.passwordHash)

        if (!isValidPassword) {
            return NextResponse.json(
                { error: 'Invalid email or password' },
                { status: 401 }
            )
        }

        // Generate JWT token
        const token = await generateToken({
            userId: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
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

    } catch (error) {
        console.error('Login error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
