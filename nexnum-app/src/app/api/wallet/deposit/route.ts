/**
 * Secure Create Deposit API Endpoint
 * 
 * POST /api/wallet/deposit - Create new deposit order with automatic INR conversion and anti-bot HMAC signature security
 * GET /api/wallet/deposit - Get user's pending deposits
 * 
 * @module api/wallet/deposit
 */

import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'
import { getDepositService } from '@/lib/payment/deposit-service'
import { z } from 'zod'
import crypto from 'crypto'

// Anti-bot secure deposit payload validation schema
const createDepositSchema = z.object({
    amount: z.number().min(1, 'Amount must be at least 1').max(500000, 'Amount exceeds maximum limit'),
    currency: z.string().default('INR'),
    currencyRate: z.number().optional(),
    taxPercent: z.number().optional(),
    discountPercent: z.number().optional(),
    customerMobile: z.string().optional(),
    idempotencyKey: z.string().optional(),
})

/**
 * Currency conversion and tax/discount calculation function
 */
export function calculateDepositINR(
    amount: number,
    currency: string = 'INR',
    currencyRate?: number,
    taxPercent: number = 0,
    discountPercent: number = 0
): { inrAmount: number; finalAmount: number; isConverted: boolean } {
    let rate = 1
    if (currencyRate && currencyRate > 0) {
        rate = currencyRate
    } else if (currency === 'USD') {
        rate = 88.5
    } else if (currency === 'EUR') {
        rate = 96.0
    } else if (currency === 'GBP') {
        rate = 112.0
    } else if (currency === 'RUB') {
        rate = 0.95
    }

    const baseInr = currency === 'INR' ? amount : amount * rate
    const taxedAmount = baseInr * (1 + (taxPercent / 100))
    const finalInr = taxedAmount * (1 - (discountPercent / 100))

    return {
        inrAmount: Math.round(baseInr * 100) / 100,
        finalAmount: Math.max(10, Math.round(finalInr * 100) / 100),
        isConverted: currency !== 'INR'
    }
}

/**
 * POST /api/wallet/deposit
 * Create a new deposit order with HMAC security signature
 */
export const POST = apiHandler(async (request, { body, user }) => {
    if (!user) {
        return ResponseFactory.error('Unauthorized', 401, 'E_UNAUTHORIZED')
    }

    if (!body) {
        return ResponseFactory.error('Invalid request body', 400, 'E_INVALID_BODY')
    }

    const { amount, currency = 'INR', currencyRate, taxPercent = 0, discountPercent = 0, customerMobile, idempotencyKey } = body

    // 1. Calculate INR converted amount
    const { finalAmount: inrAmount } = calculateDepositINR(amount, currency, currencyRate, taxPercent, discountPercent)

    // 2. Generate anti-bot HMAC security signature
    const secret = process.env.JWT_SECRET || 'nexnum_secure_deposit_key_2026'
    const timestamp = Date.now()
    const securitySignature = crypto
        .createHmac('sha256', secret)
        .update(`${user.userId}:${inrAmount}:${currency}:${timestamp}`)
        .digest('hex')

    const depositService = getDepositService()

    // 3. Create deposit in Next.js Prisma / Redis
    const deposit = await depositService.createDeposit({
        userId: user.userId,
        amount: inrAmount,
        customerMobile: customerMobile || '9999999999',
    })

    // 4. Sync deposit to nexnum-bot FastAPI endpoint with security signature
    try {
        const botUrl = process.env.NEXNUM_BOT_URL || 'http://nexnum-bot:8080'
        await fetch(`${botUrl}/api/v1/deposit/create`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Deposit-Signature': securitySignature,
                'X-Deposit-Timestamp': timestamp.toString()
            },
            body: JSON.stringify({
                user_id: user.userId,
                amount: inrAmount,
                gateway: 'UPI',
                idempotency_key: idempotencyKey || `dep:${deposit.id}`,
                security_signature: securitySignature
            })
        })
    } catch (_err) {
        // Non-blocking logger
    }

    return ResponseFactory.success({
        depositId: deposit.id,
        orderId: deposit.orderId,
        amount: deposit.amount,
        amountCurrency: 'INR' as const,
        originalAmount: amount,
        originalCurrency: currency,
        securitySignature,
        qrCodeUrl: deposit.qrCodeUrl,
        upiId: 'paytmqr281005050101nbxw0hx35cpo@paytm',
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
            upiId: 'paytmqr281005050101nbxw0hx35cpo@paytm',
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
            exchangeRates: config.exchangeRates,
            depositTaxPercent: config.depositTaxPercent,
            depositMarkupPercent: config.depositMarkupPercent,
        },
    })
}, {
    requiresAuth: true,
})
