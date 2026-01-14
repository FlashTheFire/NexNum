import { NextResponse } from 'next/server'
import { prisma, ensureWallet } from '@/lib/core/db'
import { Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth/jwt'
import { checkIdempotency, acquireNumberLock, releaseNumberLock, redis } from '@/lib/core/redis'
import { purchaseNumberSchema } from '@/lib/api/validation'
import { purchase_duration_seconds, wallet_transactions_total, provider_api_calls_total } from '@/lib/metrics'
import { smsProvider } from '@/lib/sms-providers'
import { apiHandler } from '@/lib/api/api-handler'
import { createOutboxEvent } from '@/lib/activation/outbox'
import { getOfferForPurchase, OfferDocument } from '@/lib/search/search'
import { getCountryFlagUrl } from '@/lib/normalizers/country-flags'
import { WalletService } from '@/lib/wallet/wallet'

/**
 * Purchase Flow: MeiliSearch-First Architecture
 * 
 * 1. Query MeiliSearch offers index for availability
 * 2. Route to provider via SmartSmsRouter
 * 3. Store number in PostgreSQL
 */
export const POST = apiHandler(async (request, { body }) => {
    let lockAcquired = false
    let lockId = ''
    let purchaseOrderId: string | null = null
    let activationId: string | null = null // Phase 11: Activation tracking
    let reservedAmount = 0
    let providerResult: any = null // Declare providerResult in outer scope

    const user = await getCurrentUser(request.headers)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const {
        countryCode: countryInput,
        serviceCode: serviceInput,
        operatorId,
        provider,
        idempotencyKey
    } = body

    console.log(`[PURCHASE] Attempting purchase:`, {
        input: { countryInput, serviceInput, operatorId, provider }
    })

    // 1. Find Offer
    // If provider is specified, we ONLY fetch for that provider
    const offer = await getOfferForPurchase(serviceInput, countryInput, operatorId, provider)
    if (!offer) {
        console.warn(`[PURCHASE] No offer found for:`, { serviceInput, countryInput, provider })
        return NextResponse.json({ error: 'Selected provider offer not available' }, { status: 404 })
    }

    const serviceName = offer.serviceName
    const countryName = offer.countryName
    const providerName = provider || offer.provider
    const price = offer.price

    console.log(`[PURCHASE] Found offer:`, { providerName, serviceName, countryName, price })

    // 2. ULTIMATE SECURITY: Global User Lock & Rate Limit

    // A. Rate Limit Guard (2 seconds cooldown)
    const rateKey = `rate:purchase:${user.userId}`
    const isRateLimited = await redis.get(rateKey)
    if (isRateLimited) {
        return NextResponse.json({ error: 'Please wait 2 seconds between purchases' }, { status: 429 })
    }

    // B. Global User Lock (Strict Single-Threaded Purchase)
    // Prevents "Fast Script" parallel attacks
    lockId = `lock:purchase:${user.userId}`
    lockAcquired = await acquireNumberLock(lockId)
    if (!lockAcquired) {
        return NextResponse.json({ error: 'Another purchase is in progress. Please wait.' }, { status: 409 })
    }

    // Set cooldown immediately after acquiring lock
    await redis.set(rateKey, '1', 'EX', 2)

    // C. Strict Idempotency Check
    if (idempotencyKey) {
        const isNew = await checkIdempotency(idempotencyKey)
        if (!isNew) {
            await releaseNumberLock(lockId)
            return NextResponse.json({ error: 'Duplicate request (Idempotency)' }, { status: 409 })
        }
    }

    try {
        // 3. PHASE 1: Reserve Funds & Create Pending Order + Activation
        // We do this in a transaction to ensure Order exists if Money is reserved
        await prisma.$transaction(async (tx) => {
            // Check & Reserve
            await WalletService.reserve(
                user.userId,
                price,
                'init',
                `Reserve: ${serviceName}`,
                idempotencyKey,
                tx
            )
            // Note: reservedAmount is only "committed" in our logic if this tx succeeds
            // But we set it here to be safe for rollback if Step 4/5 fails later.

            // Create Order
            const po = await tx.purchaseOrder.create({
                data: {
                    userId: user.userId,
                    serviceName,
                    countryName,
                    amount: new Prisma.Decimal(price),
                    status: 'PENDING',
                    idempotencyKey,
                    expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 mins
                }
            })
            purchaseOrderId = po.id

            // Phase 11: Create Activation record for complete lifecycle tracking
            const activation = await tx.activation.create({
                data: {
                    userId: user.userId,
                    price: new Prisma.Decimal(price),
                    state: 'RESERVED',
                    serviceName,
                    countryCode: offer.countryCode,
                    countryName,
                    operatorId: operatorId ? String(operatorId) : null,
                    providerId: providerName,
                    idempotencyKey: idempotencyKey ? `activation_${idempotencyKey}` : null,
                    reservedTxId: idempotencyKey || null
                }
            })
            activationId = activation.id
        }, {
            timeout: 30000, // 30s timeout for DB heavy operations
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable // High consistency
        })

        // ONLY track reservedAmount AFTER Phase 1 transaction is confirmed in DB
        reservedAmount = price // Money is now truly locked in DB


        console.log(`[PURCHASE] Reserved funds. Order: ${purchaseOrderId}, Activation: ${activationId}`)


        // 4. Call Provider (External)
        const startProvider = Date.now()
        try {
            providerResult = await smsProvider.getNumber(
                offer.countryCode,
                offer.serviceSlug,
                { provider: providerName }
            )
            const dur = (Date.now() - startProvider) / 1000
            purchase_duration_seconds.labels('provider_call', providerName, countryName).observe(dur)
            provider_api_calls_total.labels(providerName, 'getNumber', 'success').inc()
        } catch (providerErr: any) {
            const dur = (Date.now() - startProvider) / 1000
            purchase_duration_seconds.labels('provider_call', providerName, countryName).observe(dur)
            provider_api_calls_total.labels(providerName, 'getNumber', 'error').inc()

            // PHASE 2 (FAIL): Rollback
            console.warn(`[PURCHASE] Provider failed. Rolling back...`, providerErr.message)

            await prisma.$transaction(async (tx) => {
                await WalletService.rollback(user.userId, price, purchaseOrderId!, 'Provider Fail', tx)
                await tx.purchaseOrder.update({
                    where: { id: purchaseOrderId! },
                    data: { status: 'FAILED' }
                })
                // Phase 11: Update Activation state to FAILED
                if (activationId) {
                    await tx.activation.update({
                        where: { id: activationId },
                        data: { state: 'FAILED' }
                    })
                }
            }, { timeout: 15000 })

            await releaseNumberLock(lockId)
            // Return specific error
            return NextResponse.json({ error: 'Provider unavailable' }, { status: 503 })
        }

        // 5. PHASE 2 (SUCCESS): Commit & Create Number
        const resultNumber = await prisma.$transaction(async (tx) => {
            // A. Create Number 
            const newNumber = await tx.number.create({
                data: {
                    phoneNumber: providerResult.phoneNumber,
                    countryName,
                    countryCode: offer.countryCode,
                    serviceName,
                    serviceCode: offer.serviceSlug,
                    price,
                    status: 'active',
                    owner: { connect: { id: user.userId } },
                    activationId: providerResult.activationId,
                    provider: providerName,
                    idempotencyKey,
                    expiresAt: providerResult.expiresAt,
                    // Persist metadata for instant dashboard loading (Phase 10)
                    serviceIconUrl: offer.iconUrl,
                    countryIconUrl: offer.flagUrl,
                }
            })

            // B. Commit Wallet (Deduct Balance, Release Reserve)
            await WalletService.commit(
                user.userId,
                price,
                newNumber.id,
                `Purchase: ${serviceName}`,
                `tx_${purchaseOrderId}`, // Unique key for txn
                tx
            )

            // C. Update Order
            await tx.purchaseOrder.update({
                where: { id: purchaseOrderId! },
                data: {
                    status: 'COMPLETED',
                    provider: providerName,
                    activationId: providerResult.activationId
                }
            })

            // D. Outbox Event (Optional, can be moved to finally or after 200 OK)
            await createOutboxEvent(tx as any, {
                aggregateType: 'offer',
                aggregateId: offer.id,
                eventType: 'offer.updated',
                payload: { offerId: offer.id, serviceName, countryName, action: 'stock_decremented' }
            })

            // E. Phase 11: Update Activation to ACTIVE and link to Number
            if (activationId) {
                await tx.activation.update({
                    where: { id: activationId },
                    data: {
                        state: 'ACTIVE',
                        providerActivationId: providerResult.activationId,
                        phoneNumber: providerResult.phoneNumber,
                        expiresAt: providerResult.expiresAt,
                        numberId: newNumber.id,
                        capturedTxId: `tx_${purchaseOrderId}`
                    }
                })
            }

            return newNumber
        }, { timeout: 20000 })

        // Polling is handled automatically by the MasterWorker (InboxWorker loop)
        // providing a stateless, database-driven mechanism for SMS synchronization.
        console.log(`[PURCHASE] Success! Number: ${resultNumber.id}`)
        await releaseNumberLock(lockId)
        return NextResponse.json({ success: true, number: resultNumber })

    } catch (err: any) {
        console.error(`[PURCHASE] Critical Error:`, err)
        if (lockAcquired) await releaseNumberLock(lockId)

        // If we have a pending order/reservation but crashed here (e.g. DB commit failed after provider success!)
        // This is the "Orphan" case.
        // Since we wrap step 5 in transaction, if it fails, NO number is created and NO money deducted (locally), BUT funds are still RESERVED (Phase 1).
        // AND Provider has active number!

        // Cleanup:
        // 1. Release Reservation (Rollback) - User gets money back (good).
        // 2. Cancel Provider Number - Save our money.

        if (purchaseOrderId && reservedAmount > 0) {
            try {
                // Check if the order actually exists before trying to update it
                // This prevents P2025 if Phase 1 transaction failed to commit
                const exists = await prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId } })

                if (exists) {
                    await WalletService.rollback(user.userId, reservedAmount, purchaseOrderId, 'Crash Rollback')
                    await prisma.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: 'FAILED' } })

                    if (activationId) {
                        await prisma.activation.update({ where: { id: activationId }, data: { state: 'FAILED' } })
                    }
                }

                // If providerResult existed (meaning provider call succeeded)
                if (providerResult && providerResult.activationId) {
                    console.warn(`[PURCHASE] Attempting to cancel remote number due to local transaction failure. ActivationID: ${providerResult.activationId}`)
                    await smsProvider.cancelNumber(providerResult.activationId)
                    console.log(`[PURCHASE] Remote cancellation successful for orphaned number.`)
                }
            } catch (cleanupErr) {
                console.error('[PURCHASE] Failed cleanup during critical error:', cleanupErr)
            }
        }

        // Handle specific errors
        if (err.message === 'Insufficient funds') {
            return NextResponse.json({ error: 'Insufficient balance' }, { status: 402 })
        }

        return NextResponse.json({ error: 'Purchase processing failed' }, { status: 500 })
    }
}, { schema: purchaseNumberSchema })
