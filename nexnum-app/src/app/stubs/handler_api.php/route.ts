/**
 * V1 (Provider-Compatible) API — Single Entry Point
 * ----------------------------------------------------------------------------
 * Mirrors the legacy `handler_api.php` contract used by SMS providers
 * (5sim, sms-activate, GrizzlySMS, etc.) so existing bot code can target
 * NexNum without any modification.
 *
 *   URL:  /stubs/handler_api.php?action=<name>&api_key=<key>[&...]
 *   Auth: ?api_key=...  OR  Authorization: Bearer <key>  OR  X-API-Key
 *   Res:  plain-text or JSON depending on action (see v1-actions.ts)
 *
 * Supported actions:
 *   getBalance, getNumber, setStatus, getStatus,
 *   getServicesList, getCountriesList, getPrices, getNumbersStatus
 *
 * The .php extension in the segment is purely cosmetic — it lets users
 * migrate by replacing their provider's base URL with NexNum's without
 * touching the path. Next.js App Router supports arbitrary segment names
 * including dots.
 */

import { NextRequest } from 'next/server'
import { withV1Auth } from '@/lib/api/api-middleware'
import {
    actionGetBalance,
    actionGetNumber,
    actionSetStatus,
    actionGetStatus,
    actionGetServicesList,
    actionGetCountriesList,
    actionGetPrices,
    actionGetNumbersStatus
} from '@/lib/api/v1-actions'

function getParam(req: NextRequest, name: string): string | undefined {
    return req.nextUrl.searchParams.get(name) ?? undefined
}

function asNumber(value: string | undefined): number | undefined {
    if (value === undefined || value === null || value === '') return undefined
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
}

export const GET = withV1Auth(async (request, ctx) => {
    const action = (request.nextUrl.searchParams.get('action') || '').trim()

    const shared = {
        userId: ctx.userId,
        apiKey: ctx.apiKey
    }

    switch (action) {
        case 'getBalance':
            return actionGetBalance(shared)

        case 'getNumber': {
            const maxPrice = asNumber(getParam(request, 'maxPrice'))
            return actionGetNumber(shared, {
                service: getParam(request, 'service') || '',
                country: getParam(request, 'country') || '',
                operator: getParam(request, 'operator'),
                maxPrice
            })
        }

        case 'setStatus': {
            const status = asNumber(getParam(request, 'status'))
            if (status === undefined) {
                return new Response('NO_ACTIVATION', {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                })
            }
            return actionSetStatus(shared, {
                id: getParam(request, 'id') || '',
                status
            })
        }

        case 'getStatus':
            return actionGetStatus(shared, { id: getParam(request, 'id') || '' })

        case 'getServicesList':
            return actionGetServicesList(shared)

        case 'getCountriesList':
            return actionGetCountriesList(shared, { service: getParam(request, 'service') })

        case 'getPrices':
            return actionGetPrices(shared, {
                service: getParam(request, 'service'),
                country: getParam(request, 'country')
            })

        case 'getNumbersStatus':
            return actionGetNumbersStatus(shared)

        default:
            return new Response('BAD_ACTION', {
                status: 200,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            })
    }
})

// Some provider SDKs probe POST first; mirror GET semantics so they don't 405.
export const POST = GET
