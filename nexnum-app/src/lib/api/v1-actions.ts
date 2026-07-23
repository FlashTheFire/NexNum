/**
 * V1 (Provider-Compatible) API Action Library
 * ----------------------------------------------------------------------------
 * Implements the eight legacy `handler_api.php` actions that NexNum exposes
 * to its users as a drop-in replacement for the SMS providers it consumes
 * from (5sim, sms-activate, GrizzlySMS, etc.).
 *
 * Wire contract (mirrors the reference `sms_api.py`):
 *
 *   Action           | On success                                | On error
 *   -----------------+-------------------------------------------+--------------------------
 *   getBalance       | "ACCESS_BALANCE:<amount>"                 | "NO_KEY"/"BAD_KEY"
 *   getNumber        | "ACCESS_NUMBER:<activationId>:<+E164>"    | "NO_NUMBERS"/"NO_BALANCE"/...
 *   setStatus        | one of {ACCESS_READY, ACCESS_RETRY_GET,   | "NO_ACTIVATION"
 *   |                 | ACCESS_ACTIVATION, ACCESS_CANCEL}         |
 *   getStatus        | JSON {status, message: "STATUS_OK:..."}   | JSON {status:false, msg:...}
 *   getServicesList  | JSON {services: [{id,numeric, name, ...}]}| JSON {services:[]}
 *   getCountriesList | JSON {countries: [{id,numeric, name, ...}]}| JSON {countries:[]}
 *   getPrices        | JSON {<serviceId>: {cost,count,...,countries/operators}} | JSON {}
 *   getNumbersStatus | JSON {<activationId>: {phone,countryId,serviceId,...}}| JSON {}
 *
 * `setStatus` status inputs (provider-style):
 *    1  -> ACCESS_READY       (SMS has been read; we mark `received`)
 *    3  -> ACCESS_RETRY_GET   (ask upstream to resend code; best effort)
 *    6  -> ACCESS_ACTIVATION  (finalize: mark `completed`)
 *    8  -> ACCESS_ACTIVATION  ("number used" = mark complete, no refund)
 *   -1  -> ACCESS_CANCEL      (cancel + refund)
 *
 * `getStatus` messages:
 *    STATUS_WAIT_CODE        - waiting for first SMS
 *    STATUS_OK:<code>        - SMS received, code included
 *    STATUS_WAIT_RETRY       - re-send requested, waiting
 *    STATUS_WAIT_RESEND      - upstream is resending
 *    STATUS_CANCEL           - cancelled
 *    STATUS_TIMEOUT          - expired without a code
 *    NO_ACTIVATION           - id not found / not owned
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/core/db'
import { smsProvider } from '@/lib/providers'
import { getOfferForPurchase, searchCountries, meili, INDEXES, OfferDocument } from '@/lib/search/search'
import { getServiceAggregates } from '@/lib/search/service-aggregates'
import { getCachedBalance, invalidateBalanceCache } from '@/lib/cache/user-cache'
import { WalletService } from '@/lib/wallet/wallet'
import { PaymentError } from '@/lib/payment/payment-errors'
import { hasPermission } from './api-keys'
import { logger } from '@/lib/core/logger'
import {
    validatePurchaseInput,
    checkUserEligibility,
    acquireAtomicPurchaseLock,
    releaseAtomicPurchaseLock,
    recordDailySpend,
    generatePurchaseCorrelationId
} from '@/lib/purchase/security'
import type { ApiKey } from '@prisma/client'

// ============================================================================
// Shared error codes (text-only, as on the wire)
// ============================================================================

export const V1_ERRORS = {
    NO_KEY: 'NO_KEY',
    BAD_KEY: 'BAD_KEY',
    BAD_SERVICE: 'BAD_SERVICE',
    BAD_ACTION: 'BAD_ACTION',
    NO_NUMBERS: 'NO_NUMBERS',
    NO_ACTIVATION: 'NO_ACTIVATION',
    NO_BALANCE: 'NO_BALANCE',
    RATE_LIMIT: 'RATE_LIMIT_EXCEEDED',
    INTERNAL: 'INTERNAL_ERROR'
} as const

export type V1ErrorCode = typeof V1_ERRORS[keyof typeof V1_ERRORS]

// ============================================================================
// Standard response helpers
// ============================================================================

const PLAIN_TEXT_HEADERS: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
}

const JSON_HEADERS: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
}

function plain(body: string, status = 200): Response {
    return new Response(body, { status, headers: PLAIN_TEXT_HEADERS })
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

// ============================================================================
// Action-level permission gate
// ============================================================================

function requirePerm(apiKey: ApiKey, perm: string): Response | null {
    if (hasPermission(apiKey, perm)) return null
    return plain('BAD_KEY', 200)
}

// ============================================================================
// Action: getBalance
//   On success: "ACCESS_BALANCE:<points>"
// ============================================================================

export async function actionGetBalance(ctx: { userId: string; apiKey: ApiKey }): Promise<Response> {
    const denied = requirePerm(ctx.apiKey, 'read')
    if (denied) return denied

    const result = await getCachedBalance(ctx.userId)
    // Display in user's preferred fiat currency, two decimals, e.g. "ACCESS_BALANCE:25.50"
    const formatted = result.displayAmount.toFixed(2)
    return plain(`ACCESS_BALANCE:${formatted}`)
}

// ============================================================================
// Action: getNumber
//   Inputs:  service=<code> country=<code> [operator=<code>] [maxPrice=<num>]
//   On success: "ACCESS_NUMBER:<activationId>:<+E164>"
// ============================================================================

interface GetNumberParams {
    service: string
    country: string
    operator?: string
    maxPrice?: number
}

export async function actionGetNumber(
    ctx: { userId: string; apiKey: ApiKey },
    params: GetNumberParams
): Promise<Response> {
    const denied = requirePerm(ctx.apiKey, 'numbers')
    if (denied) return denied

    if (!params.service || !params.country) {
        return plain('BAD_SERVICE', 200)
    }

    const correlationId = generatePurchaseCorrelationId()
    let lockAcquired = false
    let purchaseOrderId: string | null = null
    let activationId: string | null = null
    let reservedAmount = 0
    const lockToken = correlationId // Reuse correlationId as the lock token

    try {
        // ---- Phase 1: input validation ----
        // Universal V1 contract: service and country are numeric IDs.
        // getOfferForPurchase accepts either numeric or string; pass numbers when valid.
        const svcId = Number(params.service)
        const ctyId = Number(params.country)
        const serviceIdNum = Number.isFinite(svcId) && svcId > 0 ? svcId : undefined
        const countryIdNum = Number.isFinite(ctyId) && ctyId > 0 ? ctyId : undefined

        const validation = validatePurchaseInput({
            countryCode: params.country,
            serviceCode: params.service,
            countryId: countryIdNum,
            serviceId: serviceIdNum
        })
        if (!validation.valid || !validation.sanitized) {
            return plain('BAD_SERVICE', 200)
        }

        // ---- Phase 2: offer lookup ----
        const operatorId = params.operator && !isNaN(Number(params.operator)) ? Number(params.operator) : undefined
        const offer = await getOfferForPurchase(
            serviceIdNum ?? params.service,
            countryIdNum ?? params.country,
            operatorId
        )
        if (!offer) {
            return plain('NO_NUMBERS', 200)
        }

        // Soft maxPrice cap (in POINTS — provider-set pricing, V1 consumers pay points)
        if (params.maxPrice !== undefined && offer.pointPrice > params.maxPrice) {
            return plain('NO_NUMBERS', 200)
        }

        // ---- Phase 3: user eligibility ----
        const eligibility = await checkUserEligibility(ctx.userId, offer.pointPrice)
        if (!eligibility.eligible) {
            if (eligibility.code === 'E_INSUFFICIENT_FUNDS') return plain('NO_BALANCE', 200)
            return plain('NO_NUMBERS', 200)
        }

        // ---- Phase 4: atomic lock ----
        const lockResult = await acquireAtomicPurchaseLock(ctx.userId)
        if (!lockResult.acquired) {
            return plain('NO_NUMBERS', 200) // a prior purchase is still running
        }
        lockAcquired = true
        // We use lockResult.token if available; otherwise correlationId
        const token = lockResult.token || lockToken

        const freshPrice = offer.pointPrice
        const providerName = offer.provider
        const serviceName = offer.serviceName
        const countryName = offer.countryName
        const offerServiceCode = offer.providerServiceCode
        const offerCountryCode = offer.providerCountryCode
        const offerServiceName = offer.serviceName
        const offerCountryName = offer.countryName
        const offerServiceIcon = offer.serviceIcon
        const offerCountryIcon = offer.countryIcon

        // ---- Phase 5: reserve + create purchase order + activation ----
        await prisma.$transaction(async (tx) => {
            await WalletService.reserve(
                ctx.userId,
                freshPrice,
                'init',
                `Reserve: ${serviceName}`,
                `v1_${correlationId}`,
                tx
            )
            const po = await tx.purchaseOrder.create({
                data: {
                    userId: ctx.userId,
                    serviceName,
                    countryName,
                    amount: new Prisma.Decimal(freshPrice),
                    status: 'PENDING',
                    expiresAt: new Date(Date.now() + 5 * 60 * 1000)
                }
            })
            purchaseOrderId = po.id

            const activation = await tx.activation.create({
                data: {
                    userId: ctx.userId,
                    price: new Prisma.Decimal(freshPrice),
                    state: 'RESERVED',
                    serviceName,
                    countryCode: offer.providerCountryCode,
                    countryName,
                    operatorId: params.operator || null,
                    providerId: providerName,
                    providerCost: 0,
                    profit: 0,
                    idempotencyKey: `activation_v1_${correlationId}`,
                    reservedTxId: `v1_${correlationId}`
                } as any
            })
            activationId = activation.id
        }, { timeout: 30000 })

        reservedAmount = freshPrice

        // ---- Phase 6: call upstream provider ----
        const startProvider = Date.now()
        let providerResult
        try {
            providerResult = await smsProvider.getNumber(offerCountryCode, offerServiceCode, {
                provider: providerName,
                expectedPrice: freshPrice
            })
        } catch (providerErr: any) {
            logger.error('[V1 getNumber] provider failed', { correlationId, error: providerErr?.message })
            await prisma.$transaction(async (tx) => {
                await WalletService.rollback(ctx.userId, freshPrice, purchaseOrderId!, 'Provider Fail', tx)
                await tx.purchaseOrder.update({ where: { id: purchaseOrderId! }, data: { status: 'FAILED' } })
                if (activationId) await tx.activation.update({ where: { id: activationId }, data: { state: 'FAILED' } })
            })
            await invalidateBalanceCache(ctx.userId)
            return plain('NO_NUMBERS', 200)
        }

        if (!providerResult?.phoneNumber || !providerResult?.activationId) {
            logger.error('[V1 getNumber] provider returned empty result', { correlationId })
            await prisma.$transaction(async (tx) => {
                await WalletService.rollback(ctx.userId, freshPrice, purchaseOrderId!, 'Provider Empty Result', tx)
                await tx.purchaseOrder.update({ where: { id: purchaseOrderId! }, data: { status: 'FAILED' } })
                if (activationId) await tx.activation.update({ where: { id: activationId }, data: { state: 'FAILED' } })
            })
            await invalidateBalanceCache(ctx.userId)
            return plain('NO_NUMBERS', 200)
        }

        // ---- Phase 7: commit + create Number row + link Activation ----
        const resultNumber = await prisma.$transaction(async (tx) => {
            const { formatPhoneNumber } = await import('@/lib/utils/phone-parser')
            const parsedPhone = formatPhoneNumber(providerResult!.phoneNumber)

            const newNumber = await tx.number.create({
                data: {
                    phoneNumber: providerResult!.phoneNumber,
                    phoneCountryCode: parsedPhone.countryCode || null,
                    phoneNationalNumber: parsedPhone.nationalNumber || null,
                    countryName: offerCountryName,
                    countryCode: offer.providerCountryCode,
                    serviceName: offerServiceName,
                    serviceCode: offerServiceCode,
                    price: freshPrice,
                    providerCost: providerResult!.rawPrice || 0,
                    profit: freshPrice - (providerResult!.rawPrice || 0),
                    status: 'active',
                    owner: { connect: { id: ctx.userId } },
                    activationId: providerResult!.activationId,
                    provider: providerName,
                    expiresAt: providerResult!.expiresAt,
                    serviceIconUrl: offerServiceIcon,
                    countryIconUrl: offerCountryIcon
                }
            })

            await WalletService.commit(
                ctx.userId,
                freshPrice,
                newNumber.id,
                `Purchase: ${serviceName}`,
                `tx_${purchaseOrderId}`,
                tx
            )
            await tx.purchaseOrder.update({
                where: { id: purchaseOrderId! },
                data: { status: 'COMPLETED', provider: providerName, activationId: providerResult!.activationId }
            })

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
                } as any
            })

            return newNumber
        }, { timeout: 20000 })

        await recordDailySpend(ctx.userId, freshPrice)
        await releaseAtomicPurchaseLock(ctx.userId, token)
        lockAcquired = false
        await invalidateBalanceCache(ctx.userId)

        const dur = (Date.now() - startProvider) / 1000
        logger.info('[V1 getNumber] success', {
            correlationId,
            activationId: resultNumber.activationId,
            duration: dur
        })

        // "ACCESS_NUMBER:<orderId>:<+E164>" — activationId is the public order id
        return plain(`ACCESS_NUMBER:${resultNumber.activationId}:${resultNumber.phoneNumber}`)

    } catch (err: any) {
        logger.error('[V1 getNumber] critical error', { correlationId, error: err?.message })
        if (lockAcquired) {
            try { await releaseAtomicPurchaseLock(ctx.userId, lockToken) } catch { /* swallow */ }
        }
        if (purchaseOrderId && reservedAmount > 0) {
            try {
                await prisma.$transaction(async (tx) => {
                    await WalletService.rollback(ctx.userId, reservedAmount, purchaseOrderId!, 'Crash Rollback', tx)
                    await tx.purchaseOrder.update({ where: { id: purchaseOrderId! }, data: { status: 'FAILED' } })
                    if (activationId) await tx.activation.update({ where: { id: activationId }, data: { state: 'FAILED' } })
                })
            } catch (e) {
                logger.warn('[V1 getNumber] cleanup rollback failed', { error: (e as Error)?.message, purchaseOrderId })
            }
        }
        if (err instanceof PaymentError) {
            if ((err.code as string) === 'E_INSUFFICIENT_FUNDS') return plain('NO_BALANCE', 200)
        }
        if (
            err instanceof Prisma.PrismaClientKnownRequestError ||
            err instanceof Prisma.PrismaClientUnknownRequestError ||
            err instanceof Prisma.PrismaClientInitializationError ||
            err instanceof Prisma.PrismaClientRustPanicError ||
            (err && typeof err === 'object' && 'name' in err && String(err.name).includes('Prisma'))
        ) {
            return plain('ERROR_SQL', 200)
        }
        return plain('NO_NUMBERS', 200)
    }
}

