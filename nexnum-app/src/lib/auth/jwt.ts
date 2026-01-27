import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'

// SECURITY: No fallback secret - must be configured via environment variable
const JWT_SECRET_RAW = process.env.JWT_SECRET
if (!JWT_SECRET_RAW && process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL: JWT_SECRET environment variable is required in production')
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW || 'dev-only-not-for-production')
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

export interface TokenPayload extends JWTPayload {
    userId: string
    email: string
    name: string
    role: string // 'USER' | 'ADMIN'
    emailVerified: Date | null
    version: number
}

// ============================================================================
// Token Lifecycle
// ============================================================================

export async function generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): Promise<string> {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(JWT_EXPIRES_IN)
        .sign(JWT_SECRET)
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET)
        return payload as TokenPayload
    } catch {
        return null
    }
}

// ============================================================================
// Session Management
// ============================================================================

export function getTokenFromHeaders(headers: Headers): string | null {
    const authHeader = headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    return authHeader.slice(7)
}

/**
 * Get current user from cookies or headers
 * Optimized with Redis-backed session caching (High Performance)
 */
export async function getCurrentUser(headers: Headers): Promise<TokenPayload | null> {
    // 1. Extract Token
    let payload: TokenPayload | null = null
    const headerToken = getTokenFromHeaders(headers)
    if (headerToken) {
        payload = await verifyToken(headerToken)
    }

    if (!payload) {
        try {
            const cookieStore = await cookies()
            const cookieToken = cookieStore.get('token')?.value
            if (cookieToken) payload = await verifyToken(cookieToken)
        } catch { /* Cookie context unavailable */ }
    }

    if (!payload) return null

    // 2. High-Performance Session Verification (Redis Cache)
    const sessionKey = `auth:session:${payload.userId}`

    try {
        const cached = await redis.get(sessionKey)
        if (cached) {
            const data = JSON.parse(cached)
            if (data.isBanned || data.tokenVersion !== payload.version) return null
            return payload
        }
    } catch (err) { }

    // 3. Database Verification (Fallback)
    try {
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: { tokenVersion: true, isBanned: true }
        })

        if (!user || user.isBanned || user.tokenVersion !== payload.version) {
            return null
        }

        // 4. Populate Cache (TTL: 60s)
        await redis.set(sessionKey, JSON.stringify({
            tokenVersion: user.tokenVersion,
            isBanned: user.isBanned
        }), 'EX', 60).catch(() => { })

        return payload
    } catch (dbError) {
        console.error('[Auth:JWT] Session verification failed:', dbError)
        return null
    }
}

// ============================================================================
// Cookie Utilities
// ============================================================================

export async function setAuthCookie(token: string): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.set('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
    })
}

export async function clearAuthCookie(): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.delete('token')
}
