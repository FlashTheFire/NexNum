import { NextResponse } from 'next/server'
import { prisma, ensureWallet } from '@/lib/core/db'
import { Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth/jwt'
import { redis } from '@/lib/core/redis'
import { purchaseNumberSchema } from '@/lib/api/validation'
import { purchase_duration_seconds, wallet_transactions_total, provider_api_calls_total } from '@/lib/metrics'
import { smsProvider } from '@/lib/sms-providers'
import { apiHandler } from '@/lib/api/api-handler'
import { createOutboxEvent } from '@/lib/activation/outbox'
import { getOfferForPurchase } from '@/lib/search/search'
import { WalletService } from '@/lib/wallet/wallet'
import { logger } from '@/lib/core/logger'
import { notify } from '@/lib/notifications'
import {
    validatePurchaseInput,
    checkUserEligibility,
    verifyPrice,
    acquireAtomicPurchaseLock,
    releaseAtomicPurchaseLock,
    recordDailySpend,
    logPurchaseAudit,
    generatePurchaseCorrelationId,
    handleOrphanedNumber
} from '@/lib/purchase/security'

/**
 * Purchase Flow: Hardened Edition
 * 
 * Security Features:
 * - Input validation & sanitization
 * - User eligibility checks (ban, balance, velocity)
 * - Price verification with tolerance
 * - Atomic distributed locking
 * - Daily spend limits
 * - Double-commit guards
 * - Orphan number recovery
 * - Comprehensive audit trail
 */
export const POST = apiHandler(async (request, { body }) => {
    const correlationId = generatePurchaseCorrelationId()
    let lockToken = ''
    let lockAcquired = false
    let purchaseOrderId: string | null = null
    let activationId: string | null = null
    let reservedAmount = 0
    let providerResult: any = null

    const user = await getCurrentUser(request.headers)
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Log purchase start
    await logPurchaseAudit({
        eventType: 'PURCHASE_STARTED',
        userId: user.userId,
        correlationId,
        metadata: { input: body }
    })

    // ============================================
    // PHASE 1: INPUT VALIDATION
    // ============================================

    const validation = validatePurchaseInput({
        countryCode: body.countryCode,
        serviceCode: body.serviceCode,
        operatorId: body.operatorId,
        provider: body.provider,
        idempotencyKey: body.idempotencyKey
    })

    if (!validation.valid || !validation.sanitized) {
        await logPurchaseAudit({
            eventType: 'VALIDATION_FAILED',
            userId: user.userId,
            correlationId,
            metadata: { errors: validation.errors }
        })
        return NextResponse.json({ error: validation.errors[0] || 'Validation failed' }, { status: 400 })
    }

    const { countryCode, serviceCode, operatorId, provider, idempotencyKey } = validation.sanitized

    // ============================================
    // PHASE 2: RESOLVE PROVIDER & GET OFFER
    // ============================================

    let resolvedProvider: string | undefined = undefined
    if (provider) {
        const slug = await smsProvider.resolveProviderSlug(provider)
        resolvedProvider = slug || provider.toLowerCase()
        logger.debug(`[PURCHASE] Resolved provider: "${provider}" -> "${resolvedProvider}"`, { correlationId })
    }


    const offer = await getOfferForPurchase(serviceCode, countryCode, operatorId ? parseInt(operatorId, 10) : undefined, resolvedProvider)
    if (!offer) {
        logger.warn(`[PURCHASE] No offer found`, { serviceCode, countryCode, provider, correlationId })
        return NextResponse.json({ error: 'Selected provider offer not available' }, { status: 404 })
    }

    const serviceName = offer.serviceName
    const countryName = offer.countryName
    const providerName = offer.provider
    const freshPrice = offer.price

    logger.info(`[PURCHASE] Found offer`, { providerName, serviceName, countryName, price: freshPrice, correlationId })

    // ============================================
    // PHASE 3: USER ELIGIBILITY CHECK
    // ============================================

    const eligibility = await checkUserEligibility(user.userId, freshPrice)
    if (!eligibility.eligible) {
        await logPurchaseAudit({
            eventType: 'ELIGIBILITY_FAILED',
            userId: user.userId,
            correlationId,
            metadata: { reason: eligibility.reason, details: eligibility.details }
        })
        return NextResponse.json({ error: eligibility.reason || 'Not eligible for purchase' }, { status: 403 })
    }

    // ============================================
    // PHASE 4: ACQUIRE ATOMIC LOCK
    // ============================================

    // Rate limit check (2 second cooldown)
    const rateKey = `rate:purchase:${user.userId}`
    const isRateLimited = await redis.get(rateKey)
    if (isRateLimited) {
        return NextResponse.json({ error: 'Please wait 2 seconds between purchases' }, { status: 429 })
    }

    // Atomic lock
    const lockResult = await acquireAtomicPurchaseLock(user.userId, idempotencyKey)
    if (!lockResult.acquired) {
        await logPurchaseAudit({
            eventType: 'LOCK_FAILED',
            userId: user.userId,
            correlationId,
            metadata: { reason: lockResult.reason }
        })
        return NextResponse.json({ error: 'Another purchase is in progress. Please wait.' }, { status: 409 })
    }
    lockAcquired = true
    lockToken = lockResult.token

    // Set cooldown
    await redis.set(rateKey, '1', 'EX', 2)

    await logPurchaseAudit({
        eventType: 'LOCK_ACQUIRED',
        userId: user.userId,
        correlationId
    })

    try {
        // ============================================
        // PHASE 5: RESERVE FUNDS & CREATE RECORDS
        // ============================================

        await prisma.$transaction(async (tx) => {
            // Reserve funds
            await WalletService.reserve(
                user.userId,
                freshPrice,
                'init',
                `Reserve: ${serviceName}`,
                idempotencyKey,
                tx
            )

            // Create Order
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

            // Create Activation
            const activation = await tx.activation.create({
                data: {
                    userId: user.userId,
                    price: new Prisma.Decimal(freshPrice),
                    state: 'RESERVED',
                    serviceName,
                    countryCode: offer.countryCode,
                    countryName,
                    operatorId: operatorId || null,
                    providerId: providerName,
                    idempotencyKey: idempotencyKey ? `activation_${idempotencyKey}` : null,
                    reservedTxId: idempotencyKey || null
                }
            })
            activationId = activation.id
        }, {
            timeout: 30000,
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
        })

        reservedAmount = freshPrice

        await logPurchaseAudit({
            eventType: 'FUNDS_RESERVED',
            userId: user.userId,
            correlationId,
            activationId: activationId ?? undefined,
            purchaseOrderId: purchaseOrderId ?? undefined,
            amount: freshPrice
        })

        logger.info(`[PURCHASE] Reserved funds`, { purchaseOrderId, activationId, correlationId })

        // ============================================
        // PHASE 6: CALL PROVIDER
        // ============================================

        await logPurchaseAudit({
            eventType: 'PROVIDER_CALLED',
            userId: user.userId,
            correlationId,
            activationId: activationId ?? undefined,
            providerId: providerName
        })

        const startProvider = Date.now()
        try {
            providerResult = await smsProvider.getNumber(
                offer.countryCode,
                offer.serviceSlug,
                {
                    provider: providerName,
                    expectedPrice: freshPrice // Enforce user's selected price
                }
            )
            const dur = (Date.now() - startProvider) / 1000
            purchase_duration_seconds.labels('provider_call', providerName, countryName).observe(dur)
            provider_api_calls_total.labels(providerName, 'getNumber', 'success').inc()

            await logPurchaseAudit({
                eventType: 'PROVIDER_SUCCESS',
                userId: user.userId,
                correlationId,
                activationId: activationId ?? undefined,
                providerId: providerName,
                metadata: { phoneNumber: providerResult.phoneNumber, activationId: providerResult.activationId }
            })

        } catch (providerErr: any) {
            const dur = (Date.now() - startProvider) / 1000
            purchase_duration_seconds.labels('provider_call', providerName, countryName).observe(dur)
            provider_api_calls_total.labels(providerName, 'getNumber', 'error').inc()

            await logPurchaseAudit({
                eventType: 'PROVIDER_FAILED',
                userId: user.userId,
                correlationId,
                activationId: activationId ?? undefined,
                providerId: providerName,
                errorMessage: providerErr.message
            })

            logger.warn(`[PURCHASE] Provider failed. Rolling back...`, { error: providerErr.message, correlationId })

            // Rollback
            await prisma.$transaction(async (tx) => {
                await WalletService.rollback(user.userId, freshPrice, purchaseOrderId!, 'Provider Fail', tx)
                await tx.purchaseOrder.update({
                    where: { id: purchaseOrderId! },
                    data: { status: 'FAILED' }
                })
                if (activationId) {
                    await tx.activation.update({
                        where: { id: activationId },
                        data: { state: 'FAILED' }
                    })
                }
            })

            await logPurchaseAudit({
                eventType: 'FUNDS_ROLLEDBACK',
                userId: user.userId,
                correlationId,
                activationId: activationId ?? undefined,
                amount: freshPrice
            })

            await releaseAtomicPurchaseLock(user.userId, lockToken)
            return NextResponse.json({ error: 'Provider unavailable' }, { status: 503 })
        }

        // ============================================
        // PHASE 7: COMMIT & CREATE NUMBER
        // ============================================

        const resultNumber = await prisma.$transaction(async (tx) => {
            // DOUBLE-COMMIT GUARD: Verify activation is still RESERVED
            const currentActivation = await tx.activation.findUnique({
                where: { id: activationId! },
                select: { state: true }
            })
            if (currentActivation?.state !== 'RESERVED') {
                throw new Error('DOUBLE_COMMIT: Activation already processed')
            }

            // Parse phone number into country code and national number
            const { formatPhoneNumber } = await import('@/lib/utils/phone-parser')
            const parsedPhone = formatPhoneNumber(providerResult.phoneNumber)

            // Create Number
            const newNumber = await tx.number.create({
                data: {
                    phoneNumber: providerResult.phoneNumber,
                    phoneCountryCode: parsedPhone.countryCode || null,
                    phoneNationalNumber: parsedPhone.nationalNumber || null,
                    countryName,
                    countryCode: offer.countryCode,
                    serviceName,
                    serviceCode: offer.serviceSlug,
                    price: freshPrice,
                    status: 'active',
                    owner: { connect: { id: user.userId } },
                    activationId: providerResult.activationId,
                    provider: providerName,
                    idempotencyKey,
                    expiresAt: providerResult.expiresAt,
                    serviceIconUrl: offer.iconUrl,
                    countryIconUrl: offer.flagUrl,
                }
            })

            // Commit Wallet
            await WalletService.commit(
                user.userId,
                freshPrice,
                newNumber.id,
                `Purchase: ${serviceName}`,
                `tx_${purchaseOrderId}`,
                tx
            )

            // Update Order
            await tx.purchaseOrder.update({
                where: { id: purchaseOrderId! },
                data: {
                    status: 'COMPLETED',
                    provider: providerName,
                    activationId: providerResult.activationId
                }
            })

            // Outbox Event
            await createOutboxEvent(tx as any, {
                aggregateType: 'offer',
                aggregateId: offer.id,
                eventType: 'offer.updated',
                payload: { offerId: offer.id, serviceName, countryName, action: 'stock_decremented' }
            })

            // Update Activation
            await tx.activation.update({
                where: { id: activationId! },
                data: {
                    state: 'ACTIVE',
                    providerActivationId: providerResult.activationId,
                    phoneNumber: providerResult.phoneNumber,
                    expiresAt: providerResult.expiresAt,
                    numberId: newNumber.id,
                    capturedTxId: `tx_${purchaseOrderId}`
                }
            })

            return newNumber
        }, {
            timeout: 20000,
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
        })

        // Record daily spend
        await recordDailySpend(user.userId, freshPrice)

        await logPurchaseAudit({
            eventType: 'FUNDS_COMMITTED',
            userId: user.userId,
            correlationId,
            activationId: activationId ?? undefined,
            amount: freshPrice
        })

        await logPurchaseAudit({
            eventType: 'PURCHASE_COMPLETED',
            userId: user.userId,
            correlationId,
            activationId: activationId ?? undefined,
            purchaseOrderId: purchaseOrderId ?? undefined,
            metadata: { numberId: resultNumber.id }
        })

        logger.info(`[PURCHASE] Success!`, { numberId: resultNumber.id, correlationId })
        await releaseAtomicPurchaseLock(user.userId, lockToken)

        // Send notification (async, non-blocking)
        notify.orderUpdate({
            userId: user.userId,
            userName: user.name || undefined,
            orderId: resultNumber.id,
            appName: serviceName,
            price: freshPrice,
            country: countryName,
            countryCode: offer.countryCode,
            phoneNumber: resultNumber.phoneNumber,
            status: 'ACTIVE',
            validUntil: resultNumber.expiresAt?.toISOString(),
            isApiOrder: false
        }).catch(() => { }) // Fire and forget

        return NextResponse.json({ success: true, number: resultNumber })

    } catch (err: any) {
        logger.error(`[PURCHASE] Critical Error`, { error: err.message, correlationId })
        if (lockAcquired) await releaseAtomicPurchaseLock(user.userId, lockToken)

        await logPurchaseAudit({
            eventType: 'PURCHASE_FAILED',
            userId: user.userId,
            correlationId,
            activationId: activationId ?? undefined,
            errorMessage: err.message
        })

        // Cleanup orphaned state
        if (purchaseOrderId && reservedAmount > 0) {
            try {
                const exists = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId } })

                if (exists) {
                    await WalletService.rollback(user.userId, reservedAmount, purchaseOrderId, 'Crash Rollback')
                    await prisma.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: 'FAILED' } })

                    if (activationId) {
                        await prisma.activation.update({ where: { id: activationId }, data: { state: 'FAILED' } })
                    }

                    await logPurchaseAudit({
                        eventType: 'FUNDS_ROLLEDBACK',
                        userId: user.userId,
                        correlationId,
                        activationId: activationId ?? undefined,
                        amount: reservedAmount
                    })
                }

                // Handle orphaned provider number
                if (providerResult?.activationId) {
                    await logPurchaseAudit({
                        eventType: 'ORPHAN_DETECTED',
                        userId: user.userId,
                        correlationId,
                        activationId: activationId ?? undefined,
                        metadata: { providerActivationId: providerResult.activationId }
                    })

                    await handleOrphanedNumber(
                        providerResult.activationId,
                        activationId || '',
                        user.userId,
                        smsProvider,
                        correlationId
                    )
                }
            } catch (cleanupErr: any) {
                logger.error('[PURCHASE] Failed cleanup during critical error', { error: cleanupErr.message, correlationId })
            }
        }

        if (err.message === 'Insufficient funds' || err.message?.includes('Insufficient')) {
            return NextResponse.json({ error: 'Insufficient balance' }, { status: 402 })
        }

        if (err.message?.includes('DOUBLE_COMMIT')) {
            return NextResponse.json({ error: 'Purchase already processed' }, { status: 409 })
        }

        if (err.message?.includes('WALLET_INTEGRITY')) {
            return NextResponse.json({ error: 'Wallet integrity error. Please contact support.' }, { status: 500 })
        }

        return NextResponse.json({ error: 'Purchase processing failed' }, { status: 500 })
    }
}, { schema: purchaseNumberSchema })
