import { NextResponse } from 'next/server'
import { prisma, getUserBalance, ensureWallet } from '@/lib/db'
import { getCurrentUser } from '@/lib/jwt'
import { checkIdempotency, acquireNumberLock, releaseNumberLock } from '@/lib/redis'
import { purchaseNumberSchema } from '@/lib/validation'
import { smsProvider } from '@/lib/sms-providers'
import { apiHandler } from '@/lib/api-handler'
import { createOutboxEvent } from '@/lib/outbox'
import { Prisma } from '@prisma/client'

/**
 * Purchase Flow with Production-Grade Safety:
 * 1. Idempotency check (prevent duplicate purchases)
 * 2. Redis lock (prevent concurrent purchases by same user)
 * 3. SELECT FOR UPDATE (lock pricing row for stock verification)
 * 4. OfferReservation record (audit trail)
 * 5. Atomic transaction (wallet + number + outbox)
 */
export const POST = apiHandler(async (request, { body }) => {
    let lockAcquired = false
    let lockId = ''

    try {
        const user = await getCurrentUser(request.headers)

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        if (!body) throw new Error('Body is required')
        const { countryCode, serviceCode, provider: preferredProvider, idempotencyKey } = body

        // ─────────────────────────────────────────────────────────────
        // STEP 1: Idempotency Check (using DB, not just Redis)
        // ─────────────────────────────────────────────────────────────
        const existingByIdempotency = await prisma.number.findFirst({
            where: { idempotencyKey }
        })

        if (existingByIdempotency) {
            return NextResponse.json({
                success: true,
                message: 'Number already purchased',
                duplicate: true,
                number: existingByIdempotency,
            })
        }

        // Also check Redis for very recent requests
        const isNewRequest = await checkIdempotency(idempotencyKey)
        if (!isNewRequest) {
            return NextResponse.json({
                success: false,
                error: 'Duplicate request detected. Please wait.',
                duplicate: true,
            }, { status: 409 })
        }

        // ─────────────────────────────────────────────────────────────
        // STEP 2: Find best pricing with SELECT FOR UPDATE
        // ─────────────────────────────────────────────────────────────

        // First, get the pricing ID we want to lock
        const pricing = await prisma.providerPricing.findFirst({
            where: {
                service: { code: serviceCode },
                country: { code: countryCode },
                stock: { gt: 0 },
                deleted: false,
                ...(preferredProvider ? { provider: { name: preferredProvider } } : {})
            },
            include: {
                provider: true,
                service: true,
                country: true
            },
            orderBy: { sellPrice: 'asc' } // Cheapest first
        })

        if (!pricing) {
            return NextResponse.json(
                { error: 'No available numbers for this service/country combination' },
                { status: 404 }
            )
        }

        // ─────────────────────────────────────────────────────────────
        // STEP 3: Check wallet balance
        // ─────────────────────────────────────────────────────────────
        const walletId = await ensureWallet(user.userId)
        const balance = await getUserBalance(user.userId)
        const price = Number(pricing.sellPrice)

        if (balance < price) {
            return NextResponse.json(
                { error: 'Insufficient balance', required: price, available: balance },
                { status: 402 }
            )
        }

        // ─────────────────────────────────────────────────────────────
        // STEP 4: Acquire Redis lock (prevent race from same user)
        // ─────────────────────────────────────────────────────────────
        lockId = `${user.userId}-${countryCode}-${serviceCode}`
        lockAcquired = await acquireNumberLock(lockId)

        if (!lockAcquired) {
            return NextResponse.json(
                { error: 'Purchase in progress. Please wait.' },
                { status: 409 }
            )
        }

        // ─────────────────────────────────────────────────────────────
        // STEP 5: Transactional purchase with FOR UPDATE lock
        // ─────────────────────────────────────────────────────────────
        const result = await prisma.$transaction(async (tx) => {
            // CRITICAL: Lock the pricing row to prevent concurrent stock deduction
            const lockedPricing = await tx.$queryRaw<{ id: string; stock: number }[]>`
                SELECT id, stock FROM provider_pricing 
                WHERE id = ${pricing.id} 
                FOR UPDATE
            `

            if (!lockedPricing[0] || lockedPricing[0].stock <= 0) {
                throw new Error('OUT_OF_STOCK')
            }

            // Create reservation record (audit trail)
            const reservation = await tx.offerReservation.create({
                data: {
                    pricingId: pricing.id,
                    userId: user.userId,
                    quantity: 1,
                    expiresAt: new Date(Date.now() + 60000), // 60s TTL
                    status: 'PENDING',
                    idempotencyKey,
                }
            })

            // Call provider API to get the actual number
            // Note: This is outside the DB transaction but inside Redis lock
            let providerResult
            try {
                providerResult = await smsProvider.getNumber(
                    pricing.country.externalId, // Use provider's country ID
                    pricing.service.externalId,  // Use provider's service ID
                    pricing.provider.name       // Use SPECIFIC provider
                )
            } catch (providerError) {
                // Mark reservation as cancelled
                await tx.offerReservation.update({
                    where: { id: reservation.id },
                    data: { status: 'CANCELLED' }
                })
                throw providerError
            }

            // Deduct stock
            await tx.providerPricing.update({
                where: { id: pricing.id },
                data: { stock: { decrement: 1 } }
            })

            // Deduct from wallet
            await tx.walletTransaction.create({
                data: {
                    walletId,
                    amount: -price,
                    type: 'purchase',
                    description: `Number purchase: ${providerResult.phoneNumber} (${pricing.service.name})`,
                    idempotencyKey,
                }
            })

            // Create number record with idempotency key
            const newNumber = await tx.number.create({
                data: {
                    phoneNumber: providerResult.phoneNumber,
                    countryCode: pricing.country.code,
                    countryName: pricing.country.name,
                    serviceName: pricing.service.name,
                    serviceCode: pricing.service.code,
                    price,
                    status: 'active',
                    ownerId: user.userId,
                    activationId: providerResult.activationId,
                    provider: pricing.provider.name,
                    idempotencyKey, // Store for future idempotency checks
                    expiresAt: providerResult.expiresAt,
                    purchasedAt: new Date(),
                }
            })

            // Confirm reservation
            await tx.offerReservation.update({
                where: { id: reservation.id },
                data: {
                    status: 'CONFIRMED',
                    confirmedAt: new Date()
                }
            })

            // Audit log
            await tx.auditLog.create({
                data: {
                    userId: user.userId,
                    action: 'number.purchase',
                    resourceType: 'number',
                    resourceId: newNumber.id,
                    metadata: {
                        phoneNumber: providerResult.phoneNumber,
                        countryCode,
                        serviceCode,
                        price,
                        provider: pricing.provider.name,
                        activationId: providerResult.activationId,
                        pricingId: pricing.id,
                        reservationId: reservation.id,
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                }
            })

            // Outbox event for MeiliSearch sync (stock changed)
            await createOutboxEvent(tx, {
                aggregateType: 'offer',
                aggregateId: pricing.id,
                eventType: 'offer.updated',
                payload: {
                    pricingId: pricing.id,
                    newStock: lockedPricing[0].stock - 1,
                    reason: 'purchase',
                    purchasedBy: user.userId,
                }
            })

            return newNumber
        }, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable, // Highest isolation
            timeout: 30000, // 30s timeout for provider API calls
        })

        // Release lock
        await releaseNumberLock(lockId)
        lockAcquired = false

        return NextResponse.json({
            success: true,
            number: {
                id: result.id,
                phoneNumber: result.phoneNumber,
                countryCode: result.countryCode,
                countryName: result.countryName,
                serviceName: result.serviceName,
                price: Number(result.price),
                status: result.status,
                expiresAt: result.expiresAt,
                purchasedAt: result.purchasedAt,
            }
        })

    } catch (error) {
        // Release lock on error
        if (lockAcquired && lockId) {
            await releaseNumberLock(lockId)
        }

        // Handle specific errors
        if (error instanceof Error) {
            if (error.message === 'OUT_OF_STOCK') {
                return NextResponse.json(
                    { error: 'This number is no longer available. Please try another.' },
                    { status: 410 }
                )
            }
        }

        throw error
    }
}, {
    schema: purchaseNumberSchema
})
