/**
 * Create Deposit API Endpoint
 * 
 * POST /api/wallet/deposit - Create new deposit order
 * GET /api/wallet/deposit - Get user's pending deposits
 * 
 * @module api/wallet/deposit
 */

import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'
import { getDepositService } from '@/lib/payment/deposit-service'
import { z } from 'zod'

// Validation schema
const createDepositSchema = z.object({
    amount: z.number().min(10, 'Minimum deposit is ₹10').max(50000, 'Maximum deposit is ₹50,000'),
    customerMobile: z.string().regex(/^[6-9]\d{9}$/, 'Invalid mobile number').optional(),
})

/**
 * POST /api/wallet/deposit
 * Create a new deposit order
 */
export const POST = apiHandler(async (request, { body, user }) => {
    if (!user) {
        return ResponseFactory.error('Unauthorized', 401, 'E_UNAUTHORIZED')
    }

    if (!body) {
        return ResponseFactory.error('Invalid request body', 400, 'E_INVALID_BODY')
    }

    const depositService = getDepositService()

    const deposit = await depositService.createDeposit({
        userId: user.userId,
        amount: body.amount,
        customerMobile: body.customerMobile,
    })

    return ResponseFactory.success({
        depositId: deposit.id,
        orderId: deposit.orderId,
        amount: deposit.amount,
        amountCurrency: 'INR' as const,
        qrCodeUrl: deposit.qrCodeUrl,
        paymentUrl: deposit.paymentUrl,
        expiresAt: deposit.expiresAt.toISOString(),
        expiresIn: deposit.expiresIn,
    }, 201)
}, {
    schema: createDepositSchema,
    requiresAuth: true,
    rateLimit: 'transaction',
})

/**
 * GET /api/wallet/deposit
 * Get user's pending deposits
 */
export const GET = apiHandler(async (request, { user }) => {
    if (!user) {
        return ResponseFactory.error('Unauthorized', 401, 'E_UNAUTHORIZED')
    }

    const depositService = getDepositService()
    const pendingDeposits = await depositService.getPendingDeposits(user.userId)

    // Get public config from UPIProvider
    const { getUPIProvider } = await import('@/lib/payment/upi-provider')
    const config = await getUPIProvider().getPublicConfig()

    return ResponseFactory.success({
        deposits: pendingDeposits.map((d) => ({
            depositId: d.id,
            orderId: d.orderId,
            amount: d.amount,
            amountCurrency: 'INR' as const,
            status: d.status,
            qrCodeUrl: d.qrCodeUrl,
            paymentUrl: d.paymentUrl,
            expiresAt: d.expiresAt.toISOString(),
            expiresIn: Math.max(0, Math.floor((d.expiresAt.getTime() - Date.now()) / 1000)),
            createdAt: d.createdAt.toISOString(),
        })),
        config: {
            minAmount: config.minAmount,
            maxAmount: config.maxAmount,
            timeoutMinutes: config.timeoutMinutes,
            bonusPercent: config.bonusPercent,
        },
    })
}, {
    requiresAuth: true,
})
