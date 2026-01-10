import { NextResponse } from 'next/server'
import { prisma, ensureWallet } from '@/lib/core/db'
import { getCurrentUser } from '@/lib/auth/jwt'

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
        const type = searchParams.get('type') // topup, purchase, refund

        // Ensure wallet exists
        const walletId = await ensureWallet(user.userId)

        // Build where clause
        const where: any = { walletId }
        if (type) {
            where.type = type
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

        return NextResponse.json({
            success: true,
            transactions: transactions.map(tx => ({
                id: tx.id,
                amount: Number(tx.amount),
                type: tx.type,
                description: tx.description,
                createdAt: tx.createdAt,
            })),
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
