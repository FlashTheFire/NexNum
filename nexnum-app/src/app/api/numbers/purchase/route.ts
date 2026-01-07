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
 * Purchase Flow: Uses Strict Name-Based Identity
 */
export const POST = apiHandler(async (request, { body }) => {
    let lockAcquired = false
    let lockId = ''

    try {
        const user = await getCurrentUser(request.headers)
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { countryCode: countryInput, serviceCode: serviceInput, provider: preferredProvider, idempotencyKey, testMode } = body

        console.log(`[PURCHASE] Attempting purchase:`, {
            input: { countryInput, serviceInput, preferredProvider },
            testMode
        })

        // 1. Find Best Pricing (Cheapest across providers)
        // We use an "Omni-Lookup" strategy: search by code, external ID, or name.
        // This avoids dependency on static metadata.json for the core purchase flow.
        const pricing = await prisma.providerPricing.findFirst({
            where: {
                service: {
                    OR: [
                        { code: serviceInput },
                        { externalId: serviceInput },
                        { name: { equals: serviceInput, mode: 'insensitive' } }
                    ]
                },
                country: {
                    OR: [
                        { code: countryInput },
                        { externalId: countryInput },
                        { name: { equals: countryInput, mode: 'insensitive' } }
                    ]
                },
                stock: { gt: 0 },
                deleted: false,
                ...(preferredProvider ? { provider: { name: { equals: preferredProvider, mode: 'insensitive' } } } : {})
            },
            include: { provider: true, service: true, country: true },
            orderBy: { sellPrice: 'asc' }
        })

        if (!pricing) {
            console.warn(`[PURCHASE] No pricing found for input:`, { serviceInput, countryInput })
            return NextResponse.json({ error: 'Not available' }, { status: 404 })
        }

        const serviceName = pricing.service.name
        const countryName = pricing.country.name

        const walletId = await ensureWallet(user.userId)
        const balance = await getUserBalance(user.userId)
        const price = Number(pricing.sellPrice)

        if (balance < price) return NextResponse.json({ error: 'Insufficient balance' }, { status: 402 })

        // 3. Locking & Transaction
        lockId = `${user.userId}-${serviceName}-${countryName}`.toLowerCase()
        lockAcquired = await acquireNumberLock(lockId)
        if (!lockAcquired) return NextResponse.json({ error: 'Wait' }, { status: 409 })

        const result = await prisma.$transaction(async (tx) => {
            const locked = await tx.$queryRaw<{ id: string; stock: number }[]>`SELECT id, stock FROM provider_pricing WHERE id = ${pricing.id} FOR UPDATE`
            if (!locked[0] || locked[0].stock <= 0) throw new Error('OUT_OF_STOCK')

            // Call Provider API (Provider-specific codes stay here!)
            const providerResult = await smsProvider.getNumber(
                pricing.country.externalId,
                pricing.service.externalId,
                pricing.provider.name,
                testMode
            )

            await tx.providerPricing.update({ where: { id: pricing.id }, data: { stock: { decrement: 1 } } })

            const newNumber = await tx.number.create({
                data: {
                    phoneNumber: providerResult.phoneNumber,
                    countryName: pricing.country.name,
                    countryCode: pricing.country.code,
                    serviceName: pricing.service.name,
                    serviceCode: pricing.service.code,
                    price,
                    status: 'active',
                    ownerId: user.userId,
                    activationId: providerResult.activationId,
                    provider: pricing.provider.name,
                    idempotencyKey,
                    expiresAt: providerResult.expiresAt,
                }
            })

            await tx.walletTransaction.create({
                data: { walletId, amount: -price, type: 'purchase', description: `Purchase: ${serviceName}`, idempotencyKey }
            })

            await createOutboxEvent(tx, {
                aggregateType: 'offer',
                aggregateId: pricing.id,
                eventType: 'offer.updated',
                payload: { pricingId: pricing.id, newStock: locked[0].stock - 1 }
            })

            return newNumber
        }, { timeout: 30000 })

        await releaseNumberLock(lockId)
        return NextResponse.json({ success: true, number: result })
    } catch (err) {
        if (lockAcquired) await releaseNumberLock(lockId)
        throw err
    }
}, { schema: purchaseNumberSchema })
