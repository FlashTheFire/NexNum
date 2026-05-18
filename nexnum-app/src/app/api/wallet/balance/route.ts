import { NextResponse } from 'next/server'
import { prisma, ensureWallet } from '@/lib/core/db'
import { getCurrentUser } from '@/lib/auth/jwt'
import { WalletService } from '@/lib/wallet/wallet'
import { getCurrencyService, toSupportedCurrency } from '@/lib/currency/currency-service'

export async function GET(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Ensure wallet exists (internal side-effect only)
        await ensureWallet(user.userId)

        // Fetch balance in Points (internal unit — never exposed to client)
        const balancePoints = await WalletService.getBalance(user.userId)

        // User's preferred display currency
        const dbUser = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { preferredCurrency: true }
        })
        const preferredCurrency = toSupportedCurrency(dbUser?.preferredCurrency)
        const currencyService = getCurrencyService()

        // Convert to all fiat currencies — this is the ONLY value the client receives
        const multiBalance = await currencyService.pointsToAllFiat(balancePoints)

        // Points are NEVER sent to the client. Only pre-computed fiat values.
        return NextResponse.json({
            success: true,
            multiBalance,          // {USD, INR, RUB, EUR, GBP, CNY} — sole balance representation
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

