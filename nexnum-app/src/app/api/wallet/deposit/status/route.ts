/**
 * Deposit Status API Endpoint
 * 
 * GET /api/wallet/deposit/status?id={depositId}
 * Check and return the status of a deposit
 * 
 * @module api/wallet/deposit/status
 */

import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'
import { getDepositService } from '@/lib/payment/deposit-service'

/**
 * GET /api/wallet/deposit/status
 * Check deposit status
 */
export const GET = apiHandler(async (request, { user }) => {
    if (!user) {
        return ResponseFactory.error('Unauthorized', 401, 'E_UNAUTHORIZED')
    }

    // Get deposit ID from query
    const { searchParams } = new URL(request.url)
    const depositId = searchParams.get('id')

    if (!depositId) {
        return ResponseFactory.error('Deposit ID is required', 400, 'E_MISSING_PARAM')
    }

    const depositService = getDepositService()
    const result = await depositService.checkStatus(depositId)

    // Verify ownership
    if (result.deposit && result.deposit.userId !== user.userId) {
        return ResponseFactory.error('Deposit not found', 404, 'E_NOT_FOUND')
    }

    const deposit = result.deposit
    const amount = result.amount ?? deposit?.amount
    const amountCurrency = deposit?.status === 'completed' ? 'POINTS' as const : 'INR' as const

    return ResponseFactory.success({
        status: result.status,
        message: result.message,
        amount: amount != null ? amount : undefined,
        amountCurrency,
        utr: result.utr,
        completedAt: deposit?.completedAt?.toISOString(),
        expiresIn: deposit?.expiresIn,
        deposit: deposit ? {
            id: deposit.id,
            orderId: deposit.orderId,
            amount: deposit.amount,
            amountCurrency: deposit.status === 'completed' ? 'POINTS' as const : 'INR' as const,
            status: deposit.status,
            qrCodeUrl: deposit.qrCodeUrl,
            expiresAt: deposit.expiresAt.toISOString(),
            expiresIn: deposit.expiresIn,
        } : null,
    })
}, {
    requiresAuth: true,
})
