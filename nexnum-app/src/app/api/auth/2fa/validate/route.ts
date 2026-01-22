import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/api-handler'
import { prisma } from '@/lib/core/db'
import { verifyTwoFactorToken } from '@/lib/auth/two-factor'
import { verifyToken, generateToken, setAuthCookie } from '@/lib/auth/jwt'
import { z } from 'zod'

const validateSchema = z.object({
    token: z.string().min(6).max(6),
    tempToken: z.string().optional() // Provided during login flow
})

export const POST = apiHandler(async (req, { body }) => {
    let userId: string | undefined
    let isLoginFlow = false

    const { token, tempToken } = body!

    // Case 1: Login flow (using tempToken)
    if (tempToken) {
        const payload = await verifyToken(tempToken)
        if (!payload || payload.role !== '2FA_PENDING') {
            return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
        }
        userId = payload.userId as string
        isLoginFlow = true
    } else {
        // Case 2: Post-login sensitive action (using standard auth)
        // NOT IMPLEMENTED FULLY YET - we rely on standard auth header usually.
        // But for this specific endpoint, we might expect standard auth.
        // Let's defer "Sensitive Action" logic and focus on Login flow.
        return NextResponse.json({ error: 'Temp token required for login validation' }, { status: 400 })
    }

    // Fetch user secret
    const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            tokenVersion: true,
            twoFactorSecret: true,
            twoFactorEnabled: true
        }
    })

    if (!dbUser || !dbUser.twoFactorEnabled || !dbUser.twoFactorSecret) {
        return NextResponse.json({ error: '2FA not enabled for this user' }, { status: 400 })
    }

    // Verify OTP
    const isValid = verifyTwoFactorToken(token, dbUser.twoFactorSecret)

    if (!isValid) {
        return NextResponse.json({ error: 'Invalid OTP code' }, { status: 400 })
    }

    // Success! Upgrade to full session
    if (isLoginFlow) {
        const fullToken = await generateToken({
            userId: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            role: dbUser.role,
            version: dbUser.tokenVersion
        })

        await setAuthCookie(fullToken)

        return NextResponse.json({
            success: true,
            data: {
                user: {
                    id: dbUser.id,
                    email: dbUser.email,
                    name: dbUser.name,
                    role: dbUser.role
                }
            },
            token: fullToken
        })
    }

    return NextResponse.json({ success: true })

}, {
    schema: validateSchema,
    rateLimit: 'auth'
})
