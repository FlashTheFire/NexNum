/**
 * Request Signing
 * 
 * Prevents replay attacks and request tampering by requiring:
 * 1. Timestamp (max 5 min drift)
 * 2. Nonce (one-time use)
 * 3. HMAC signature of request components
 * 
 * Client must sign: timestamp + nonce + method + path + body_hash
 */

import { createHmac, createHash } from 'crypto'
import { redis } from '@/lib/core/redis'

const SIGNATURE_HEADER = 'x-signature'
const TIMESTAMP_HEADER = 'x-timestamp'
const NONCE_HEADER = 'x-nonce'
const MAX_TIMESTAMP_DRIFT_MS = 5 * 60 * 1000 // 5 minutes
const NONCE_TTL_SECONDS = 600 // 10 minutes

export interface SignatureValidationResult {
    valid: boolean
    error?: string
}

/**
 * Get signing secret for a user/session
 * In production, this should be unique per session
 */
export function getSigningSecret(userId?: string): string {
    const baseSecret = process.env.REQUEST_SIGNING_SECRET || process.env.JWT_SECRET || 'dev-signing-secret'
    if (userId) {
        return createHmac('sha256', baseSecret).update(userId).digest('hex')
    }
    return baseSecret
}

/**
 * Create request signature (for client-side use reference)
 */
export function createRequestSignature(
    secret: string,
    method: string,
    path: string,
    timestamp: number,
    nonce: string,
    bodyHash?: string
): string {
    const payload = [
        timestamp.toString(),
        nonce,
        method.toUpperCase(),
        path,
        bodyHash || ''
    ].join('.')

    return createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
}

/**
 * Hash request body for signing
 */
export function hashBody(body: string | object): string {
    const str = typeof body === 'string' ? body : JSON.stringify(body)
    return createHash('sha256').update(str).digest('hex')
}

/**
 * Check if nonce has been used (anti-replay)
 */
async function isNonceUsed(nonce: string): Promise<boolean> {
    const key = `nonce:${nonce}`
    const exists = await redis.exists(key)
    return exists === 1
}

/**
 * Mark nonce as used
 */
async function markNonceUsed(nonce: string): Promise<void> {
    const key = `nonce:${nonce}`
    await redis.set(key, '1', 'EX', NONCE_TTL_SECONDS)
}

/**
 * Validate request signature
 */
export async function validateRequestSignature(
    headers: Headers,
    method: string,
    path: string,
    body?: string | object,
    secret?: string
): Promise<SignatureValidationResult> {
    // Get headers
    const signature = headers.get(SIGNATURE_HEADER)
    const timestampStr = headers.get(TIMESTAMP_HEADER)
    const nonce = headers.get(NONCE_HEADER)

    if (!signature || !timestampStr || !nonce) {
        return {
            valid: false,
            error: 'Missing signature headers (x-signature, x-timestamp, x-nonce)'
        }
    }

    // Validate timestamp
    const timestamp = parseInt(timestampStr, 10)
    if (isNaN(timestamp)) {
        return { valid: false, error: 'Invalid timestamp' }
    }

    const now = Date.now()
    if (Math.abs(now - timestamp) > MAX_TIMESTAMP_DRIFT_MS) {
        return { valid: false, error: 'Request timestamp too old or too far in future' }
    }

    // Check nonce for replay
    try {
        if (await isNonceUsed(nonce)) {
            return { valid: false, error: 'Nonce already used (replay attack?)' }
        }
    } catch {
        // Redis error - fail open with warning in dev, closed in prod
        if (process.env.NODE_ENV === 'production') {
            return { valid: false, error: 'Nonce check failed' }
        }
    }

    // Calculate expected signature
    const signingSecret = secret || getSigningSecret()
    const bodyHash = body ? hashBody(body) : undefined
    const expectedSignature = createRequestSignature(
        signingSecret,
        method,
        path,
        timestamp,
        nonce,
        bodyHash
    )

    // Constant-time comparison
    if (signature.length !== expectedSignature.length) {
        return { valid: false, error: 'Invalid signature' }
    }

    let mismatch = 0
    for (let i = 0; i < signature.length; i++) {
        mismatch |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i)
    }

    if (mismatch !== 0) {
        return { valid: false, error: 'Invalid signature' }
    }

    // Mark nonce as used
    try {
        await markNonceUsed(nonce)
    } catch {
        // Log but don't fail - nonce tracking is defense-in-depth
    }

    return { valid: true }
}

/**
 * Generate signing instructions for client
 */
export function getSigningInstructions() {
    return {
        algorithm: 'HMAC-SHA256',
        headers: {
            signature: SIGNATURE_HEADER,
            timestamp: TIMESTAMP_HEADER,
            nonce: NONCE_HEADER
        },
        payload: 'timestamp.nonce.METHOD.path.bodyHash',
        maxDrift: MAX_TIMESTAMP_DRIFT_MS,
        note: 'Body hash is SHA-256 of JSON-stringified body, or empty string if no body'
    }
}

// Export constants
export const SIGNING_CONSTANTS = {
    SIGNATURE_HEADER,
    TIMESTAMP_HEADER,
    NONCE_HEADER,
    MAX_DRIFT_MS: MAX_TIMESTAMP_DRIFT_MS
}
