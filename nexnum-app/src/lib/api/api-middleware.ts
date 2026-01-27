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
