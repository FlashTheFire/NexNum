/**
 * Request Signing (Elite Grade)
 * 
 * Prevents replay attacks and request tampering with:
 * 1. Professional Timestamp validation (5 min window)
 * 2. Redis-backed Nonce tracking (One-time use)
 * 3. Timing-Safe HMAC verification
 * 4. Canonicalized Body Hashing
 */

import { createHmac, createHash, timingSafeEqual } from 'crypto'
import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'

const SIGNING_SECRET = process.env.REQUEST_SIGNING_SECRET || process.env.JWT_SECRET || 'dev-signing-secret'
const MAX_DRIFT_MS = 5 * 60 * 1000
const NONCE_TTL_S = 600

/**
 * Validate request signature with Timing-Safe comparison
 */
export async function validateRequestSignature(
    headers: Headers,
    method: string,
    path: string,
    body?: string | object
): Promise<{ valid: boolean; error?: string }> {
    const signature = headers.get('x-signature')
    const timestampHeader = headers.get('x-timestamp')
    const nonce = headers.get('x-nonce')

    if (!signature || !timestampHeader || !nonce) {
        return { valid: false, error: 'Identity headers missing (sig, ts, nonce)' }
    }

    // 1. Timestamp Drift Validation
    const timestamp = parseInt(timestampHeader, 10)
    if (isNaN(timestamp) || Math.abs(Date.now() - timestamp) > MAX_DRIFT_MS) {
        return { valid: false, error: 'Identity signal expired or invalid' }
    }

    // 2. Anti-Replay Nonce Validation
    const nonceKey = `security:nonce:${nonce}`
    const isUsed = await redis.exists(nonceKey)
    if (isUsed) {
        logger.warn('[Security] Replay attack detected via nonce reuse', { nonce, path })
        return { valid: false, error: 'Identity signal already consumed' }
    }

    // 3. Expected Signature Calculation
    const bodyHash = body ? canonicalHashBody(body) : ''
    const payload = `${timestamp}.${nonce}.${method.toUpperCase()}.${path}.${bodyHash}`

    const expectedSignature = createHmac('sha256', SIGNING_SECRET)
        .update(payload)
        .digest('hex')

    // 4. ELITE: Constant-Time/Timing-Safe Comparison
    const sigBuffer = Buffer.from(signature, 'hex')
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')

    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
        return { valid: false, error: 'Identity verification failed' }
    }

    // 5. Consume Nonce
    await redis.set(nonceKey, '1', 'EX', NONCE_TTL_S)

    return { valid: true }
}

/**
 * Hash body with deterministic canonicalization
 */
function canonicalHashBody(body: string | object): string {
    const content = typeof body === 'string'
        ? body
        : JSON.stringify(body, Object.keys(body).sort()) // Basic key sorting

    return createHash('sha256').update(content).digest('hex')
}

export function getSigningInstructions() {
    return {
        algorithm: 'HMAC-SHA256',
        headers: { signature: 'x-signature', timestamp: 'x-timestamp', nonce: 'x-nonce' },
        payload: 'timestamp.nonce.METHOD.path.bodyHash',
        drift: '300s'
    }
}
