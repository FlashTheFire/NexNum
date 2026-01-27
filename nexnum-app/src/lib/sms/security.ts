/**
 * SMS Polling Security Utilities
 * 
 * Enterprise-grade security layer for the SMS polling system:
 * - Input validation & sanitization
 * - Cryptographic message fingerprinting
 * - Anomaly detection helpers
 */

import crypto from 'crypto'
import { logger } from '@/lib/core/logger'

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    // Validation
    PHONE_NUMBER_REGEX: /^\+?[1-9]\d{1,14}$/,       // E.164 format
    ACTIVATION_ID_REGEX: /^[a-zA-Z0-9_:-]{1,100}$/, // Safe chars only
    MAX_MESSAGE_LENGTH: 1000,
    MAX_SENDER_LENGTH: 100,
    MAX_CODE_LENGTH: 20,

    // Rate limiting
    RATE_LIMITS: {
        perNumber: { limit: 100, windowMs: 60_000 },     // 100 polls/min per number
        perProvider: { limit: 500, windowMs: 60_000 },   // 500 req/min per provider
        perUser: { limit: 1000, windowMs: 3600_000 },    // 1000 actions/hr per user
    },

    // Fingerprinting - SECURITY: Mandatory in production
    FINGERPRINT_SECRET: (() => {
        const secret = process.env.SMS_FINGERPRINT_SECRET || process.env.FINGERPRINT_SALT
        if (!secret && process.env.NODE_ENV === 'production') {
            console.error('CRITICAL: FINGERPRINT_SALT or SMS_FINGERPRINT_SECRET missing')
        }
        return secret || 'dev-only-fingerprint-secret'
    })(),

    // Anomaly detection
    ANOMALY_THRESHOLDS: {
        senderFlood: { count: 10, windowMs: 60_000 },    // 10 SMS from same sender in 1 min
        codeReuse: { count: 3, windowMs: 300_000 },      // Same code to 3+ numbers in 5 min
        maxPollsPerNumber: 500,                           // Total polls per number lifetime
    }
}

// ============================================
// INPUT VALIDATION
// ============================================

export interface ValidationResult {
    valid: boolean
    errors: string[]
    sanitized?: Record<string, any>
}

/**
 * Validate phone number (E.164 format)
 */
export function validatePhoneNumber(phoneNumber: string): ValidationResult {
    const errors: string[] = []

    if (!phoneNumber || typeof phoneNumber !== 'string') {
        return { valid: false, errors: ['Phone number is required'] }
    }

    const sanitized = phoneNumber.replace(/\s/g, '').trim()

    if (!CONFIG.PHONE_NUMBER_REGEX.test(sanitized)) {
        errors.push('Invalid phone number format (must be E.164)')
    }

    if (sanitized.length > 16) {
        errors.push('Phone number too long')
    }

    return {
        valid: errors.length === 0,
        errors,
        sanitized: { phoneNumber: sanitized }
    }
}

/**
 * Validate activation ID (provider's ID or composite)
 */
export function validateActivationId(activationId: string): ValidationResult {
    const errors: string[] = []

    if (!activationId || typeof activationId !== 'string') {
        return { valid: false, errors: ['Activation ID is required'] }
    }

    const sanitized = activationId.trim()

    if (!CONFIG.ACTIVATION_ID_REGEX.test(sanitized)) {
        errors.push('Invalid activation ID format (contains disallowed characters)')
    }

    return {
        valid: errors.length === 0,
        errors,
        sanitized: { activationId: sanitized }
    }
}

/**
 * Validate and sanitize SMS message content
 */
export function validateMessageContent(content: string): ValidationResult {
    const errors: string[] = []

    if (content === undefined || content === null) {
        return { valid: true, errors: [], sanitized: { content: '' } }
    }

    if (typeof content !== 'string') {
        return { valid: false, errors: ['Message content must be a string'] }
    }

    // Truncate if too long
    let sanitized = content.substring(0, CONFIG.MAX_MESSAGE_LENGTH)

    // Remove null bytes and control characters (except newlines)
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

    // Basic XSS prevention (strip script tags)
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')

    return {
        valid: true,
        errors,
        sanitized: { content: sanitized }
    }
}

/**
 * Validate sender name
 */
export function validateSender(sender: string): ValidationResult {
    if (!sender || typeof sender !== 'string') {
        return { valid: true, errors: [], sanitized: { sender: 'Unknown' } }
    }

    const sanitized = sender
        .substring(0, CONFIG.MAX_SENDER_LENGTH)
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control chars
        .trim()

    return {
        valid: true,
        errors: [],
        sanitized: { sender: sanitized || 'Unknown' }
    }
}

/**
 * Validate extracted code
 */
export function validateCode(code: string | undefined): ValidationResult {
    if (!code) {
        return { valid: true, errors: [], sanitized: { code: undefined } }
    }

    if (typeof code !== 'string') {
        return { valid: false, errors: ['Code must be a string'] }
    }

    // Only allow alphanumeric and dashes
    const sanitized = code
        .substring(0, CONFIG.MAX_CODE_LENGTH)
        .replace(/[^a-zA-Z0-9-]/g, '')

    return {
        valid: true,
        errors: [],
        sanitized: { code: sanitized || undefined }
    }
}

/**
 * Comprehensive message validation
 */
