import { NextResponse } from 'next/server'
import { sendVerificationEmail } from '@/lib/auth/email-verification'
import { prisma } from '@/lib/core/db'
import { verifyToken } from '@/lib/auth/jwt'

// POST /api/auth/resend-verification
export async function POST(request: Request) {
    try {
        // Get token from Authorization header
        const authHeader = request.headers.get('Authorization')
        const token = authHeader?.replace('Bearer ', '')

        if (!token) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
        }

        // Verify JWT and get user ID
        const payload = await verifyToken(token)
        if (!payload?.userId) {
            return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
        }

        // Get user details
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: { id: true, email: true, name: true, emailVerified: true }
        })

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        if (user.emailVerified) {
            return NextResponse.json({ error: 'Email already verified' }, { status: 400 })
        }

        // Send new verification email
        const sent = await sendVerificationEmail(user.id, user.email, user.name || 'User')

        if (!sent) {
            return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
        }

        return NextResponse.json({ success: true, message: 'Verification email sent' })

    } catch (error: any) {
        console.error('Resend verification error:', error)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
