/**
 * Payment Gateway Settings Admin API
 * 
 * GET /api/admin/finance/payments - Get payment config (with masked tokens)
 * PATCH /api/admin/finance/payments - Update payment config
 * POST /api/admin/finance/payments - Test gateway connection
 * 
 * @module api/admin/finance/payments
 */

import { NextResponse } from 'next/server'
import { apiHandler } from '@/lib/api/api-handler'
import { ResponseFactory } from '@/lib/api/response-factory'
import { getPaymentSettingsService, UPIProviderMode, PaytmEnvironment } from '@/lib/payment/payment-settings'
import { z } from 'zod'
import { logger } from '@/lib/core/logger'

// ============================================================================
// Validation Schemas
// ============================================================================

const updatePaymentConfigSchema = z.object({
    // General
    paymentsEnabled: z.boolean().optional(),
    upiProviderMode: z.enum(['THIRD_PARTY', 'DIRECT_PAYTM', 'DISABLED']).optional(),

    // 3rd Party UPI Gateway
    upiApiToken: z.string().nullable().optional(),
    upiCreateOrderUrl: z.string().url().nullable().optional(),
    upiCheckStatusUrl: z.string().url().nullable().optional(),
    upiQrBaseUrl: z.string().url().nullable().optional(),

    // Direct Paytm
    paytmMerchantId: z.string().nullable().optional(),
    paytmMerchantKey: z.string().nullable().optional(),
    paytmWebsite: z.string().nullable().optional(),
    paytmIndustryType: z.string().nullable().optional(),
    paytmChannelId: z.string().nullable().optional(),
    paytmCallbackUrl: z.string().url().nullable().optional(),
    paytmEnvironment: z.enum(['STAGING', 'PRODUCTION']).optional(),

    // Transaction Limits
    depositMinAmount: z.number().min(1).max(100000).optional(),
    depositMaxAmount: z.number().min(100).max(1000000).optional(),
    depositTimeoutMins: z.number().min(5).max(120).optional(),
    maxPendingDeposits: z.number().min(1).max(10).optional(),

    // Deposit Bonus
    depositBonusPercent: z.number().min(0).max(100).optional(),
})

const testConnectionSchema = z.object({
    provider: z.enum(['THIRD_PARTY', 'DIRECT_PAYTM']),
})

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Mask sensitive tokens for display
 */
function maskToken(token: string | null): string | null {
    if (!token) return null
    if (token.length <= 8) return '****'
    return token.slice(0, 4) + '****' + token.slice(-4)
}

/**
 * Get config with masked sensitive values
 */
