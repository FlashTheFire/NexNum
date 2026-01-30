import { NextResponse } from 'next/server'
import { ensureWallet } from '@/lib/core/db'
import { WalletService } from '@/lib/wallet/wallet'
import { checkIdempotency } from '@/lib/core/redis'
import { topupSchema } from '@/lib/api/validation'
import { apiHandler } from '@/lib/api/api-handler'
import { emitStateUpdate } from '@/lib/events/emitters/state-emitter'
import { ResponseFactory } from '@/lib/api/response-factory'
import { PaymentError } from '@/lib/payment/payment-errors'

/**
 * Professional Top-Up Endpoint
 * 
 * Handles wallet credits with strict idempotency and industrial error reporting.
 */
export const POST = apiHandler(async (request, { body, user }) => {
    // Body is validated by apiHandler schema
    if (!body || !user) {
        return ResponseFactory.error('Invalid request context', 400)
    }
    const { amount, idempotencyKey } = body

    // 1. Idempotency Guard (Redis-backed)
    const isNewRequest = await checkIdempotency(idempotencyKey)
    if (!isNewRequest) {
        return ResponseFactory.success({
            message: 'Transaction already processed',
            duplicate: true,
        })
    }

    try {
        // 2. Ensure Infrastructure
        await ensureWallet(user.userId)

        // 3. Process Atmoic Transaction
        const transaction = await WalletService.credit(
            user.userId,
            amount,
            'topup',
            `Wallet top-up: $${amount.toFixed(2)}`,
            idempotencyKey
        )

        // 4. Update State (Real-time and Sync)
        const newBalance = await WalletService.getBalance(user.userId)
        emitStateUpdate(user.userId, 'wallet', 'deposit').catch(() => { })

        // 5. Success Envelope
        return ResponseFactory.success({
            transaction: {
                id: transaction.id,
                amount: Number(transaction.amount),
                type: transaction.type,
                createdAt: transaction.createdAt,
            },
            newBalance,
        })

    } catch (error: unknown) {
        // Specialized Financial Error Handling
        if (error instanceof PaymentError) {
            return ResponseFactory.error(error.message, error.statusCode, error.code)
        }
        throw error // Let global handler catch unknown errors
    }
}, {
    schema: topupSchema,
    requiresAuth: true
})
