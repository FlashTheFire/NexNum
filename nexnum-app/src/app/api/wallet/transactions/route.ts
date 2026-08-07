import { NextResponse } from 'next/server'
import { prisma, ensureWallet } from '@/lib/core/db'
import { getCurrentUser } from '@/lib/auth/jwt'
import { getCurrencyService } from '@/lib/currency/currency-service'

export async function GET(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Get query params
        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1')
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
        const type = searchParams.get('type') // topup, deposit, purchase, refund

        // Ensure wallet exists
        const walletId = await ensureWallet(user.userId)

        // Build where clause
        const where: any = { walletId }
        if (type) {
            where.type = type
        } else {
            // Exclude transient internal reservation & rollback entries from transaction history UI
            where.type = { notIn: ['reservation', 'rollback'] }
        }

        // Get transactions with pagination
        const [transactions, total] = await Promise.all([
            prisma.walletTransaction.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }),
            prisma.walletTransaction.count({ where }),
        ])

        const currencyService = getCurrencyService()

        // Map transactions with pre-computed currencyPrices
        const formattedTransactions = await Promise.all(
            transactions.map(async (tx) => {
                const points = Number(tx.amount) || 0
                const metadata = (tx.metadata as any) || {}

                // Compute base currencyPrices from points (USD = points / 100)
                const currencyPrices = await currencyService.pointsToAllFiat(points)

                // If transaction is a deposit with explicit fiat metadata, override exact fiat values
                if (metadata.depositFiatAmount && metadata.depositFiatCurrency) {
                    const fiatVal = parseFloat(metadata.depositFiatAmount)
                    if (!isNaN(fiatVal) && fiatVal > 0) {
                        currencyPrices[metadata.depositFiatCurrency] = fiatVal
                    }
                }

                // Status derivation
                const rawStatus = metadata.status || (tx.type === 'deposit' ? 'pending' : 'completed')
                const status = rawStatus === 'completed' || rawStatus === 'success' ? 'completed' : rawStatus

                return {
                    id: tx.id,
                    amount: points,
                    type: tx.type,
                    status,
                    description: tx.description,
                    createdAt: tx.createdAt,
                    currencyPrices,
                    metadata,
                }
            })
        )

        return NextResponse.json({
            success: true,
            transactions: formattedTransactions,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            }
        })

    } catch (error) {
        console.error('Get transactions error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