// ============================================================================
// Action: setStatus
//   Inputs:  id=<activationId> status=<1|3|6|8|-1>
//   On success: "ACCESS_READY" | "ACCESS_RETRY_GET" |
//                "ACCESS_ACTIVATION" | "ACCESS_CANCEL"
//   Codes (provider-faithful mapping):
//     1   -> ACCESS_READY       (mark as received; SMS will appear in getStatus)
//     3   -> ACCESS_RETRY_GET   (ask upstream for another code; best effort)
//     6   -> ACCESS_ACTIVATION  (finalize: mark completed)
//     8   -> ACCESS_ACTIVATION  (number used; finalize as completed)
//     -1  -> ACCESS_CANCEL      (cancel + refund remaining wallet hold)
// ============================================================================

export async function actionSetStatus(
    ctx: { userId: string; apiKey: ApiKey },
    params: { id: string; status: number }
): Promise<Response> {
    const denied = requirePerm(ctx.apiKey, 'numbers')
    if (denied) return denied

    if (!params.id) return plain('NO_ACTIVATION', 200)
    const code = Number(params.status)
    if (isNaN(code) || ![1, 3, 6, 8, -1].includes(code)) return plain('BAD_STATUS', 200)

    const number = await prisma.number.findFirst({
        where: { activationId: params.id, ownerId: ctx.userId }
    })
    if (!number) return plain('NO_ACTIVATION', 200)

    const finalStates = ['completed', 'cancelled', 'expired', 'timeout']
    let responseCode: 'ACCESS_READY' | 'ACCESS_RETRY_GET' | 'ACCESS_ACTIVATION' | 'ACCESS_CANCEL'

    if (code === 1) {
        // "ready" — mark as received; do not finalize, do not cancel
        if (!finalStates.includes(number.status) && number.status !== 'received') {
            await prisma.number.update({
                where: { id: number.id },
                data: { status: 'received' }
            })
        }
        responseCode = 'ACCESS_READY'
    } else if (code === 3) {
        // Request another SMS from provider (best effort) and mark wait_retry
        try {
            await smsProvider.setResendCode?.(params.id)
        } catch (e) {
            logger.warn('[V1 setStatus] provider re-send failed', { error: (e as Error)?.message })
        }
        if (!finalStates.includes(number.status)) {
            await prisma.number.update({
                where: { id: number.id },
                data: { status: 'received' }
            })
        }
        responseCode = 'ACCESS_RETRY_GET'
    } else if (code === 6 || code === 8) {
        // Finalize: "complete" (6) or "number used" (8). Wallet already committed at purchase.
        if (!finalStates.includes(number.status)) {
            await prisma.number.update({
                where: { id: number.id },
                data: { status: 'completed' }
            })
            if (number.activationId) {
                await prisma.activation.updateMany({
                    where: { providerActivationId: number.activationId },
                    data: { state: 'RECEIVED' }
                }).catch(() => {})
            }
        }
        responseCode = 'ACCESS_ACTIVATION'
    } else {
        // -1: cancel and refund (only if not already finalized)
        if (!finalStates.includes(number.status)) {
            try {
                // `number.price` is a Prisma.Decimal; refund accepts `Decimal | number`
                const refundAmount = Number(number.price)
                if (refundAmount > 0) {
                    await WalletService.refund(
                        ctx.userId,
                        refundAmount,
                        'refund',
                        number.id,
                        'User cancellation (V1)',
                        `v1_refund_${number.id}`
                    )
                    await invalidateBalanceCache(ctx.userId)
                }
            } catch (e) {
                logger.warn('[V1 setStatus] refund failed', { error: (e as Error)?.message })
            }
            // Best-effort upstream cancel
            try {
                await smsProvider.setCancel?.(params.id)
            } catch { /* ignore — provider may already consider it closed */ }
            await prisma.number.update({
                where: { id: number.id },
                data: { status: 'cancelled' }
            })
            if (number.activationId) {
                await prisma.activation.updateMany({
                    where: { providerActivationId: number.activationId },
                    data: { state: 'CANCELLED' }
                }).catch(() => {})
            }
        }
        responseCode = 'ACCESS_CANCEL'
    }

    return plain(responseCode, 200)
}

