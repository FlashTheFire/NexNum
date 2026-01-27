import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { getCurrentUser } from '@/lib/auth/jwt'
import { WalletService } from '@/lib/wallet/wallet'

export async function GET(request: Request) {
    try {
        // Get current user from token
        const user = await getCurrentUser(request.headers)

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Get user data with wallet
        const dbUser = await prisma.user.findUnique({
            where: { id: user.userId },
            include: {
                wallet: true,
            }
        })

        if (!dbUser) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            )
        }

        // Get wallet balance (via Service)
        const balance = await WalletService.getBalance(dbUser.id)

        return NextResponse.json({
            success: true,
            user: {
                id: dbUser.id,
                name: dbUser.name,
                email: dbUser.email,
                role: dbUser.role,
                // @ts-ignore - Prisma linter sync issue
                preferredCurrency: dbUser.preferredCurrency,
                createdAt: dbUser.createdAt,
                emailVerified: dbUser.emailVerified,
            },
            wallet: {
                id: dbUser.wallet?.id,
                balance,
            }
        })

    } catch (error) {
        console.error('Get user error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

export async function PATCH(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await request.json()
        const { name, email, preferredCurrency } = body

        const updatedUser = await prisma.user.update({
            where: { id: user.userId },
            data: {
                name: name !== undefined ? name : undefined,
                email: email !== undefined ? email : undefined,
                // @ts-ignore - Prisma linter sync issue
                preferredCurrency: preferredCurrency !== undefined ? preferredCurrency : undefined,
            }
        })

        return NextResponse.json({
            success: true,
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role,
                // @ts-ignore - Prisma linter sync issue
                preferredCurrency: updatedUser.preferredCurrency,
                createdAt: updatedUser.createdAt,
            }
        })
    } catch (error) {
        console.error('Update user error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