async function getMaskedConfig() {
    const service = getPaymentSettingsService()
    const config = await service.getConfig()

    return {
        // General
        paymentsEnabled: config.paymentsEnabled,
        upiProviderMode: config.upiProviderMode,

        // 3rd Party UPI Gateway (token masked)
        upiApiToken: maskToken(config.upiApiToken),
        upiApiTokenSet: !!config.upiApiToken,
        upiCreateOrderUrl: config.upiCreateOrderUrl,
        upiCheckStatusUrl: config.upiCheckStatusUrl,
        upiQrBaseUrl: config.upiQrBaseUrl,

        // Direct Paytm (key masked)
        paytmMerchantId: config.paytmMerchantId,
        paytmMerchantKey: maskToken(config.paytmMerchantKey),
        paytmMerchantKeySet: !!config.paytmMerchantKey,
        paytmWebsite: config.paytmWebsite,
        paytmIndustryType: config.paytmIndustryType,
        paytmChannelId: config.paytmChannelId,
        paytmCallbackUrl: config.paytmCallbackUrl,
        paytmEnvironment: config.paytmEnvironment,

        // Transaction Limits
        depositMinAmount: config.depositMinAmount,
        depositMaxAmount: config.depositMaxAmount,
        depositTimeoutMins: config.depositTimeoutMins,
        maxPendingDeposits: config.maxPendingDeposits,

        // Deposit Bonus
        depositBonusPercent: config.depositBonusPercent,
    }
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/admin/finance/payments
 * Get payment gateway configuration (with masked sensitive values)
 */
export const GET = apiHandler(async (request, { user }) => {
    // Require admin role
    if (!user || user.role !== 'ADMIN') {
        return ResponseFactory.error('Forbidden', 403, 'E_FORBIDDEN')
    }

    const config = await getMaskedConfig()
    const service = getPaymentSettingsService()
    const isOperational = await service.isOperational()

    return ResponseFactory.success({
        config,
        status: {
            isOperational,
            mode: config.upiProviderMode,
        },
    })
}, {
    requiresAuth: true,
})

/**
 * PATCH /api/admin/finance/payments
 * Update payment gateway configuration
 */
export const PATCH = apiHandler(async (request, { body, user }) => {
    // Require admin role
    if (!user || user.role !== 'ADMIN') {
        return ResponseFactory.error('Forbidden', 403, 'E_FORBIDDEN')
    }

    if (!body) {
        return ResponseFactory.error('Invalid request body', 400, 'E_INVALID_BODY')
    }

    const service = getPaymentSettingsService()

    // Validate min < max for deposit amounts
    if (body.depositMinAmount !== undefined && body.depositMaxAmount !== undefined) {
        if (body.depositMinAmount >= body.depositMaxAmount) {
            return ResponseFactory.error('Minimum amount must be less than maximum', 400, 'E_INVALID_LIMITS')
        }
    }

    // If only one is provided, validate against existing
    if (body.depositMinAmount !== undefined || body.depositMaxAmount !== undefined) {
        const currentConfig = await service.getConfig()
        const min = body.depositMinAmount ?? currentConfig.depositMinAmount
        const max = body.depositMaxAmount ?? currentConfig.depositMaxAmount
        if (min >= max) {
            return ResponseFactory.error('Minimum amount must be less than maximum', 400, 'E_INVALID_LIMITS')
        }
    }

    logger.info('[Admin] Updating payment settings', {
        userId: user.userId,
        updates: Object.keys(body),
    })

    await service.updateConfig(body)

    const newConfig = await getMaskedConfig()
    const isOperational = await service.isOperational()

    return ResponseFactory.success({
        config: newConfig,
        status: {
            isOperational,
            mode: newConfig.upiProviderMode,
        },
        message: 'Payment settings updated successfully',
    })
}, {
    schema: updatePaymentConfigSchema,
    requiresAuth: true,
})

/**
 * POST /api/admin/finance/payments
 * Test payment gateway connection
 */
export const POST = apiHandler(async (request, { body, user }) => {
    // Require admin role
    if (!user || user.role !== 'ADMIN') {
        return ResponseFactory.error('Forbidden', 403, 'E_FORBIDDEN')
    }

    if (!body) {
        return ResponseFactory.error('Invalid request body', 400, 'E_INVALID_BODY')
    }

    const service = getPaymentSettingsService()

    logger.info('[Admin] Testing payment gateway connection', {
        userId: user.userId,
        provider: body.provider,
    })

    if (body.provider === 'THIRD_PARTY') {
        const result = await service.testThirdPartyConnection()
        return ResponseFactory.success({
            provider: 'THIRD_PARTY',
            ...result,
        })
    }

    if (body.provider === 'DIRECT_PAYTM') {
        // For Paytm, we just check if credentials are configured
        const config = await service.getConfig()
        const hasCredentials = !!(config.paytmMerchantId && config.paytmMerchantKey)

        return ResponseFactory.success({
            provider: 'DIRECT_PAYTM',
            success: hasCredentials,
            message: hasCredentials
                ? 'Paytm credentials configured (connection test requires live transaction)'
                : 'Paytm credentials not configured',
        })
    }

    return ResponseFactory.error('Invalid provider', 400, 'E_INVALID_PROVIDER')
}, {
    schema: testConnectionSchema,
    requiresAuth: true,
})
