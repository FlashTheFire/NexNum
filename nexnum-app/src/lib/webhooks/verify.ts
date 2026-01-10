/**
 * Webhook Signature Verification
 * 
 * Verifies webhook signatures from providers to ensure authenticity
 * Supports HMAC-SHA256 and timestamp-based replay protection
 */

// @ts-ignore
import crypto = require('crypto')
import { WebhookVerificationResult } from '@/lib/sms/types'
import { logger } from '@/lib/core/logger'

declare var Buffer: any;

// ============================================
// VERIFICATION CONFIG
// ============================================

interface VerificationConfig {
    /** Webhook secret from provider */
    secret: string

    /** Algorithm (default: sha256) */
    algorithm?: string

    /** Header name for signature */
    signatureHeader?: string

    /** Header name for timestamp */
    timestampHeader?: string

    /** Maximum time drift allowed (seconds) */
    maxTimeDrift?: number
}

// ============================================
// VERIFIER CLASS
// ============================================

export class WebhookVerifier {
    /**
     * Verify HMAC-SHA256 signature
     */
    static verifyHmac(
        payload: string,
        signature: string,
        secret: string,
        algorithm: string = 'sha256'
    ): WebhookVerificationResult {
        try {
            // Compute expected signature
            const expectedSignature = crypto
                .createHmac(algorithm, secret)
                .update(payload)
                .digest('hex')

            // Compare signatures (constant-time comparison)
            const valid = crypto.timingSafeEqual(
                Buffer.from(signature),
                Buffer.from(expectedSignature)
            )

            if (!valid) {
                return {
                    valid: false,
                    error: 'Signature mismatch',
                }
            }

            return { valid: true }
        } catch (error: any) {
            logger.error('HMAC verification error', { error: error.message })
            return {
                valid: false,
                error: error.message,
            }
        }
    }

    /**
     * Verify timestamp to prevent replay attacks
     */
    static verifyTimestamp(
        timestamp: string | number,
        maxDrift: number = 300 // 5 minutes default
    ): WebhookVerificationResult {
        try {
            const webhookTime = typeof timestamp === 'string'
                ? parseInt(timestamp, 10)
                : timestamp

            const now = Math.floor(Date.now() / 1000)
            const drift = Math.abs(now - webhookTime)

            if (drift > maxDrift) {
                return {
                    valid: false,
                    error: `Timestamp drift too large: ${drift}s`,
                    timeDrift: drift,
                }
            }

            return {
                valid: true,
                timeDrift: drift,
            }
        } catch (error: any) {
            return {
                valid: false,
                error: error.message,
            }
        }
    }

    /**
     * Verify full webhook request
     */
    static verify(
        payload: string,
        headers: Record<string, string | string[] | undefined>,
        config: VerificationConfig
    ): WebhookVerificationResult {
        // Get signature from headers
        const signatureHeader = config.signatureHeader || 'x-signature'
        const signature = this.getHeader(headers, signatureHeader)

        if (!signature) {
            return {
                valid: false,
                error: `Missing signature header: ${signatureHeader}`,
            }
        }

        // Verify signature
        const signatureResult = this.verifyHmac(
            payload,
            signature,
            config.secret,
            config.algorithm
        )

        if (!signatureResult.valid) {
            return signatureResult
        }

        // Verify timestamp if configured
        if (config.timestampHeader && config.maxTimeDrift) {
            const timestamp = this.getHeader(headers, config.timestampHeader)
            if (timestamp) {
                const timestampResult = this.verifyTimestamp(
                    timestamp,
                    config.maxTimeDrift
                )
                if (!timestampResult.valid) {
                    return timestampResult
                }
            }
        }

        return { valid: true }
    }

    /**
     * Get header value (case-insensitive)
     */
    private static getHeader(
        headers: Record<string, string | string[] | undefined>,
        name: string
    ): string | null {
        const lowerName = name.toLowerCase()

        for (const [key, value] of Object.entries(headers)) {
            if (key.toLowerCase() === lowerName) {
                return Array.isArray(value) ? value[0] : value || null
            }
        }

        return null
    }
}

// ============================================
// PROVIDER-SPECIFIC VERIFIERS
// ============================================

export class FiveSimWebhookVerifier {
    /**
     * 5sim doesn't use signatures, verify by IP instead
     */
    static verify(ip: string): WebhookVerificationResult {
        // 5sim webhook IPs (check their documentation)
        const allowedIps = [
            '167.235.198.205',
            // Add more as needed
        ]

        if (allowedIps.includes(ip)) {
            return { valid: true }
        }

        return {
            valid: false,
            error: `IP not whitelisted: ${ip}`,
        }
    }
}

export class GrizzlySmsWebhookVerifier {
    /**
     * GrizzlySMS uses HMAC-SHA256
     */
    static verify(
        payload: string,
        signature: string,
        secret: string
    ): WebhookVerificationResult {
        return WebhookVerifier.verifyHmac(payload, signature, secret)
    }
}

export class HeroSmsWebhookVerifier {
    /**
     * HeroSMS verification (check their docs)
     */
    static verify(
        payload: string,
        headers: Record<string, string | string[] | undefined>,
        secret: string
    ): WebhookVerificationResult {
        return WebhookVerifier.verify(payload, headers, {
            secret,
            signatureHeader: 'x-hero-signature',
            timestampHeader: 'x-hero-timestamp',
            maxTimeDrift: 300,
        })
    }
}
