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
                createdAt: dbUser.createdAt,
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
