/**
 * API Key Authentication Middleware (Professional Edition)
 * 
 * Standardized middleware for authenticating requests using API keys.
 * Integrated with ResponseFactory for industrial consistency.
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, hasPermission, getRateLimit } from './api-keys'
import type { ApiKey } from '@prisma/client'
import { rateLimiters } from '@/lib/auth/ratelimit'
import { ResponseFactory } from './response-factory'

export interface ApiAuthContext {
    apiKey: ApiKey
    userId: string
    permissions: string[]
}

export interface ApiAuthResult {
    success: boolean
    context?: ApiAuthContext
    error?: NextResponse
}

/**
 * Extract API key from request
 * SECURITY: Only headers are supported. 
 */
function extractApiKey(request: NextRequest): string | null {
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice(7)
    }

    const apiKeyHeader = request.headers.get('x-api-key')
    if (apiKeyHeader) {
        return apiKeyHeader
    }

    return null
}

/**
 * Get client IP from request
 */
function getClientIp(request: NextRequest): string | undefined {
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded) return forwarded.split(',')[0].trim()

    const realIp = request.headers.get('x-real-ip')
    if (realIp) return realIp

    return undefined
}

/**
 * Authenticate request using API key
 */
export async function authenticateApiKey(request: NextRequest): Promise<ApiAuthResult> {
    const rawKey = extractApiKey(request)

    if (!rawKey) {
        return {
            success: false,
            error: ResponseFactory.error('API key required. Provide via Authorization or X-API-Key header.', 401, 'E_MISSING_API_KEY')
        }
    }

    const clientIp = getClientIp(request)
    const result = await validateApiKey(rawKey, clientIp)

    if (!result.valid || !result.key) {
        return {
            success: false,
            error: ResponseFactory.error(result.error || 'Invalid API key', 401, 'E_INVALID_API_KEY')
        }
    }

    const apiKey = result.key

    // Check rate limit
    const keyLimit = getRateLimit(apiKey)
    const rateLimitResult = await rateLimiters.api.limit(`apikey:${apiKey.id}`, keyLimit)

    if (!rateLimitResult.success) {
        const response = ResponseFactory.error('Rate limit exceeded', 429, 'E_RATE_LIMIT_EXCEEDED')
        response.headers.set('X-RateLimit-Limit', keyLimit.toString())
        response.headers.set('X-RateLimit-Remaining', '0')
        response.headers.set('X-RateLimit-Reset', rateLimitResult.reset.toString())
        return { success: false, error: response }
    }

    return {
        success: true,
        context: {
            apiKey,
            userId: apiKey.userId,
            permissions: apiKey.permissions
        }
    }
}

// ============================================================================
// V1 (Provider-Compatible) Authentication
// ----------------------------------------------------------------------------
// Used by the drop-in `/stubs/handler_api.php` endpoint that mirrors the
// legacy `handler_api.php` contract consumed from upstream SMS providers.
//
// Differences from `authenticateApiKey`:
//   1. API key may be passed via `?api_key=` query string (provider style).
//   2. Error responses are plain-text (e.g. "NO_KEY", "BAD_KEY") to match
//      the legacy wire format — NOT the ResponseFactory JSON envelope.
//   3. Rate-limit headers are emitted on the same plain-text response so
//      caller-side SDKs (which only read body) keep working unchanged.
// ============================================================================

export type V1AuthErrorCode =
    | 'NO_KEY'        // No api_key in query, header, or bearer token
    | 'BAD_KEY'       // Key provided but not found / inactive / revoked
    | 'BAD_SERVICE'   // Not a real error today, reserved
    | 'RATE_LIMIT_EXCEEDED'

export interface V1AuthContext {
    apiKey: ApiKey
    userId: string
    permissions: string[]
    keyId: string
}

/** Extract API key from query string FIRST, then headers or POST body (provider-style priority order). */
async function extractApiKeyV1(request: NextRequest): Promise<string | null> {
    // Provider legacy contract: ?api_key=... is the most common form
    const fromQuery = request.nextUrl.searchParams.get('api_key')
    if (fromQuery) return fromQuery.trim()

    // Bearer header — used by JSON header-mode clients
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim()

    // Direct header — alternate transport
    const apiKeyHeader = request.headers.get('x-api-key')
    if (apiKeyHeader) return apiKeyHeader.trim()

    if (request.method === 'POST') {
        try {
            const reqClone = request.clone()
            const contentType = reqClone.headers.get('content-type') || ''
            if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
                const formData = await reqClone.formData()
                const key = formData.get('api_key')
                if (key && typeof key === 'string') return key.trim()
            } else {
                const text = await reqClone.text()
                if (text) {
                    const params = new URLSearchParams(text)
                    const key = params.get('api_key')
                    if (key) return key.trim()
                }
            }
        } catch {
            // Ignore parse errors
        }
    }

    return null
}

