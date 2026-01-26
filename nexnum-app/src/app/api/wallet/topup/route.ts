import { NextResponse } from 'next/server'
import { prisma, ensureWallet } from '@/lib/core/db'
import { WalletService } from '@/lib/wallet/wallet'
import { getCurrentUser } from '@/lib/auth/jwt'
import { checkIdempotency } from '@/lib/core/redis'
import { topupSchema } from '@/lib/api/validation'
import { apiHandler } from '@/lib/api/api-handler'
import { emitStateUpdate } from '@/lib/events/emitters/state-emitter'

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
        return NextResponse.json({
            success: true,
            message: 'Transaction already processed',
            duplicate: true,
        })
    }

    // Ensure wallet exists
    const walletId = await ensureWallet(user.userId)

    // PROCESS TOP-UP ATOMICALLY
    // Now using centralized Service for consistency
    const transaction = await WalletService.credit(
        user.userId,
        amount,
        'topup',
        `Wallet top-up: $${amount.toFixed(2)}`,
        idempotencyKey
    )

    // Audit log (best effort, non-blocking)
    prisma.auditLog.create({
        data: {
            userId: user.userId,
            action: 'wallet.topup',
            resourceType: 'wallet',
            resourceId: walletId,
            metadata: {
                amount,
                transactionId: transaction.id,
                idempotencyKey,
            },
            ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        }
    }).catch(console.error)

    // Get new balance
    // Faster to read from updated wallet than aggregate
    const newBalance = await WalletService.getBalance(user.userId)

    // Emit real-time update
    emitStateUpdate(user.userId, 'wallet', 'deposit').catch(() => { })

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
