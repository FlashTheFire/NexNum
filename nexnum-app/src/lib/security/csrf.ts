/**
 * CSRF Protection
 * 
 * Implements Double-Submit Cookie pattern:
 * 1. Server generates CSRF token and sets it in a cookie
 * 2. Client must send the same token in X-CSRF-Token header
 * 3. Server validates that cookie and header match
 * 
 * This prevents CSRF because:
 * - Attacker cannot read the cookie (SameSite + HttpOnly)
 * - Attacker cannot forge the header without the cookie value
 */

import { cookies } from 'next/headers'
import { randomBytes, createHmac } from 'crypto'

const CSRF_COOKIE_NAME = process.env.NODE_ENV === 'production' ? '__Host-csrf-token' : 'csrf-token'
const CSRF_HEADER_NAME = 'x-csrf-token'
const CSRF_SECRET = process.env.CSRF_SECRET || process.env.JWT_SECRET || 'dev-csrf-secret'
const CSRF_TOKEN_EXPIRY = 60 * 60 * 1000 // 1 hour

interface CSRFToken {
    token: string
    timestamp: number
}

/**
 * Generate a new CSRF token
 */
export function generateCSRFToken(): string {
    const timestamp = Date.now()
    const random = randomBytes(32).toString('hex')
    const payload = `${timestamp}.${random}`

    // Sign the payload
    const signature = createHmac('sha256', CSRF_SECRET)
        .update(payload)
        .digest('hex')

    return `${payload}.${signature}`
}

/**
 * Validate a CSRF token
 */
export function validateCSRFToken(token: string): boolean {
    if (!token) return false

    const parts = token.split('.')
    if (parts.length !== 3) return false

    const [timestampStr, random, signature] = parts
    const timestamp = parseInt(timestampStr, 10)

    // Check expiry
    if (Date.now() - timestamp > CSRF_TOKEN_EXPIRY) {
        return false
    }

    // Verify signature
    const payload = `${timestampStr}.${random}`
    const expectedSignature = createHmac('sha256', CSRF_SECRET)
        .update(payload)
        .digest('hex')

    // Constant-time comparison to prevent timing attacks
    if (signature.length !== expectedSignature.length) return false

    let mismatch = 0
    for (let i = 0; i < signature.length; i++) {
        mismatch |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i)
    }

    return mismatch === 0
}

/**
 * Set CSRF cookie
 */
export async function setCSRFCookie(): Promise<string> {
    const token = generateCSRFToken()
    const cookieStore = await cookies()

    cookieStore.set(CSRF_COOKIE_NAME, token, {
        httpOnly: false, // Client needs to read this to send in header
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: CSRF_TOKEN_EXPIRY / 1000
    })

    return token
}

/**
 * Get CSRF token from cookie
 */
export async function getCSRFFromCookie(): Promise<string | null> {
    try {
        const cookieStore = await cookies()
        return cookieStore.get(CSRF_COOKIE_NAME)?.value || null
    } catch {
        return null
    }
}

/**
 * Validate CSRF from request
 * Must be called on all state-changing requests (POST, PUT, DELETE, PATCH)
 */
export async function validateCSRFRequest(headers: Headers): Promise<{ valid: boolean; error?: string }> {
    // Get token from header
    const headerToken = headers.get(CSRF_HEADER_NAME)
    if (!headerToken) {
        return { valid: false, error: 'Missing CSRF token header' }
    }

    // Get token from cookie
    const cookieToken = await getCSRFFromCookie()
    if (!cookieToken) {
        return { valid: false, error: 'Missing CSRF cookie' }
    }

    // Tokens must match
    if (headerToken !== cookieToken) {
        return { valid: false, error: 'CSRF token mismatch' }
    }

    // Validate token structure and signature
    if (!validateCSRFToken(headerToken)) {
        return { valid: false, error: 'Invalid or expired CSRF token' }
    }

    return { valid: true }
}

/**
 * Check if request method requires CSRF validation
 */
export function requiresCSRF(method: string): boolean {
    return ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase())
}

// Re-export constants for use in client
export const CSRF_CONSTANTS = {
    COOKIE_NAME: CSRF_COOKIE_NAME,
    HEADER_NAME: CSRF_HEADER_NAME
}
