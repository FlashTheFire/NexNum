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
import { getCurrencyService, toSupportedCurrency } from '@/lib/currency/currency-service'
import { ResponseFactory } from '@/lib/api/response-factory'
import { PaymentError } from '@/lib/payment/payment-errors'
import { NumberResult } from '@/lib/providers/types'
import { captureError, addBreadcrumb } from '@/lib/monitoring/sentry'
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
        logger.warn('[PURCHASE_UNAUTHORIZED] Purchase attempt without valid authorization header', { correlationId })
        return ResponseFactory.error('Unauthorized', 401)
    }

    logger.info('[PURCHASE_INIT] Purchase request received', {
        context: 'PURCHASE',
        correlationId,
        userId: user.userId,
        body: {
            countryCode: body?.countryCode,
            serviceCode: body?.serviceCode,
            countryId: body?.countryId,
            serviceId: body?.serviceId,
            operatorId: body?.operatorId,
            provider: body?.provider,
            idempotencyKey: body?.idempotencyKey,
            useBestRoute: body?.useBestRoute,
            currency: body?.currency,
            maxPrice: body?.maxPrice
        }
    })

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
        logger.warn('[PURCHASE_VALIDATION_FAIL] Input validation failed', {
            context: 'PURCHASE',
            correlationId,
            userId: user.userId,
            errors: validation.errors
        })
        return ResponseFactory.error(validation.errors[0] || 'Validation failed', 400)
    }

    const { countryCode, serviceCode, countryId, serviceId, operatorId, provider, idempotencyKey } = validation.sanitized
    const useBestRoute = body?.useBestRoute === true

    addBreadcrumb('purchase', 'Purchase workflow initiated', {
        correlationId,
        userId: user.userId,
        countryCode,
        serviceCode,
        provider
    })

    // IDEMPOTENCY: Early-exit if this purchase was already processed
    if (idempotencyKey) {
        const existing = await prisma.purchaseOrder.findUnique({
            where: { idempotencyKey },
            select: { id: true, status: true }
        })
        if (existing) {
            logger.info('[PURCHASE_IDEMPOTENT_REPLAY] Replaying existing purchase order', {
                context: 'PURCHASE',
                correlationId,
                userId: user.userId,
                idempotencyKey,
                purchaseOrderId: existing.id,
                status: existing.status
            })
            return ResponseFactory.success({
                idempotentReplay: true,
                purchaseOrderId: existing.id,
                status: existing.status
            })
        }
    }

    // NEW: Currency Handling
    const currency = body?.currency || 'USD'
    let maxPrice = typeof body?.maxPrice === 'number' ? body.maxPrice : undefined

    // Convert User Currency maxPrice -> System POINTS (single source: payment currency-service)
    if (maxPrice !== undefined && currency !== 'POINTS') {
        maxPrice = await getCurrencyService().fiatToPoints(maxPrice, toSupportedCurrency(currency))
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
        if (!currentOffer) {
            logger.warn('[PURCHASE_OFFER_NOT_FOUND] Offer not available for requested provider', {
                context: 'PURCHASE',
                correlationId,
                userId: user.userId,
                serviceInput,
                countryInput,
                operatorId,
                resolvedProvider
            })
            return ResponseFactory.error('Offer not available', 404, 'E_OFFER_NOT_FOUND')
        }
    } else {
        // Best Route: Get baseline from lowest available offer
        currentOffer = await getOfferForPurchase(serviceInput, countryInput, undefined, undefined)
        if (!currentOffer) {
            logger.warn('[PURCHASE_NO_ROUTE] No active provider routes available', {
                context: 'PURCHASE',
                correlationId,
                userId: user.userId,
                serviceInput,
                countryInput
            })
            return ResponseFactory.error('No providers available for this route', 404, 'E_NO_ROUTE')
        }
    }

    const freshPrice = Number(currentOffer.pointPrice ?? currentOffer.price ?? 0)
    const serviceName = currentOffer.serviceName
    const countryName = currentOffer.countryName
    const resolvedCountryCode = String(currentOffer.countryCode || currentOffer.providerCountryCode || countryCode || countryInput || 'unknown')
    const resolvedServiceCode = String(currentOffer.serviceCode || currentOffer.providerServiceCode || serviceCode || serviceInput || 'unknown')
    let providerName = currentOffer.provider || 'unknown'

    logger.info('[PURCHASE_OFFER_RESOLVED] Offer resolved successfully', {
        context: 'PURCHASE',
        correlationId,
        userId: user.userId,
        mode,
        providerName,
        serviceName,
        countryName,
        freshPrice,
        stock: currentOffer.stock,
        candidatesCount: currentOffer.purchaseCandidates?.length || 0
    })

    // Check Max Price Constraint strictly
    if (maxPrice !== undefined && freshPrice > maxPrice) {
        logger.warn('[PURCHASE_PRICE_EXCEEDED] Fresh offer price exceeds maxPrice ceiling', {
            context: 'PURCHASE',
            correlationId,
            userId: user.userId,
            freshPrice,
            maxPrice
        })
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
    if (!eligibility.eligible) {
        logger.warn(`[PURCHASE_ELIGIBILITY_DENIED] Eligibility denied for user ${user.userId}: ${eligibility.reason}`, {
            context: 'PURCHASE',
            correlationId,
            userId: user.userId,
            code: eligibility.code,
            reason: eligibility.reason,
            currentBalance: eligibility.details.currentBalance,
            requiredAmount: freshPrice,
            dailySpendRemaining: eligibility.details.dailySpendRemaining,
            service: serviceName,
            country: countryName
        })
        const statusCode = eligibility.code === 'E_INSUFFICIENT_FUNDS' ? 400 : (eligibility.code === 'E_VELOCITY_LIMIT' ? 429 : 403)
        return ResponseFactory.error(
            eligibility.reason || 'User not eligible',
            statusCode,
            eligibility.code || 'E_INELIGIBLE',
            {
                currentBalance: eligibility.details.currentBalance,
                requiredAmount: eligibility.details.requiredAmount,
                dailySpendRemaining: eligibility.details.dailySpendRemaining
            }
        )
    }

    logger.info('[PURCHASE_ELIGIBILITY_PASSED] User eligibility verified', {
        context: 'PURCHASE',
        correlationId,
        userId: user.userId,
        currentBalance: eligibility.details.currentBalance,
        requiredAmount: freshPrice,
        dailySpendRemaining: eligibility.details.dailySpendRemaining
    })

    // ============================================
    // PHASE 4: ATOMIC LOCK
    // ============================================

    const lockResult = await acquireAtomicPurchaseLock(user.userId)
    if (!lockResult.acquired) {
        logger.warn('[PURCHASE_LOCK_CONFLICT] Atomic purchase lock contention', {
            context: 'PURCHASE',
            correlationId,
            userId: user.userId,
            reason: lockResult.reason
        })
        return ResponseFactory.error('Purchase already in progress', 429, 'E_LOCK_CONTENTION')
    }
    lockAcquired = true
    lockToken = lockResult.token
    logger.info('[PURCHASE_LOCK_ACQUIRED] Atomic purchase lock acquired', {
        context: 'PURCHASE',
        correlationId,
        userId: user.userId,
        lockToken
    })

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
                    countryCode: resolvedCountryCode,
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
        logger.info('[PURCHASE_RESERVE_SUCCESS] Funds reserved and pending order created', {
            context: 'PURCHASE',
            correlationId,
            userId: user.userId,
            purchaseOrderId,
            activationId,
            reservedAmount: freshPrice
        })

        // ============================================
        // PHASE 6: CALL PROVIDER (with Fallback for Best Route)
        // ============================================

        const startProvider = Date.now()
        logger.info('[PURCHASE_PROVIDER_CALL_START] Dispatching request to provider', {
            context: 'PURCHASE',
            correlationId,
            userId: user.userId,
            providerName,
            mode,
            providerCountryCode: currentOffer.providerCountryCode,
            providerServiceCode: currentOffer.providerServiceCode,
            expectedPrice: freshPrice
        })

        try {
            if (mode === 'best_route') {
                const { SmartSmsRouter } = await import('@/lib/providers/smart-router')
                const smartRouter = new SmartSmsRouter()
                // Pass maxPrice (in POINTS) to smart router
                const result = await smartRouter.purchaseWithBestRoute(countryInput, serviceInput, maxPrice)

                if (!result.success) {
                    logger.warn('[PURCHASE_BEST_ROUTE_EXHAUSTED] All best-route providers failed', {
                        context: 'PURCHASE',
                        correlationId,
                        attemptsLog: result.attemptsLog
                    })
                    throw new Error('No numbers available right now. Please try again shortly.')
                }

                providerResult = result.number || null
                providerName = result.provider || providerName
            } else {
                providerResult = await smsProvider.getNumber(currentOffer.providerCountryCode, currentOffer.providerServiceCode, {
                    provider: providerName,
                    expectedPrice: freshPrice,
                    maxPrice: currentOffer.rawPrice || currentOffer.purchaseCandidates?.[0]?.rawCost,
                    purchaseCandidates: currentOffer.purchaseCandidates,
                    operator: currentOffer.operator
                })
            }

            const dur = (Date.now() - startProvider) / 1000
            purchase_duration_seconds.labels('provider_call', providerName, countryName).observe(dur)
            provider_api_calls_total.labels(providerName, 'getNumber', 'success').inc()

            logger.info('[PURCHASE_PROVIDER_CALL_SUCCESS] Provider returned activation number', {
                context: 'PURCHASE',
                correlationId,
                userId: user.userId,
                providerName,
                phoneNumber: providerResult!.phoneNumber,
                activationId: providerResult!.activationId,
                providerCost: providerResult!.rawPrice,
                durationMs: Math.round(dur * 1000)
            })

        } catch (providerErr: any) {
            const dur = (Date.now() - startProvider) / 1000
            purchase_duration_seconds.labels('provider_call', providerName, countryName).observe(dur)
            provider_api_calls_total.labels(providerName, 'getNumber', 'error').inc()

            logger.error('[PURCHASE_PROVIDER_CALL_FAIL] Provider request failed, rolling back reserved funds', {
                context: 'PURCHASE',
                correlationId,
                userId: user.userId,
                providerName,
                error: providerErr.message,
                durationMs: Math.round(dur * 1000)
            })

            // Rollback
            await prisma.$transaction(async (tx) => {
                await WalletService.rollback(
                    user.userId,
                    freshPrice,
                    purchaseOrderId!,
                    'Provider Fail',
                    undefined, // idempotencyKey
                    tx
                )
                await tx.purchaseOrder.update({ where: { id: purchaseOrderId! }, data: { status: 'FAILED' } })
                if (activationId) await tx.activation.update({ where: { id: activationId }, data: { state: 'FAILED' } })
            })

            await releaseAtomicPurchaseLock(user.userId, lockToken)

            // Return a clean, user-friendly error — never leak internal provider names or debug info
            return ResponseFactory.error(
                'No numbers available right now. Please try again shortly.',
                503,
                'E_NO_NUMBERS'
            )
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
                    countryCode: resolvedCountryCode,
                    serviceName,
                    serviceCode: resolvedServiceCode,
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
        emitStateUpdate(user.userId, 'all', 'number_purchased').catch(err => logger.warn('[PURCHASE] emitStateUpdate failed', { error: err }))

        // Register in Zero-DB Redis Active Stream for instant 3s Tier 1 polling
        const { ActiveOrderStream } = await import('@/lib/activation/active-order-stream')
        ActiveOrderStream.addActiveOrder({
            numberId: resultNumber.id,
            activationId: providerResult!.activationId,
            userId: user.userId,
            provider: providerName,
            providerId: providerName, // Provider name used as ID throughout the system
            phoneNumber: resultNumber.phoneNumber,
            countryCode: resolvedCountryCode,
            serviceCode: resolvedServiceCode,
            createdAt: Date.now()
        }).catch(streamErr => logger.warn('[PURCHASE] ActiveOrderStream add failed', { error: streamErr }))

        // Fail-safe: Ensure background queue worker and active poller loop are running (only if not disabled for standalone worker container)
        if (process.env.NEXT_DISABLE_INTERNAL_WORKERS !== 'true') {
            import('@/worker-entry').then(({ startQueueWorker }) => {
                startQueueWorker().catch(() => {})
            }).catch(() => {})
        }

        logger.info('[PURCHASE_COMPLETE] Purchase completed successfully', {
            context: 'PURCHASE',
            correlationId,
            userId: user.userId,
            numberId: resultNumber.id,
            phoneNumber: resultNumber.phoneNumber,
            providerName,
            freshPrice,
            providerCost: providerResult!.rawPrice || 0,
            profit: resultNumber.profit
        })

        const currencyPrices = await getCurrencyService().pointsToAllFiat(Number(resultNumber.price))

        return ResponseFactory.success({
            number: {
                ...resultNumber,
                price: Number(resultNumber.price),
                currencyPrices
            }
        })

    } catch (err: unknown) {
        const error = err as Error
        logger.error(`[PURCHASE_CRITICAL_FAIL] Critical error in purchase flow`, {
            context: 'PURCHASE',
            correlationId,
            userId: user.userId,
            error: error.message,
            stack: error.stack
        })
        captureError(error, { context: 'PURCHASE', correlationId, userId: user?.userId })
        if (lockAcquired) await releaseAtomicPurchaseLock(user.userId, lockToken)

        // Basic cleanup
        if (purchaseOrderId && reservedAmount > 0) {
            try {
                await WalletService.rollback(user.userId, reservedAmount, purchaseOrderId, 'Crash Rollback')
                await prisma.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: 'FAILED' } })
                if (activationId) await prisma.activation.update({ where: { id: activationId }, data: { state: 'FAILED' } })
            } catch (e) {
                logger.warn('[PURCHASE_CLEANUP_FAIL] Cleanup rollback failed', { error: e, purchaseOrderId, correlationId })
            }
        }

        if (err instanceof PaymentError) {
            return ResponseFactory.error(err.message, err.statusCode, err.code)
        }

        return ResponseFactory.error(error.message || 'Purchase processing failed', 500, 'E_PURCHASE_FAIL')
    }
}, { schema: purchaseNumberSchema }), { route: '/api/numbers/purchase' })

export { GET } from '@/app/api/admin/providers/debug-purchase/route'

