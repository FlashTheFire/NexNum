import { NextResponse } from 'next/server'
import { verifyToken } from '@/lib/jwt'

export type AdminAuth = {
    userId: string
    email: string
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

    if (!token) return null

    try {
        const payload = await verifyToken(token)
        if (!payload) return null
        if (payload.role !== 'ADMIN') return null

        return {
            userId: payload.userId,
            email: payload.email
        }
    } catch {
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
