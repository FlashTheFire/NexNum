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

async function parseRequestParams(request: NextRequest): Promise<URLSearchParams> {
    const params = new URLSearchParams(request.nextUrl.searchParams)
    if (request.method === 'POST') {
        try {
            const reqClone = request.clone()
            const contentType = reqClone.headers.get('content-type') || ''
            if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
                const formData = await reqClone.formData()
                formData.forEach((value, key) => {
                    if (typeof value === 'string') {
                        params.set(key, value)
                    }
                })
            } else {
                const text = await reqClone.text()
                if (text) {
                    const bodyParams = new URLSearchParams(text)
                    bodyParams.forEach((value, key) => {
                        params.set(key, value)
                    })
                }
            }
        } catch {
            // Fallback to URL searchParams
        }
    }
    return params
}

async function handleAction(request: NextRequest, ctx: any) {
    const params = await parseRequestParams(request)
    const action = (params.get('action') || '').trim()

    const shared = {
        userId: ctx.userId,
        apiKey: ctx.apiKey
    }

    switch (action) {
        case 'getBalance':
            return actionGetBalance(shared)

        case 'getNumber': {
            const maxPrice = asNumber(params.get('maxPrice') ?? undefined)
            return actionGetNumber(shared, {
                service: params.get('service') || '',
                country: params.get('country') || '',
                operator: params.get('operator') ?? undefined,
                maxPrice
            })
        }

        case 'setStatus': {
            const rawStatus = params.get('status') ?? undefined
            const status = asNumber(rawStatus)
            if (status === undefined) {
                return new Response('BAD_STATUS', {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                })
            }
            return actionSetStatus(shared, {
                id: params.get('id') || '',
                status
            })
        }

        case 'getStatus':
            return actionGetStatus(shared, { id: params.get('id') || '' })

        case 'getServicesList':
            return actionGetServicesList(shared)

        case 'getCountriesList':
            return actionGetCountriesList(shared)

        case 'getPrices':
            return actionGetPrices(shared, {
                service: params.get('service') ?? undefined,
                country: params.get('country') ?? undefined
            })

        case 'getNumbersStatus':
            return actionGetNumbersStatus(shared)

        default:
            return new Response('BAD_ACTION', {
                status: 200,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            })
    }
}

export const GET = withV1Auth(async (request, ctx) => {
    return handleAction(request, ctx)
})

export const POST = withV1Auth(async (request, ctx) => {
    return handleAction(request, ctx)
})
