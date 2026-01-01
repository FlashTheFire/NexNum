import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateToken, setAuthCookie } from '@/lib/jwt'
import { registerSchema } from '@/lib/validation'
import bcrypt from 'bcryptjs'
import { apiHandler } from '@/lib/api-handler'

export const POST = apiHandler(async (request, { body }) => {
    // Body validation provided by registerSchema
    if (!body) throw new Error('Body is required')
    const { name, email, password } = body

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
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
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
}, {
    schema: registerSchema
})
