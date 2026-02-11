import { NextResponse } from 'next/server'
import { prisma, ensureWallet } from '@/lib/core/db'
import { getCurrentUser } from '@/lib/auth/jwt'
import { WalletService } from '@/lib/wallet/wallet'
import { getCurrencyService, toSupportedCurrency } from '@/lib/payment/currency-service'

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

        // Get balance in Points (internal unit)
        const balancePoints = await WalletService.getBalance(user.userId)

        // User's preferred display currency for show
        const dbUser = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { preferredCurrency: true }
        })
        const preferredCurrency = toSupportedCurrency(dbUser?.preferredCurrency)
        const currencyService = getCurrencyService()
        const displayAmount = await currencyService.pointsToFiat(balancePoints, preferredCurrency)

        return NextResponse.json({
            success: true,
            walletId,
            balance: balancePoints,
            currency: 'POINTS' as const,
            displayAmount: Math.round(displayAmount * 100) / 100,
            displayCurrency: preferredCurrency,
        }, {
            headers: {
                'Cache-Control': 'private, max-age=10, stale-while-revalidate=30'
            }
        })

    } catch (error) {
        console.error('Get balance error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