/**
 * V1 (provider-compatible) authentication.
 *
 * Returns plain-text `Response` objects that match the legacy wire format
 * so callers reading the body byte-for-byte see the expected error codes.
 * On success, returns the validated API key context (no Response).
 */
export async function authenticateApiKeyV1(
    request: NextRequest
): Promise<
    | { ok: true; context: V1AuthContext }
    | { ok: false; code: V1AuthErrorCode; status: number; message: string; headers?: Record<string, string> }
> {
    const rawKey = await extractApiKeyV1(request)

    if (!rawKey) {
        return { ok: false, code: 'NO_KEY', status: 200, message: 'NO_KEY' }
    }

    const clientIp = getClientIp(request)
    const result = await validateApiKey(rawKey, clientIp)

    if (!result.valid || !result.key) {
        return { ok: false, code: 'BAD_KEY', status: 200, message: 'BAD_KEY' }
    }

    const apiKey = result.key

    // Tier-aware rate limit (FREE=60, PRO=300, ENTERPRISE=1000 req/min)
    const keyLimit = getRateLimit(apiKey)
    const rateLimitResult = await rateLimiters.api.limit(`apikey:v1:${apiKey.id}`, keyLimit)

    if (!rateLimitResult.success) {
        return {
            ok: false,
            code: 'RATE_LIMIT_EXCEEDED',
            status: 429,
            message: 'RATE_LIMIT_EXCEEDED',
            headers: {
                'X-RateLimit-Limit': keyLimit.toString(),
                'X-RateLimit-Remaining': (rateLimitResult.remaining ?? 0).toString(),
                'X-RateLimit-Reset': (rateLimitResult.reset ?? 0).toString()
            }
        }
    }

    return {
        ok: true,
        context: {
            apiKey,
            userId: apiKey.userId,
            permissions: apiKey.permissions,
            keyId: apiKey.id
        }
    }
}

/**
 * Wrap a V1 (provider-style) handler with auth + a minimal success body
 * that lets the caller decide the on-wire format (plain text or JSON).
 */
export function withV1Auth<P = unknown>(
    handler: (
        request: NextRequest,
        context: V1AuthContext,
        params: P
    ) => Promise<Response>
) {
    return async (
        request: NextRequest,
        ctx: { params: Promise<P> }
    ): Promise<Response> => {
        const auth = await authenticateApiKeyV1(request)
        if (!auth.ok) {
            return new Response(auth.message, {
                status: auth.status,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Cache-Control': 'no-store',
                    ...(auth.headers || {})
                }
            })
        }
        const params = (ctx?.params ? await ctx.params : ({} as P)) as P
        try {
            return await handler(request, auth.context, params)
        } catch (error) {
            return new Response('ERROR_SQL', {
                status: 200,
                headers: {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Cache-Control': 'no-store'
                }
            })
        }
    }
}

/**
 * Require specific permission
 */
export function requirePermission(context: ApiAuthContext, permission: string): NextResponse | null {
    if (!hasPermission(context.apiKey, permission)) {
        return ResponseFactory.error(`Permission denied. Required: ${permission}`, 403, 'E_PERMISSION_DENIED')
    }
    return null
}

/**
 * Wrapper for API routes that require API key auth
 */
export function withApiKeyAuth(
    handler: (request: NextRequest, context: ApiAuthContext) => Promise<NextResponse>,
    requiredPermission?: string
) {
    return async (request: NextRequest): Promise<NextResponse> => {
        const authResult = await authenticateApiKey(request)

        if (!authResult.success) {
            return authResult.error!
        }

        const ctx = authResult.context!

        if (requiredPermission) {
            const permError = requirePermission(ctx, requiredPermission)
            if (permError) return permError
        }

        return handler(request, ctx)
    }
}

// ============================================================================
// Compatibility Aliases (Standardizing on ResponseFactory)
// ============================================================================

export function apiSuccess<T>(data: T, status: number = 200) {
    return ResponseFactory.success(data, status)
}

export function apiError(message: string, status: number = 400, code?: string) {
    return ResponseFactory.error(message, status, code)
}
