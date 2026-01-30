import { NextResponse } from 'next/server'
import { prisma } from '@/lib/core/db'
import { Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth/jwt'
import { purchaseNumberSchema } from '@/lib/api/validation'
import { purchase_duration_seconds, wallet_transactions_total, provider_api_calls_total } from '@/lib/metrics'
import { smsProvider } from '@/lib/providers'
import { apiHandler } from '@/lib/api/api-handler'
import { getOfferForPurchase } from '@/lib/search/search'
import { WalletService } from '@/lib/wallet/wallet'
import { logger } from '@/lib/core/logger'
import { emitStateUpdate } from '@/lib/events/emitters/state-emitter'
import { withMetrics } from '@/lib/monitoring/http-metrics'
import { currencyService } from '@/lib/currency/currency-service'
import { ResponseFactory } from '@/lib/api/response-factory'
import { PaymentError } from '@/lib/payment/payment-errors'
import { NumberResult } from '@/lib/providers/types'
import {
    validatePurchaseInput,
    checkUserEligibility,
    acquireAtomicPurchaseLock,
    releaseAtomicPurchaseLock,
    recordDailySpend,
    generatePurchaseCorrelationId
} from '@/lib/purchase/security'

/**
 * Purchase Flow: Hardened Edition
 * 
 * Features:
 * - Smart Routing (Best Route) integrated into transactional flow
 * - Financial tracking (providerCost, profit)
 * - Atomic distributed locking
 * - Prometheus metrics
 * - Multi-Currency Support (maxPrice conversion)
 */
export const POST = withMetrics(apiHandler(async (request, { body }) => {
    const correlationId = generatePurchaseCorrelationId()
    let lockToken = ''
    let lockAcquired = false
    let purchaseOrderId: string | null = null
    let activationId: string | null = null
    let reservedAmount = 0
    let providerResult: NumberResult | null = null

    const user = await getCurrentUser(request.headers)
    if (!user) {
        return ResponseFactory.error('Unauthorized', 401)
    }

    // ============================================
    // PHASE 1: INPUT VALIDATION
    // ============================================

    const validation = validatePurchaseInput({
        countryCode: body?.countryCode,
        serviceCode: body?.serviceCode,
        countryId: body?.countryId,
        serviceId: body?.serviceId,
        operatorId: body?.operatorId,
        provider: body?.provider,
        idempotencyKey: body?.idempotencyKey
    })

    if (!validation.valid || !validation.sanitized) {
        return ResponseFactory.error(validation.errors[0] || 'Validation failed', 400)
    }

    const { countryCode, serviceCode, countryId, serviceId, operatorId, provider, idempotencyKey } = validation.sanitized
    const useBestRoute = body?.useBestRoute === true

    // NEW: Currency Handling
    const currency = body?.currency || 'USD'
    let maxPrice = typeof body?.maxPrice === 'number' ? body.maxPrice : undefined

    // Convert User Currency maxPrice -> System POINTS (COINS)
    if (maxPrice !== undefined && currency !== 'POINTS') {
        maxPrice = await currencyService.convert(maxPrice, currency, 'POINTS')
    }

    let currentOffer: any = null
    let mode = useBestRoute && !provider ? 'best_route' : 'direct'

    // ============================================
    // PHASE 2: RESOLVE OFFER & PRICE
    // ============================================

    let resolvedProvider: string | undefined = undefined
    if (provider) {
        const slug = await smsProvider.resolveProviderSlug(provider)
        resolvedProvider = slug || provider.toLowerCase()
    }

    // Resolve inputs for offer lookup
    const serviceInput = serviceId !== undefined ? serviceId : serviceCode!
    const countryInput = countryId !== undefined ? countryId : countryCode!

    if (mode === 'direct') {
        currentOffer = await getOfferForPurchase(serviceInput, countryInput, operatorId ? parseInt(operatorId, 10) : undefined, resolvedProvider)
        if (!currentOffer) return ResponseFactory.error('Offer not available', 404, 'E_OFFER_NOT_FOUND')
    } else {
        // Best Route: Get baseline from lowest available offer
        currentOffer = await getOfferForPurchase(serviceInput, countryInput, undefined, undefined)
        if (!currentOffer) return ResponseFactory.error('No providers available for this route', 404, 'E_NO_ROUTE')
    }

    const freshPrice = currentOffer.price
    const serviceName = currentOffer.serviceName
    const countryName = currentOffer.countryName
    let providerName = currentOffer.provider || 'unknown'

    // Check Max Price Constraint strictly
    if (maxPrice !== undefined && freshPrice > maxPrice) {
        return ResponseFactory.error(
            `Price ${freshPrice} exceeds your limit of ${maxPrice}`,
            400,
            'E_PRICE_EXCEEDED',
            { price: freshPrice, limit: maxPrice }
        )
    }

    // ============================================
    // PHASE 3: USER ELIGIBILITY
    // ============================================

    const eligibility = await checkUserEligibility(user.userId, freshPrice)
    if (!eligibility.eligible) return ResponseFactory.error(eligibility.reason || 'User not eligible', 403, 'E_INELIGIBLE')

    // ============================================
    // PHASE 4: ATOMIC LOCK
    // ============================================

    const lockResult = await acquireAtomicPurchaseLock(user.userId)
    if (!lockResult.acquired) return ResponseFactory.error('Purchase already in progress', 429, 'E_LOCK_CONTENTION')
    lockAcquired = true
    lockToken = lockResult.token

    try {
        // ============================================
        // PHASE 5: RESERVE FUNDS
        // ============================================

        await prisma.$transaction(async (tx) => {
            await WalletService.reserve(user.userId, freshPrice, 'init', `Reserve: ${serviceName}`, idempotencyKey, tx)

            const po = await tx.purchaseOrder.create({
                data: {
                    userId: user.userId,
                    serviceName,
                    countryName,
                    amount: new Prisma.Decimal(freshPrice),
                    status: 'PENDING',
                    idempotencyKey,
                    expiresAt: new Date(Date.now() + 5 * 60 * 1000)
                }
            })
            purchaseOrderId = po.id

            const activation = await tx.activation.create({
                data: {
                    userId: user.userId,
                    price: new Prisma.Decimal(freshPrice),
                    state: 'RESERVED',
                    serviceName,
                    countryCode: currentOffer.countryCode,
                    countryName,
                    operatorId: operatorId || null,
                    providerId: providerName,
                    providerCost: 0,
                    profit: 0,
                    idempotencyKey: idempotencyKey ? `activation_${idempotencyKey}` : null,
                    reservedTxId: idempotencyKey || null
                } as any
            })
            activationId = activation.id
        }, { timeout: 30000 })

        reservedAmount = freshPrice

        // ============================================
        // PHASE 6: CALL PROVIDER (with Fallback for Best Route)
        // ============================================

        const startProvider = Date.now()
        try {
            if (mode === 'best_route') {
                const { SmartSmsRouter } = await import('@/lib/providers/smart-router')
                const smartRouter = new SmartSmsRouter()
                // Pass maxPrice (in POINTS) to smart router
                const result = await smartRouter.purchaseWithBestRoute(countryInput, serviceInput, maxPrice)

                if (!result.success) throw new Error(`Best route failed: ${result.attemptsLog.map((a: any) => `${a.provider}: ${a.error}`).join(', ')}`)

                providerResult = result.number || null
                providerName = result.provider || providerName
            } else {
                providerResult = await smsProvider.getNumber(currentOffer.providerCountryCode, currentOffer.providerServiceCode, {
                    provider: providerName,
                    expectedPrice: freshPrice
                })
            }

            const dur = (Date.now() - startProvider) / 1000
            purchase_duration_seconds.labels('provider_call', providerName, countryName).observe(dur)
            provider_api_calls_total.labels(providerName, 'getNumber', 'success').inc()

        } catch (providerErr: any) {
            const dur = (Date.now() - startProvider) / 1000
            purchase_duration_seconds.labels('provider_call', providerName, countryName).observe(dur)
            provider_api_calls_total.labels(providerName, 'getNumber', 'error').inc()

            // Rollback
            await prisma.$transaction(async (tx) => {
                await WalletService.rollback(user.userId, freshPrice, purchaseOrderId!, 'Provider Fail', tx)
                await tx.purchaseOrder.update({ where: { id: purchaseOrderId! }, data: { status: 'FAILED' } })
                if (activationId) await tx.activation.update({ where: { id: activationId }, data: { state: 'FAILED' } })
            })

            await releaseAtomicPurchaseLock(user.userId, lockToken)
            const providerError = providerErr as Error
            return ResponseFactory.error(providerError.message || 'Provider unavailable', 503, 'E_PROVIDER_FAIL')
        }

        if (!providerResult) {
            throw new Error('Provider result is missing after successful call')
        }

        // ============================================
        // PHASE 7: COMMIT & CREATE NUMBER
        // ============================================

        const resultNumber = await prisma.$transaction(async (tx) => {
            const { formatPhoneNumber } = await import('@/lib/utils/phone-parser')
            const parsedPhone = formatPhoneNumber(providerResult!.phoneNumber)

            const newNumber = await tx.number.create({
                data: {
                    phoneNumber: providerResult!.phoneNumber,
                    phoneCountryCode: parsedPhone.countryCode || null,
                    phoneNationalNumber: parsedPhone.nationalNumber || null,
                    countryName,
                    countryCode: currentOffer.countryCode,
                    serviceName,
                    serviceCode: currentOffer.serviceCode,
                    price: freshPrice,
                    providerCost: providerResult!.rawPrice || 0,
                    profit: freshPrice - (providerResult!.rawPrice || 0),
                    status: 'active',
                    owner: { connect: { id: user.userId } },
                    activationId: providerResult!.activationId,
                    provider: providerName,
                    idempotencyKey,
                    expiresAt: providerResult!.expiresAt,
                    serviceIconUrl: currentOffer.serviceIcon,
                    countryIconUrl: currentOffer.countryIcon,
                }
            })

            await WalletService.commit(user.userId, freshPrice, newNumber.id, `Purchase: ${serviceName}`, `tx_${purchaseOrderId}`, tx)
            await tx.purchaseOrder.update({ where: { id: purchaseOrderId! }, data: { status: 'COMPLETED', provider: providerName, activationId: providerResult!.activationId } })


            // @ts-ignore - Prisma ActivationState typing issue
            await tx.activation.update({
                where: { id: activationId! },
                data: {
                    state: 'ACTIVE',
                    providerActivationId: providerResult!.activationId,
                    phoneNumber: providerResult!.phoneNumber,
                    expiresAt: providerResult!.expiresAt,
                    providerCost: providerResult!.rawPrice || 0,
                    profit: freshPrice - (providerResult!.rawPrice || 0),
                    numberId: newNumber.id,
                    capturedTxId: `tx_${purchaseOrderId}`
                }
            })

            return newNumber
        }, { timeout: 20000 })

        await recordDailySpend(user.userId, freshPrice)
        await releaseAtomicPurchaseLock(user.userId, lockToken)
        emitStateUpdate(user.userId, 'all', 'number_purchased').catch(() => { })

        return ResponseFactory.success({ number: resultNumber })

    } catch (err: unknown) {
        const error = err as Error
        logger.error(`[PURCHASE] Critical Error`, { error: error.message, correlationId })
        if (lockAcquired) await releaseAtomicPurchaseLock(user.userId, lockToken)

        // Basic cleanup
        if (purchaseOrderId && reservedAmount > 0) {
            try {
                await WalletService.rollback(user.userId, reservedAmount, purchaseOrderId, 'Crash Rollback')
                await prisma.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: 'FAILED' } })
                if (activationId) await prisma.activation.update({ where: { id: activationId }, data: { state: 'FAILED' } })
            } catch (e) { }
        }

        if (err instanceof PaymentError) {
            return ResponseFactory.error(err.message, err.statusCode, err.code)
        }

        return ResponseFactory.error(error.message || 'Purchase processing failed', 500, 'E_PURCHASE_FAIL')
    }
}, { schema: purchaseNumberSchema }), { route: '/api/numbers/purchase' })
