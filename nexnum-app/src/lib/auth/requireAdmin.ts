import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth/jwt'
import { redis } from '@/lib/core/redis'

export type AdminAuth = {
    userId: string
    email: string
}

// Redis key for storing recent API logs
const LOGS_KEY = 'admin:api_logs'
const MAX_LOGS = 100

/**
 * Log an API request to Redis for monitoring
 */
async function logApiRequest(request: Request, status: number) {
    try {
        const url = new URL(request.url)

        // Skip logging the logs endpoint itself to avoid recursion
        if (url.pathname.includes('/system/logs') || url.pathname.includes('/system/metrics')) {
            return
        }

        const logEntry = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            method: request.method,
            path: url.pathname,
            status,
            duration: 0, // We don't have timing here, but this is fine
            ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
        }

        // Push to Redis list (non-blocking)
        await redis.lpush(LOGS_KEY, JSON.stringify(logEntry))
        await redis.ltrim(LOGS_KEY, 0, MAX_LOGS - 1)
    } catch (e) {
        // Don't let logging errors affect the request
        console.error('API log error:', e)
    }
}

/**
 * Centralized admin authentication check for API routes.
 * Returns admin info if authenticated, or null if not.
 * 
 * @example
 * export async function GET(request: Request) {
 *     const adminAuth = await checkAdmin(request)
 *     if (!adminAuth) return unauthorized()
 *     // Use adminAuth.userId, adminAuth.email...
 * }
 */
export async function checkAdmin(request: Request): Promise<AdminAuth | null> {
    // Extract token from cookie
    const cookieHeader = request.headers.get('cookie') || ''
    const tokenMatch = cookieHeader.match(/token=([^;]+)/)
    const token = tokenMatch?.[1]

    if (!token) {
        await logApiRequest(request, 401)
        return null
    }

    try {
        const payload = await verifyToken(token)
        if (!payload) {
            await logApiRequest(request, 401)
            return null
        }
        if (payload.role !== 'ADMIN') {
            await logApiRequest(request, 403)
            return null
        }

        // Log successful admin API access
        await logApiRequest(request, 200)

        return {
            userId: payload.userId,
            email: payload.email
        }
    } catch {
        await logApiRequest(request, 401)
        return null
    }
}

/**
 * Standard unauthorized response
 */
export function unauthorized(message = 'Authentication required'): NextResponse {
    return NextResponse.json({ error: message }, { status: 401 })
}

/**
 * Standard forbidden response
 */
export function forbidden(message = 'Admin access required'): NextResponse {
    return NextResponse.json({ error: message }, { status: 403 })
}

/**
 * Legacy compatibility: requireAdmin that returns error directly
 * Use pattern: const auth = await requireAdmin(request); if (auth.error) return auth.error
 */
export async function requireAdmin(request: Request): Promise<{ userId: string; email: string; error?: never } | { error: NextResponse; userId?: never; email?: never }> {
    const admin = await checkAdmin(request)
    if (!admin) {
        return { error: unauthorized() }
    }
    return { userId: admin.userId, email: admin.email }
}

/**
 * Redact sensitive fields from provider objects before sending to client.
 * Always use this when returning provider data.
 */
export function redactProviderSecrets<T extends Record<string, any>>(provider: T): Omit<T, 'authKey'> {
    const { authKey, ...safeProvider } = provider
    return safeProvider
}

/**
 * Redact secrets from an array of providers.
 */
export function redactProvidersSecrets<T extends Record<string, any>>(providers: T[]): Omit<T, 'authKey'>[] {
    return providers.map(redactProviderSecrets)
}