export function validateSmsMessage(message: {
    id?: string
    sender?: string
    content?: string
    code?: string
}): ValidationResult {
    const allErrors: string[] = []
    const sanitizedData: Record<string, any> = {}

    // Validate each field
    const senderResult = validateSender(message.sender || '')
    const contentResult = validateMessageContent(message.content || '')
    const codeResult = validateCode(message.code)

    allErrors.push(...senderResult.errors, ...contentResult.errors, ...codeResult.errors)

    Object.assign(sanitizedData, senderResult.sanitized, contentResult.sanitized, codeResult.sanitized)

    // Validate ID if present
    if (message.id) {
        if (typeof message.id !== 'string' || message.id.length > 200) {
            allErrors.push('Invalid message ID')
        } else {
            sanitizedData.id = message.id.trim()
        }
    }

    return {
        valid: allErrors.length === 0,
        errors: allErrors,
        sanitized: sanitizedData
    }
}

// ============================================
// CRYPTOGRAPHIC FINGERPRINTING
// ============================================

export interface MessageFingerprint {
    hash: string           // SHA-256 content hash
    signature: string      // HMAC signature for tamper detection
    timestamp: number      // When fingerprint was created
}

/**
 * Generate a tamper-proof fingerprint for an SMS message
 */
export function generateMessageFingerprint(
    numberId: string,
    content: string,
    receivedAt: Date
): MessageFingerprint {
    const timestamp = Date.now()

    // Content hash (for deduplication)
    const contentNormalized = normalizeContent(content)
    const hash = crypto
        .createHash('sha256')
        .update(`${numberId}:${contentNormalized}:${receivedAt.getTime()}`)
        .digest('hex')

    // HMAC signature (for tamper detection)
    const signature = crypto
        .createHmac('sha256', CONFIG.FINGERPRINT_SECRET)
        .update(`${hash}:${timestamp}`)
        .digest('hex')

    return { hash, signature, timestamp }
}

/**
 * Verify a message fingerprint hasn't been tampered with
 */
export function verifyMessageFingerprint(
    fingerprint: MessageFingerprint
): boolean {
    const expectedSignature = crypto
        .createHmac('sha256', CONFIG.FINGERPRINT_SECRET)
        .update(`${fingerprint.hash}:${fingerprint.timestamp}`)
        .digest('hex')

    return crypto.timingSafeEqual(
        Buffer.from(fingerprint.signature),
        Buffer.from(expectedSignature)
    )
}

/**
 * Generate content hash for deduplication
 */
export function generateContentHash(content: string): string {
    return crypto
        .createHash('sha256')
        .update(normalizeContent(content))
        .digest('hex')
        .substring(0, 16) // First 16 chars is enough for dedup
}

/**
 * Normalize content for consistent hashing
 */
function normalizeContent(content: string): string {
    return content
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
}

// ============================================
// ANOMALY DETECTION HELPERS
// ============================================

export interface AnomalyCheck {
    type: 'sender_flood' | 'code_reuse' | 'polling_anomaly' | 'timing_anomaly'
    detected: boolean
    details: string
    severity: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * Check for sender flooding (too many SMS from one sender)
 */
export function checkSenderFlood(
    sender: string,
    recentMessagesFromSender: number
): AnomalyCheck {
    const threshold = CONFIG.ANOMALY_THRESHOLDS.senderFlood.count
    const detected = recentMessagesFromSender > threshold

    return {
        type: 'sender_flood',
        detected,
        details: detected
            ? `Sender "${sender}" sent ${recentMessagesFromSender} messages (threshold: ${threshold})`
            : '',
        severity: detected ? 'medium' : 'low'
    }
}

/**
 * Check for timing anomaly (SMS received before number was active)
 */
export function checkTimingAnomaly(
    messageReceivedAt: Date,
    numberCreatedAt: Date
): AnomalyCheck {
    const detected = messageReceivedAt.getTime() < numberCreatedAt.getTime()

    return {
        type: 'timing_anomaly',
        detected,
        details: detected
            ? `Message received at ${messageReceivedAt.toISOString()} but number created at ${numberCreatedAt.toISOString()}`
            : '',
        severity: detected ? 'critical' : 'low'
    }
}

/**
 * Check for excessive polling
 */
export function checkPollingAnomaly(
    currentPollCount: number
): AnomalyCheck {
    const threshold = CONFIG.ANOMALY_THRESHOLDS.maxPollsPerNumber
    const detected = currentPollCount > threshold

    return {
        type: 'polling_anomaly',
        detected,
        details: detected
            ? `Number polled ${currentPollCount} times (threshold: ${threshold})`
            : '',
        severity: detected ? 'high' : 'low'
    }
}

/**
 * Log anomaly to audit system
 */
export function logAnomaly(
    anomaly: AnomalyCheck,
    context: { numberId?: string; activationId?: string; userId?: string }
): void {
    if (!anomaly.detected) return

    logger.warn(`[ANOMALY:${anomaly.type}] ${anomaly.details}`, {
        ...context,
        severity: anomaly.severity,
        anomalyType: anomaly.type
    })

    // TODO: Store in audit table for forensics
}

// ============================================
// RATE LIMITING HELPERS
// ============================================

/**
 * Get rate limit key for Redis
 */
export function getRateLimitKey(
    entity: 'number' | 'provider' | 'user',
    id: string
): string {
    return `ratelimit:poll:${entity}:${id}`
}

/**
 * Get rate limit config for entity type
 */
export function getRateLimitConfig(
    entity: 'number' | 'provider' | 'user'
): { limit: number; windowMs: number } {
    switch (entity) {
        case 'number':
            return CONFIG.RATE_LIMITS.perNumber
        case 'provider':
            return CONFIG.RATE_LIMITS.perProvider
        case 'user':
            return CONFIG.RATE_LIMITS.perUser
    }
}

// ============================================
// EXPORTS
// ============================================

export const SecurityConfig = CONFIG