// ============================================================================
// Action: getStatus
//   Inputs:  id=<activationId>
//   On success: JSON {status, message}
//   Codes:
//     STATUS_OK:<code>     -> SMS received, code included
//     STATUS_WAIT_CODE     -> waiting for first SMS
//     STATUS_WAIT_RETRY    -> client previously requested re-send, waiting
//     STATUS_WAIT_RESEND   -> upstream is resending
//     STATUS_CANCEL        -> cancelled (locally or by upstream)
//     STATUS_TIMEOUT       -> expired without a code
//     NO_ACTIVATION        -> id not found / not owned
// ============================================================================

export async function actionGetStatus(
    ctx: { userId: string; apiKey: ApiKey },
    params: { id: string }
): Promise<Response> {
    const denied = requirePerm(ctx.apiKey, 'sms')
    if (denied) return json({ status: false, message: 'BAD_KEY' }, 200)

    if (!params.id) return json({ status: false, message: 'NO_ACTIVATION' }, 200)

    const number = await prisma.number.findFirst({
        where: { activationId: params.id, ownerId: ctx.userId }
    })
    if (!number) return json({ status: false, message: 'NO_ACTIVATION' }, 200)

    const messages = await prisma.smsMessage.findMany({
        where: { numberId: number.id },
        orderBy: { receivedAt: 'desc' },
        take: 1
    })

    const now = new Date()
    const isExpired = number.expiresAt ? now > number.expiresAt : false
    const hasSms = messages.length > 0
    const code = messages[0]?.code ?? ''

    // Cancelled: explicitly set by the user (setStatus -1) or upstream.
    if (number.status === 'cancelled') {
        return json({ status: false, message: 'STATUS_CANCEL' }, 200)
    }
    // Completed (finalize / "number used"): always report OK with the latest code
    // if we have one, otherwise fall through to STATUS_OK with empty code.
    if (number.status === 'completed') {
        return json({ status: true, message: `STATUS_OK:${code}` }, 200)
    }
    // Expired (locally or via expiry timestamp) without an SMS -> timeout
    if (number.status === 'expired' || number.status === 'timeout' || (isExpired && !hasSms)) {
        return json({ status: false, message: 'STATUS_TIMEOUT' }, 200)
    }
    // Received: SMS already captured. If the client previously requested a
    // re-send (pollCount > 0 since the last message) we say STATUS_WAIT_RESEND
    // briefly; otherwise we just return OK with the code.
    if (number.status === 'received') {
        if (!hasSms) {
            // Received flag set but no message row yet (race window)
            return json({ status: true, message: 'STATUS_WAIT_CODE' }, 200)
        }
        // Re-send was requested and we're still waiting for a new message
        if (number.pollCount > 0 && number.lastPolledAt && (!messages[0] || messages[0].receivedAt < number.lastPolledAt)) {
            return json({ status: true, message: 'STATUS_WAIT_RESEND' }, 200)
        }
        return json({ status: true, message: `STATUS_OK:${code}` }, 200)
    }
    // Active, no SMS yet -> waiting
    if (!hasSms) {
        return json({ status: true, message: 'STATUS_WAIT_CODE' }, 200)
    }
    // Fallback: have an SMS and number is still considered active
    return json({ status: true, message: `STATUS_OK:${code}` }, 200)
}

