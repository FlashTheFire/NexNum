import { NextResponse } from 'next/server'
import { verifyEmail } from '@/lib/auth/email-verification'
import { rateLimit } from '@/lib/core/rate-limit'
import { prisma } from '@/lib/core/db'
import { generateToken, setAuthCookie } from '@/lib/auth/jwt'

// POST /api/auth/verify-email
// Public endpoint - No CSRF check required (token pattern)
export async function POST(request: Request) {
    try {
        // Rate limiting
        const ip = request.headers.get('x-forwarded-for') || '127.0.0.1'
        const { success } = await rateLimit(`auth:${ip}`, 5, 60) // 5 requests per minute
        if (!success) {
            return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
        }

        const body = await request.json()
        const { token } = body

        if (!token || typeof token !== 'string') {
            return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
        }

        const result = await verifyEmail(token)

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 })
        }

        // Re-fetch user to get the updated emailVerified status
        const user = await prisma.user.findUnique({
            where: { id: result.userId } // I need to make sure verifyEmail returns userId
        })

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        // Generate a new token with the verified status
        const newToken = await generateToken({
            userId: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            emailVerified: user.emailVerified,
            version: user.tokenVersion
        })

        // Set the new auth cookie
        await setAuthCookie(newToken)

        return NextResponse.json({
            success: true,
            message: 'Email verified successfully',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                emailVerified: user.emailVerified
            },
            token: newToken
        })
    } catch (error) {
        console.error('Verify email error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
