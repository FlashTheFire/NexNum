import { NextResponse } from 'next/server'
import { prisma, getUserBalance, ensureWallet } from '@/lib/db'
import { getCurrentUser } from '@/lib/jwt'
import { checkIdempotency, acquireNumberLock, releaseNumberLock } from '@/lib/redis'
import { purchaseNumberSchema } from '@/lib/validation'
import { smsProvider } from '@/lib/sms-providers'
import { apiHandler } from '@/lib/api-handler'

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

        // Body validation provided by purchaseNumberSchema
        if (!body) throw new Error('Body is required')
        const { countryCode, serviceCode, idempotencyKey } = body

        // Check idempotency
        const isNewRequest = await checkIdempotency(idempotencyKey)

        if (!isNewRequest) {
            // Find existing number for this idempotency key
            const existingNumber = await prisma.number.findFirst({
                where: {
                    ownerId: user.userId,
                },
                orderBy: { createdAt: 'desc' },
                take: 1,
            })

            if (existingNumber) {
                return NextResponse.json({
                    success: true,
                    message: 'Number already purchased',
                    duplicate: true,
                    number: existingNumber,
                })
            }
        }

        // Get services to find price
        const services = await smsProvider.getServices(countryCode)
        const service = services.find(s => s.code === serviceCode)

        if (!service) {
            return NextResponse.json(
                { error: 'Service not found' },
                { status: 404 }
            )
        }

        // Check wallet balance
        const walletId = await ensureWallet(user.userId)
        const balance = await getUserBalance(user.userId)

        if (balance < service.price) {
            return NextResponse.json(
                { error: 'Insufficient balance', required: service.price, available: balance },
                { status: 402 }
            )
        }

        // Acquire lock for this purchase (prevent race conditions)
        lockId = `${user.userId}-${countryCode}-${serviceCode}`
        lockAcquired = await acquireNumberLock(lockId)

        if (!lockAcquired) {
            return NextResponse.json(
                { error: 'Purchase in progress. Please wait.' },
                { status: 409 }
            )
        }

        // Get number from provider
        const providerResult = await smsProvider.getNumber(countryCode, serviceCode)

        // Create number and deduct from wallet in transaction
        const number = await prisma.$transaction(async (tx) => {
            // Deduct from wallet (negative amount = debit)
            await tx.walletTransaction.create({
                data: {
                    walletId,
                    amount: -service.price, // Negative = debit
                    type: 'purchase',
                    description: `Number purchase: ${providerResult.phoneNumber} (${service.name})`,
                    idempotencyKey,
                }
            })

            // Create number record
            const newNumber = await tx.number.create({
                data: {
                    phoneNumber: providerResult.phoneNumber,
                    countryCode: providerResult.countryCode,
                    countryName: providerResult.countryName,
                    serviceName: providerResult.serviceName,
                    serviceCode: providerResult.serviceCode,
                    price: service.price,
                    status: 'active',
                    ownerId: user.userId,
                    activationId: providerResult.activationId,
                    provider: smsProvider.name,
                    expiresAt: providerResult.expiresAt,
                    purchasedAt: new Date(),
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
                        price: service.price,
                        provider: smsProvider.name,
                        activationId: providerResult.activationId,
                    },
                    ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
                }
            })

            return newNumber
        })

        // Release lock
        await releaseNumberLock(lockId)
        lockAcquired = false

        return NextResponse.json({
            success: true,
            number: {
                id: number.id,
                phoneNumber: number.phoneNumber,
                countryCode: number.countryCode,
                countryName: number.countryName,
                serviceName: number.serviceName,
                price: Number(number.price),
                status: number.status,
                expiresAt: number.expiresAt,
                purchasedAt: number.purchasedAt,
            }
        })

    } catch (error) {
        // Release lock on error
        if (lockAcquired && lockId) {
            await releaseNumberLock(lockId)
        }
        // Let apiHandler handle the error response
        throw error
    }
}, {
    schema: purchaseNumberSchema
})