// ============================================================================
// Action: getServicesList
//   On success: JSON {services: [{id, name}]}
//   id = numeric serviceId (internal MeiliDocs ID), NOT legacy string code.
// ============================================================================

export async function actionGetServicesList(
    ctx: { userId: string; apiKey: ApiKey }
): Promise<Response> {
    const denied = requirePerm(ctx.apiKey, 'read')
    if (denied) return json({ services: [] }, 200)

    // Pull aggregates AND serviceId map in parallel
    const [result, lookupRows] = await Promise.all([
        getServiceAggregates({ limit: 200 }),
        prisma.serviceLookup.findMany({ select: { serviceId: true, serviceCode: true, serviceName: true } })
    ])
    const idByCode = new Map<string, number>()
    for (const r of lookupRows) idByCode.set(r.serviceCode, r.serviceId)

    const services: Array<{ id: number; name: string }> = []
    for (const s of result.items) {
        const id = idByCode.get(s.serviceCode)
        if (id !== undefined && id !== null) {
            services.push({
                id,
                name: s.serviceName
            })
        }
    }

    return json({ services }, 200)
}

// ============================================================================
// Action: getCountriesList
//   Inputs:  service=<serviceId|numeric> (optional)
//   On success: JSON {countries: [{id, name, minPrice?, totalStock?, serverCount?}]}
//   id = numeric countryId, NOT legacy string code.
// ============================================================================

