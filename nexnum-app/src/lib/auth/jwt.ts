import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { cookies } from 'next/headers'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-in-production')
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'  // Extended from 15m to 7 days

export interface TokenPayload extends JWTPayload {
    userId: string
    email: string
    name: string
    role: string // 'USER' | 'ADMIN'
}

// Generate JWT token
export async function generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): Promise<string> {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(JWT_EXPIRES_IN)
        .sign(JWT_SECRET)
}

// Verify JWT token
export async function verifyToken(token: string): Promise<TokenPayload | null> {
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET)
        return payload as TokenPayload
    } catch {
        return null
    }
}

// Get token from request headers
export function getTokenFromHeaders(headers: Headers): string | null {
    const authHeader = headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return null
    return authHeader.slice(7)
}

// Get current user from cookies or headers
export async function getCurrentUser(headers: Headers): Promise<TokenPayload | null> {
    // Try Authorization header first
    const headerToken = getTokenFromHeaders(headers)
    if (headerToken) {
        return verifyToken(headerToken)
    }

    // Try cookie
    try {
        const cookieStore = await cookies()
        const cookieToken = cookieStore.get('token')?.value
        if (cookieToken) {
            return verifyToken(cookieToken)
        }
    } catch {
        // cookies() not available in some contexts
    }

    return null
}

// Set auth cookie
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

// Clear auth cookie
export async function clearAuthCookie(): Promise<void> {
    const cookieStore = await cookies()
    cookieStore.delete('token')
}
