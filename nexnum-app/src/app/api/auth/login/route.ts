import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateToken, setAuthCookie } from '@/lib/jwt'
import { loginSchema } from '@/lib/validation'
import bcrypt from 'bcryptjs'
import { apiHandler } from '@/lib/api-handler'

export const POST = apiHandler(async (request, { body }) => {
    // Body is already validated by apiHandler using loginSchema
    if (!body) throw new Error('Body is required')
    const { email, password } = body

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
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
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
}, {
    schema: loginSchema
})