export async function actionGetCountriesList(
    ctx: { userId: string; apiKey: ApiKey },
    params: { service?: string }
): Promise<Response> {
    const denied = requirePerm(ctx.apiKey, 'read')
    if (denied) return json({ countries: [] }, 200)

    if (!params.service) {
        const countries = await prisma.countryLookup.findMany({
            orderBy: { countryName: 'asc' },
            take: 500
        })
        return json({
            countries: countries.map((c) => ({
                id: c.countryId,
                name: c.countryName
            }))
        }, 200)
    }

    // service param is a numeric serviceId now
    const svcId = Number(params.service)
    if (!Number.isFinite(svcId) || svcId <= 0) {
        return json({ countries: [] }, 200)
    }

    // Resolve the serviceCode so we can re-use searchCountries (which keys on code),
    // then map results back to numeric countryId.
    const svcLookup = await prisma.serviceLookup.findUnique({ where: { serviceId: svcId } })
    if (!svcLookup) return json({ countries: [] }, 200)

    const [result, countryRows] = await Promise.all([
        searchCountries(svcLookup.serviceCode, '', { limit: 500 }),
        prisma.countryLookup.findMany({ select: { countryId: true, countryCode: true } })
    ])
    const idByCode = new Map<string, number>()
    for (const r of countryRows) idByCode.set(r.countryCode, r.countryId)

    return json({
        countries: result.countries.map((c: any) => ({
            id: idByCode.get(c.code) ?? c.identifier ?? null,
            name: c.name,
            minPrice: c.lowestPrice,
            totalStock: c.totalStock,
            serverCount: c.serverCount
        }))
    }, 200)
}

