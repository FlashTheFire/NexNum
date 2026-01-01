import { NextResponse } from 'next/server'
import { prisma, ensureWallet } from '@/lib/db'
import { getCurrentUser } from '@/lib/jwt'
import { checkIdempotency } from '@/lib/redis'
import { topupSchema } from '@/lib/validation'
import { apiHandler } from '@/lib/api-handler'

export const POST = apiHandler(async (request, { body }) => {
    // Body validated by apiHandler
    if (!body) throw new Error('Body is required')

    const user = await getCurrentUser(request.headers)
    if (!user) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        )
    }

    const { amount, idempotencyKey } = body

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
}, {
    schema: topupSchema
})
