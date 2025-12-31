import { NextResponse } from 'next/server'
import { prisma, ensureWallet } from '@/lib/db'
import { getCurrentUser } from '@/lib/jwt'
import { rateLimit, getRateLimitHeaders } from '@/lib/rate-limit'
import { checkIdempotency } from '@/lib/redis'
import { validate, topupSchema } from '@/lib/validation'

export async function POST(request: Request) {
    try {
        const user = await getCurrentUser(request.headers)

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Rate limiting
        const rateLimitResult = await rateLimit(user.userId, 'wallet')

        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
            )
        }

        // Parse and validate input
        const body = await request.json()
        const validation = validate(topupSchema, body)

        if (!validation.success) {
            const errorMessage = 'error' in validation ? validation.error : 'Invalid input'
            return NextResponse.json(
                { error: errorMessage },
                { status: 400 }
            )
        }

        const { amount, idempotencyKey } = validation.data

        // Check idempotency (prevent duplicate transactions)
        const isNewRequest = await checkIdempotency(idempotencyKey)

        if (!isNewRequest) {
            // Return success for duplicate request (idempotent)
            return NextResponse.json({
                success: true,
                message: 'Transaction already processed',
                duplicate: true,
            })
        }

        // Ensure wallet exists
        const walletId = await ensureWallet(user.userId)

        // Create transaction (MOCK - in production, this would be after payment gateway confirmation)
        const transaction = await prisma.$transaction(async (tx) => {
            // Create wallet transaction (positive amount = credit)
            const walletTx = await tx.walletTransaction.create({
                data: {
                    walletId,
                    amount: amount, // Positive = credit
                    type: 'topup',
                    description: `Wallet top-up: $${amount.toFixed(2)}`,
                    idempotencyKey,
                }
            })

            // Audit log
            await tx.auditLog.create({
                data: {
                    userId: user.userId,
                    action: 'wallet.topup',
                    resourceType: 'wallet',
                    resourceId: walletId,
                    metadata: {
                        amount,
                        transactionId: walletTx.id,
                        idempotencyKey,
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                }
            })

            return walletTx
        })

        // Get new balance
        const result = await prisma.walletTransaction.aggregate({
            where: { walletId },
            _sum: { amount: true }
        })
        const newBalance = Number(result._sum.amount ?? 0)

        return NextResponse.json({
            success: true,
            transaction: {
                id: transaction.id,
                amount: Number(transaction.amount),
                type: transaction.type,
                createdAt: transaction.createdAt,
            },
            newBalance,
        })

    } catch (error) {
        console.error('Topup error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