// ============================================================================
// Action: getPrices
//   Inputs:  service=<id> country=<id> (both optional numeric IDs, not codes)
//   On success: JSON keyed by serviceId; each value has {cost, count}
//               Plus resolved names (serviceName, countryName) for human use.
//   Universal shape across all filter modes:
//     - no filter:      { "<serviceId>": { cost, count, serviceName, countries: { "<countryId>": { cost, count, countryName } } } }
//     - service only:   { "<serviceId>": { cost, count, serviceName, countries: { "<countryId>": { cost, count, countryName } } } }
//     - country only:   { "<serviceId>": { cost, count, serviceName, countryId, countryName } }   (one entry per matching service)
//     - both:           { "<serviceId>": { cost, count, serviceName, countryId, countryName, operators: {...} } }
//   NO string codes (no "tg", "wa", "0", "6") — only numeric IDs and names.
// ============================================================================

interface PriceEntry {
    cost: number
    count: number
    serviceName: string
    countryId?: number
    countryName?: string
    countries?: Record<string, { cost: number; count: number; countryName: string }>
    operators?: Record<string, { operator_name: string; price: number }>
}

export async function actionGetPrices(
    ctx: { userId: string; apiKey: ApiKey },
    params: { service?: string; country?: string }
): Promise<Response> {
    const denied = requirePerm(ctx.apiKey, 'read')
    if (denied) return json({}, 200)

    try {
        const index = meili.index(INDEXES.OFFERS)

        // Build Meili filter from numeric IDs only
        const filters: string[] = ['isActive = true']
        if (params.service) {
            const svcId = Number(params.service)
            if (Number.isFinite(svcId) && svcId > 0) {
                filters.push(`serviceId = ${svcId}`)
            } else {
                return json({}, 200) // invalid id → empty
            }
        }
        if (params.country) {
            const ctyId = Number(params.country)
            if (Number.isFinite(ctyId) && ctyId > 0) {
                filters.push(`countryId = ${ctyId}`)
            } else {
                return json({}, 200) // invalid id → empty
            }
        }

        // Pull all matching offers (one row per service×country×operator)
        const result = await index.search('', {
            filter: filters.join(' AND '),
            limit: 5000
        })

        const hits = result.hits as OfferDocument[]
        if (hits.length === 0) return json({}, 200)

        // ── Mode: BOTH filters (service + country) ───────────────────────────
        // Return one serviceId entry with operator list (operator-wise pricing).
        if (params.service && params.country) {
            const svcId = Number(params.service)
            const ctyId = Number(params.country)
            const first = hits[0]
            const operators: Record<string, { operator_name: string; price: number }> = {}
            for (const hit of hits) {
                const opName = hit.operator || hit.provider || 'any'
                operators[opName] = {
                    operator_name: opName,
                    price: Number(hit.pointPrice) || 0
                }
            }
            const minCost = Math.min(...hits.map((h) => Number(h.pointPrice) || 0))
            const totalCount = hits.reduce((s, h) => s + (Number(h.stock) || 0), 0)
            const out: Record<string, PriceEntry> = {
                [String(svcId)]: {
                    cost: minCost,
                    count: totalCount,
                    serviceName: first.serviceName || '',
                    countryId: ctyId,
                    countryName: first.countryName || '',
                    operators
                }
            }
            return json(out, 200)
        }

        // ── Mode: SERVICE only ───────────────────────────────────────────────
        // Return one serviceId with nested countries map.
        if (params.service) {
            const svcId = Number(params.service)
            const first = hits[0]
            const countries: Record<string, { cost: number; count: number; countryName: string }> = {}
            for (const hit of hits) {
                const cid = String(hit.countryId)
                if (!countries[cid]) {
                    countries[cid] = {
                        cost: Number(hit.pointPrice) || 0,
                        count: Number(hit.stock) || 0,
                        countryName: hit.countryName || ''
                    }
                } else {
                    // keep lowest cost, sum stock
                    const cur = countries[cid]
                    cur.cost = Math.min(cur.cost, Number(hit.pointPrice) || 0)
                    cur.count += Number(hit.stock) || 0
                }
            }
            const minCost = Math.min(...hits.map((h) => Number(h.pointPrice) || 0))
            const totalCount = hits.reduce((s, h) => s + (Number(h.stock) || 0), 0)
            const out: Record<string, PriceEntry> = {
                [String(svcId)]: {
                    cost: minCost,
                    count: totalCount,
                    serviceName: first.serviceName || '',
                    countries
                }
            }
            return json(out, 200)
        }

        // ── Mode: COUNTRY only ───────────────────────────────────────────────
        // Return one entry per matching service (not nested by country).
        if (params.country) {
            const ctyId = Number(params.country)
            const first = hits[0]
            const bySvc: Record<string, PriceEntry> = {}
            for (const hit of hits) {
                const sid = String(hit.serviceId)
                if (!bySvc[sid]) {
                    bySvc[sid] = {
                        cost: Number(hit.pointPrice) || 0,
                        count: Number(hit.stock) || 0,
                        serviceName: hit.serviceName || '',
                        countryId: ctyId,
                        countryName: hit.countryName || first.countryName || ''
                    }
                } else {
                    const cur = bySvc[sid]
                    cur.cost = Math.min(cur.cost, Number(hit.pointPrice) || 0)
                    cur.count += Number(hit.stock) || 0
                }
            }
            return json(bySvc, 200)
        }

        // ── Mode: NO filter (full matrix) ───────────────────────────────────
        // Return one entry per serviceId, each with nested countries map.
        const bySvc: Record<string, PriceEntry> = {}
        for (const hit of hits) {
            const sid = String(hit.serviceId)
            if (!bySvc[sid]) {
                bySvc[sid] = {
                    cost: Number(hit.pointPrice) || 0,
                    count: 0,
                    serviceName: hit.serviceName || '',
                    countries: {}
                }
            }
            const cur = bySvc[sid]
            cur.cost = Math.min(cur.cost, Number(hit.pointPrice) || 0)
            cur.count += Number(hit.stock) || 0
            const cid = String(hit.countryId)
            if (cur.countries && !cur.countries[cid]) {
                cur.countries[cid] = {
                    cost: Number(hit.pointPrice) || 0,
                    count: Number(hit.stock) || 0,
                    countryName: hit.countryName || ''
                }
            }
        }
        return json(bySvc, 200)
    } catch {
        return json({}, 200)
    }
}

