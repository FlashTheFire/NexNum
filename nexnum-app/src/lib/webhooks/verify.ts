import crypto from 'crypto'
import { timingSafeEqual } from '@/lib/core/isomorphic-crypto'
import { WebhookVerificationResult } from '@/lib/sms/types'
import { logger } from '@/lib/core/logger'

/**
 * Industrial Webhook Security Suite
 * 
 * Implements HMAC-SHA256 verification with strict replay protection
 * and timing-attack resilient comparison.
 */
export class WebhookVerifier {
    /**
     * Standardized HMAC-SHA256 verification
     * Protects against timing attacks and payload tampering.
     */
    static verifyHmac(
        payload: string,
        signature: string,
        secret: string,
        timestamp?: string | number,
        maxDrift: number = 300 // 5 minutes
    ): WebhookVerificationResult {
        try {
            if (!signature || !secret) {
                return { valid: false, error: 'Missing signature or secret' }
            }

            // 1. Replay Protection (if timestamp provided)
            if (timestamp) {
                const timeResult = this.verifyTimestamp(timestamp, maxDrift)
                if (!timeResult.valid) return timeResult
            }

            // 2. Signature Reconstruction
            // Professional pattern: sign "timestamp.payload" to prevent signature reuse
            const stringToSign = timestamp ? `${timestamp}.${payload}` : payload
            const hmac = crypto.createHmac('sha256', secret)
            hmac.update(stringToSign)
            const expectedSignature = hmac.digest('hex')

            // 3. Timing-Safe Comparison
            // Senior Note: Buffer lengths MUST match for timingSafeEqual or it throws.
            const sigBuf = Buffer.from(signature, 'hex')
            const expectedBuf = Buffer.from(expectedSignature, 'hex')

            if (sigBuf.length !== expectedBuf.length) {
                return { valid: false, error: 'Signature length mismatch' }
            }

            const valid = timingSafeEqual(sigBuf, expectedBuf)

            if (!valid) {
                logger.warn('[SECURITY] Webhook signature mismatch', {
                    provided: signature.substring(0, 8) + '...',
                    expected: expectedSignature.substring(0, 8) + '...'
                })
                return { valid: false, error: 'Signature mismatch' }
            }

            return { valid: true }
        } catch (error: any) {
            logger.error('Webhook verification critical failure', { error: error.message })
            return { valid: false, error: 'Verification procedure failed' }
        }
    }

    /**
     * Replay Attack Mitigation
     * Validates that the request was generated within a safe time window.
     */
    static verifyTimestamp(
        timestamp: string | number,
        maxDrift: number = 300
    ): WebhookVerificationResult {
        try {
            const webhookTime = typeof timestamp === 'string'
                ? parseInt(timestamp, 10)
                : timestamp

            if (isNaN(webhookTime)) {
                return { valid: false, error: 'Invalid timestamp format' }
            }

            const now = Math.floor(Date.now() / 1000)
            const drift = Math.abs(now - webhookTime)

            if (drift > maxDrift) {
                logger.warn('[SECURITY] Webhook timestamp drift detected', { drift, maxDrift })
                return {
                    valid: false,
                    error: `Timestamp drift too large (${drift}s)`,
                    timeDrift: drift,
                }
            }

            return { valid: true, timeDrift: drift }
        } catch (error: any) {
            return { valid: false, error: error.message }
        }
    }

    /**
     * IP Filter (Optional secondary layer)
     */
    static verifyIp(ip: string, allowedIps: string[]): WebhookVerificationResult {
        if (!allowedIps || allowedIps.length === 0) return { valid: true }

        const isWhitelisted = allowedIps.some(allowed => {
            if (allowed.includes('/')) {
                // CIDR check placeholder (could use 'ipaddr.js')
                return false
            }
            return allowed === ip
        })

        if (!isWhitelisted) {
            return { valid: false, error: `IP ${ip} not in authorized whitelist` }
        }

        return { valid: true }
    }

    /**
     * Normalized Header Helper
     */
    static getHeader(
        headers: Record<string, string | string[] | undefined>,
        name: string
    ): string | null {
        const lowerName = name.toLowerCase()
        const found = Object.entries(headers).find(([k]) => k.toLowerCase() === lowerName)
        if (!found) return null
        const val = found[1]
        return Array.isArray(val) ? val[0] : (val || null)
    }
}
