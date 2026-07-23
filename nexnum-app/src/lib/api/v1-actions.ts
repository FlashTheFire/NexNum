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
 *   getServicesList  | JSON {services: [{id,name,code,price}]}   | JSON {services:[]}
 *   getCountriesList | JSON {countries: [{id,name,code,price}]}  | JSON {countries:[]}
 *   getPrices        | JSON {<service>: {<country>: price}}      | JSON {}
 *   getNumbersStatus | JSON {<activationId>: {phone,sms,...}}    | JSON {}
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
import { getOfferForPurchase, searchCountries } from '@/lib/search/search'
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
        const validation = validatePurchaseInput({
            countryCode: params.country,
            serviceCode: params.service
        })
        if (!validation.valid || !validation.sanitized) {
            return plain('BAD_SERVICE', 200)
        }

        // ---- Phase 2: offer lookup ----
        const offer = await getOfferForPurchase(params.service, params.country)
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
            return plain('RATE_LIMIT_EXCEEDED', 200)
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
    if (![1, 3, 6, 8, -1].includes(code)) return plain('NO_ACTIVATION', 200)

    const number = await prisma.number.findFirst({
        where: { activationId: params.id, ownerId: ctx.userId }
    })
    if (!number) return plain('NO_ACTIVATION', 200)

    const finalStates = ['completed', 'cancelled', 'expired', 'timeout']
    let responseCode: 'ACCESS_READY' | 'ACCESS_RETRY_GET' | 'ACCESS_ACTIVATION' | 'ACCESS_CANCEL'

    if (code === 1) {
        // "ready" — mark as received; do not finalize, do not cancel
        if (number.status !== 'received' && number.status !== 'completed') {
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
//   On success: JSON {services: [{id, name, code, lowestPrice, totalStock, countryCount, providerCount}]}
// ============================================================================

export async function actionGetServicesList(
    ctx: { userId: string; apiKey: ApiKey }
): Promise<Response> {
    const denied = requirePerm(ctx.apiKey, 'read')
    if (denied) return json({ services: [] }, 200)

    const result = await getServiceAggregates({ limit: 200 })
    return json({
        services: result.items.map((s: any) => ({
            id: s.serviceCode,
            code: s.serviceCode,
            name: s.serviceName,
            lowestPrice: Number(s.lowestPrice),
            totalStock: Number(s.totalStock),
            countryCount: s.countryCount,
            providerCount: s.providerCount
        }))
    }, 200)
}

// ============================================================================
// Action: getCountriesList
//   Inputs:  service=<code> (optional; when provided, returns pricing for that service)
//   On success: JSON {countries: [{id, name, code, minPrice}]}
// ============================================================================

export async function actionGetCountriesList(
    ctx: { userId: string; apiKey: ApiKey },
    params: { service?: string }
): Promise<Response> {
    const denied = requirePerm(ctx.apiKey, 'read')
    if (denied) return json({ countries: [] }, 200)

    if (!params.service) {
        // Without a service, return the master country list from the lookup table
        const countries = await prisma.countryLookup.findMany({
            orderBy: { countryName: 'asc' },
            take: 500
        })
        return json({
            countries: countries.map((c) => ({
                id: c.countryCode,
                code: c.countryCode,
                name: c.countryName
            }))
        }, 200)
    }

    const result = await searchCountries(params.service, '', { limit: 500 })
    return json({
        countries: result.countries.map((c) => ({
            id: c.identifier || c.code,
            code: c.code,
            name: c.name,
            minPrice: c.lowestPrice,
            totalStock: c.totalStock,
            serverCount: c.serverCount
        }))
    }, 200)
}

// ============================================================================
// Action: getPrices
//   Inputs:  service=<code> country=<code> (both optional, used to filter)
//   On success: JSON {<service>: {<country>: price, ...}, ...}
// ============================================================================

export async function actionGetPrices(
    ctx: { userId: string; apiKey: ApiKey },
    params: { service?: string; country?: string }
): Promise<Response> {
    const denied = requirePerm(ctx.apiKey, 'read')
    if (denied) return json({}, 200)

    // Pull service list (and per-service country prices) from Meili-backed
    // aggregates. `ProviderOffer` does not exist as a Prisma model — pricing
    // lives in the search index, so we use `getServiceAggregates` and
    // `searchCountries` to build the legacy `{service: {country: price}}`
    // shape.
    const servicesResult = await getServiceAggregates({ limit: 200 })
    const filteredServices = params.service
        ? servicesResult.items.filter((s: any) => s.serviceCode === params.service)
        : servicesResult.items

    const prices: Record<string, Record<string, number>> = {}
    for (const s of filteredServices) {
        const svc = s.serviceCode
        if (!svc) continue
        const countriesRes = await searchCountries(svc, '', { limit: 200 })
        const countries = params.country
            ? countriesRes.countries.filter((c) => c.code === params.country)
            : countriesRes.countries
        if (countries.length === 0) continue
        prices[svc] = {}
        for (const c of countries) {
            prices[svc][c.code] = Number(c.lowestPrice) || 0
        }
    }
    return json(prices, 200)
}

// ============================================================================
// Action: getNumbersStatus
//   Inputs:  (none)
//   On success: JSON {<activationId>: {phone, sms:{sender, code, content}, ...}, ...}
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

    const ids = active.map((n) => n.id)
    const messages = await prisma.smsMessage.findMany({
        where: { numberId: { in: ids } },
        orderBy: { receivedAt: 'desc' }
    })
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
        const first = smsList[0]
        out[n.activationId] = {
            phone: n.phoneNumber,
            country: n.countryCode,
            service: n.serviceCode,
            status: n.status,
            sms: first
                ? {
                    sender: first.sender ?? '',
                    code: first.code ?? '',
                    content: first.content ?? '',
                    receivedAt: first.receivedAt.toISOString()
                }
                : null
        }
    }
    return json(out, 200)
}
