/**
 * API Key Authentication Middleware
 * 
 * Middleware for authenticating requests using API keys.
 * Supports both Bearer token and X-API-Key header formats.
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, hasPermission, getRateLimit } from './api-keys'
import type { ApiKey } from '@prisma/client'
import { rateLimiters } from '@/lib/auth/ratelimit'

// Use the existing rate limiter from lib/auth/ratelimit.ts

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
 * Standard API error response
 */
export function apiError(message: string, status: number = 400, code?: string): NextResponse {
    return NextResponse.json({
        success: false,
        error: {
            message,
            code: code || 'API_ERROR',
            status
        }
    }, { status })
}

/**
 * Extract API key from request
 * SECURITY: Only headers are supported. Query params were removed to prevent keys in logs.
 */
function extractApiKey(request: NextRequest): string | null {
    // Check Authorization header (Bearer token)
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.slice(7)
    }

    // Check X-API-Key header
    const apiKeyHeader = request.headers.get('x-api-key')
    if (apiKeyHeader) {
        return apiKeyHeader
    }

    // REMOVED: Query parameter support (security risk - keys appear in logs)
    // const apiKeyParam = url.searchParams.get('api_key')

    return null
}

/**
 * Get client IP from request
 */
function getClientIp(request: NextRequest): string | undefined {
    // Check for forwarded IP
    const forwarded = request.headers.get('x-forwarded-for')
    if (forwarded) {
        return forwarded.split(',')[0].trim()
    }

    // Check real IP header
    const realIp = request.headers.get('x-real-ip')
    if (realIp) {
        return realIp
    }

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
            error: apiError('API key required. Provide via Authorization header (Bearer) or X-API-Key header.', 401, 'MISSING_API_KEY')
        }
    }

    const clientIp = getClientIp(request)
    const result = await validateApiKey(rawKey, clientIp)

    if (!result.valid || !result.key) {
        return {
            success: false,
            error: apiError(result.error || 'Invalid API key', 401, 'INVALID_API_KEY')
        }
    }

    const apiKey = result.key

    // Check rate limit using existing rate limiter
    const keyLimit = getRateLimit(apiKey)
    const rateLimitResult = await rateLimiters.api.limit(`apikey:${apiKey.id}`)

    if (!rateLimitResult.success) {
        const response = apiError('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED')
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
        return apiError(`Permission denied. Required: ${permission}`, 403, 'PERMISSION_DENIED')
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

        // Check required permission
        if (requiredPermission) {
            const permError = requirePermission(ctx, requiredPermission)
            if (permError) return permError
        }

        // Call the handler
        return handler(request, ctx)
    }
}

/**
 * Standard API success response
 */
export function apiSuccess<T>(data: T, status: number = 200): NextResponse {
    return NextResponse.json({
        success: true,
        data
    }, { status })
}