// ============================================================================
// Action: getNumbersStatus
//   Inputs:  (none)
//   On success: JSON {<activationId>: {phone, sms:[{sender, code, content}, ...], ...}, ...}
//   Returns the user's currently-active numbers (last 100).
// ============================================================================

export async function actionGetNumbersStatus(
    ctx: { userId: string; apiKey: ApiKey }
): Promise<Response> {
    const denied = requirePerm(ctx.apiKey, 'numbers')
    if (denied) return json({}, 200)

    const active = await prisma.number.findMany({
        where: {
            ownerId: ctx.userId,
            status: { in: ['active', 'received'] }
        },
        orderBy: { createdAt: 'desc' },
        take: 100
    })

    if (active.length === 0) return json({}, 200)

    // Resolve numeric IDs from lookup tables (one batch query per type)
    const countryCodes = Array.from(new Set(active.map((n) => n.countryCode).filter(Boolean)))
    const serviceCodes = Array.from(
        new Set(active.map((n) => n.serviceCode).filter((c): c is string => Boolean(c)))
    )
    const [countryRows, serviceRows, ids, messages] = await Promise.all([
        countryCodes.length
            ? prisma.countryLookup.findMany({
                  where: { countryCode: { in: countryCodes } },
                  select: { countryCode: true, countryId: true }
              })
            : Promise.resolve([]),
        serviceCodes.length
            ? prisma.serviceLookup.findMany({
                  where: { serviceCode: { in: serviceCodes } },
                  select: { serviceCode: true, serviceId: true }
              })
            : Promise.resolve([]),
        Promise.resolve(active.map((n) => n.id)),
        prisma.smsMessage.findMany({
            where: { numberId: { in: active.map((n) => n.id) } },
            orderBy: { receivedAt: 'desc' }
        })
    ])
    const countryIdByCode = new Map<string, number>()
    for (const r of countryRows) countryIdByCode.set(r.countryCode, r.countryId)
    const serviceIdByCode = new Map<string, number>()
    for (const r of serviceRows) serviceIdByCode.set(r.serviceCode, r.serviceId)

    const messagesByNumber = new Map<string, typeof messages>()
    for (const m of messages) {
        const list = messagesByNumber.get(m.numberId) ?? []
        list.push(m)
        messagesByNumber.set(m.numberId, list)
    }

    const out: Record<string, any> = {}
    for (const n of active) {
        if (!n.activationId) continue
        const smsList = messagesByNumber.get(n.id) ?? []
        out[n.activationId] = {
            phone: n.phoneNumber,
            countryId: countryIdByCode.get(n.countryCode) ?? null,
            countryName: n.countryName ?? '',
            serviceId: n.serviceCode ? serviceIdByCode.get(n.serviceCode) ?? null : null,
            serviceName: n.serviceName ?? '',
            status: n.status,
            sms: smsList.map((msg) => ({
                sender: msg.sender ?? '',
                code: msg.code ?? '',
                content: msg.content ?? '',
                receivedAt: msg.receivedAt.toISOString()
            }))
        }
    }
    return json(out, 200)
}
