import { NextResponse } from 'next/server'
import { prisma, ensureWallet } from '@/lib/db'
import { getCurrentUser } from '@/lib/jwt'
import { WalletService } from '@/lib/wallet'

export async function GET(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Ensure wallet exists
        const walletId = await ensureWallet(user.userId)

        // Get balance (via Service)
        const balance = await WalletService.getBalance(user.userId)

        return NextResponse.json({
            success: true,
            walletId,
            balance,
        })

    } catch (error) {
        console.error('Get balance error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
