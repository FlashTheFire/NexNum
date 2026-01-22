/**
 * Purchase Security Utilities
 * 
 * Enterprise-grade security layer for the Number Purchase Flow:
 * - Input validation & sanitization
 * - User eligibility checks
 * - Price verification
 * - Daily spend limits
 * - Purchase velocity control
 * - Audit logging
 */

import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'
import { WalletService } from '@/lib/wallet/wallet'
import crypto from 'crypto'

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    // Input Validation
    // Country: Accept 2-letter ISO (US), numeric provider IDs (22), or names (india)
    COUNTRY_CODE_REGEX: /^[a-zA-Z0-9_-]{1,50}$/,
    SERVICE_CODE_REGEX: /^[a-zA-Z0-9_-]{1,50}$/, // Alphanumeric + underscore/dash
    OPERATOR_ID_REGEX: /^[a-zA-Z0-9_-]{1,50}$/,
    PROVIDER_REGEX: /^[a-zA-Z0-9_-]{1,50}$/,
    UUID_REGEX: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,

    // Spend Limits
    DAILY_SPEND_LIMIT: 100.00,                  // $100/day default
    MIN_PURCHASE_AMOUNT: 0.01,
    MAX_PURCHASE_AMOUNT: 50.00,                 // Single purchase max

    // Rate Limiting
    PURCHASE_COOLDOWN_SECONDS: 2,               // 2 seconds between purchases
    MAX_PURCHASES_PER_MINUTE: 5,
    MAX_PURCHASES_PER_HOUR: 30,

    // Price Verification
    PRICE_TOLERANCE_PERCENT: 0.01,              // 1% tolerance for currency conversion

    // Redis Keys
    REDIS_PREFIX: {
        dailySpend: 'spend:daily:',
        purchaseVelocity: 'velocity:purchase:',
        purchaseLock: 'lock:purchase:atomic:',
    }
}

// ============================================
// INPUT VALIDATION
// ============================================

export interface PurchaseInput {
    countryCode: string
    serviceCode: string
    operatorId?: string
    provider?: string
    idempotencyKey?: string
}

export interface ValidationResult {
    valid: boolean
    errors: string[]
    sanitized?: PurchaseInput
}

/**
 * Validate and sanitize purchase input
 */
export function validatePurchaseInput(input: any): ValidationResult {
    const errors: string[] = []
    const sanitized: PurchaseInput = {
        countryCode: '',
        serviceCode: ''
    }

    // Country Code (required)
    if (!input.countryCode || typeof input.countryCode !== 'string') {
        errors.push('Country code is required')
    } else {
        const cc = input.countryCode.trim()
        if (!CONFIG.COUNTRY_CODE_REGEX.test(cc)) {
            errors.push('Invalid country code format')
        } else {
            sanitized.countryCode = cc
        }
    }

    // Service Code (required)
    if (!input.serviceCode || typeof input.serviceCode !== 'string') {
        errors.push('Service code is required')
    } else {
        const sc = input.serviceCode.toLowerCase().trim()
        if (!CONFIG.SERVICE_CODE_REGEX.test(sc)) {
            errors.push('Invalid service code format')
        } else {
            sanitized.serviceCode = sc
        }
    }

    // Operator ID (optional)
    if (input.operatorId !== undefined && input.operatorId !== null) {
        const op = String(input.operatorId).trim()
        if (op && !CONFIG.OPERATOR_ID_REGEX.test(op)) {
            errors.push('Invalid operator ID format')
        } else if (op) {
            sanitized.operatorId = op
        }
    }

    // Provider (optional)
    if (input.provider !== undefined && input.provider !== null) {
        const prov = String(input.provider).trim()
        if (prov && !CONFIG.PROVIDER_REGEX.test(prov)) {
            errors.push('Invalid provider format')
        } else if (prov) {
            sanitized.provider = prov
        }
    }

    // Idempotency Key (optional but must be UUID if provided)
    if (input.idempotencyKey !== undefined && input.idempotencyKey !== null) {
        const key = String(input.idempotencyKey).trim()
        if (key && !CONFIG.UUID_REGEX.test(key)) {
            errors.push('Idempotency key must be a valid UUID')
        } else if (key) {
            sanitized.idempotencyKey = key
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        sanitized: errors.length === 0 ? sanitized : undefined
    }
}

// ============================================
// USER ELIGIBILITY
// ============================================

export interface EligibilityResult {
    eligible: boolean
    reason?: string
    details: {
        isBanned: boolean
        hasSufficientBalance: boolean
        dailySpendRemaining: number
        purchaseVelocityOk: boolean
    }
}

/**
 * Check if user is eligible to make a purchase
 */
export async function checkUserEligibility(
    userId: string,
    requiredAmount: number
): Promise<EligibilityResult> {
    const details = {
        isBanned: false,
        hasSufficientBalance: false,
        dailySpendRemaining: 0,
        purchaseVelocityOk: false
    }

    // 1. Check if user is banned
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { isBanned: true }
    })

    if (!user) {
        return { eligible: false, reason: 'User not found', details }
    }

    details.isBanned = user.isBanned
    if (user.isBanned) {
        return { eligible: false, reason: 'Account is suspended', details }
    }

    // 2. Check wallet balance
    const balance = await WalletService.getBalance(userId)
    details.hasSufficientBalance = balance >= requiredAmount

    if (!details.hasSufficientBalance) {
        return { eligible: false, reason: 'Insufficient balance', details }
    }

    // 3. Check daily spend limit
    const dailySpend = await getDailySpend(userId)
    details.dailySpendRemaining = Math.max(0, CONFIG.DAILY_SPEND_LIMIT - dailySpend)

    if (dailySpend + requiredAmount > CONFIG.DAILY_SPEND_LIMIT) {
        return {
            eligible: false,
            reason: `Daily spend limit reached. Remaining: $${details.dailySpendRemaining.toFixed(2)}`,
            details
        }
    }

    // 4. Check purchase velocity
    const velocity = await checkPurchaseVelocity(userId)
    details.purchaseVelocityOk = velocity.allowed

    if (!velocity.allowed) {
        return { eligible: false, reason: velocity.reason, details }
    }

    return { eligible: true, details }
}

/**
 * Get user's daily spend
 */
async function getDailySpend(userId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0]
    const key = `${CONFIG.REDIS_PREFIX.dailySpend}${userId}:${today}`

    const value = await redis.get(key)
    return value ? parseFloat(value as string) : 0
}

/**
 * Record a purchase in daily spend
 */
export async function recordDailySpend(userId: string, amount: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0]
    const key = `${CONFIG.REDIS_PREFIX.dailySpend}${userId}:${today}`

    await redis.incrbyfloat(key, amount)
    await redis.expire(key, 86400 * 2) // 2 days TTL
}

/**
 * Check purchase velocity (rate limiting)
 */
async function checkPurchaseVelocity(
    userId: string
): Promise<{ allowed: boolean; reason?: string }> {
    const now = Date.now()
    const minuteKey = `${CONFIG.REDIS_PREFIX.purchaseVelocity}${userId}:minute`
    const hourKey = `${CONFIG.REDIS_PREFIX.purchaseVelocity}${userId}:hour`

    // Check per-minute limit
    const minuteCount = await redis.incr(minuteKey)
    if (minuteCount === 1) {
        await redis.expire(minuteKey, 60)
    }
    if (minuteCount > CONFIG.MAX_PURCHASES_PER_MINUTE) {
        return { allowed: false, reason: 'Too many purchases. Please wait a minute.' }
    }

    // Check per-hour limit
    const hourCount = await redis.incr(hourKey)
    if (hourCount === 1) {
        await redis.expire(hourKey, 3600)
    }
    if (hourCount > CONFIG.MAX_PURCHASES_PER_HOUR) {
        return { allowed: false, reason: 'Hourly purchase limit reached. Please try again later.' }
    }

    return { allowed: true }
}

// ============================================
// PRICE VERIFICATION
// ============================================

export interface PriceVerificationResult {
    valid: boolean
    freshPrice: number
    priceDiff: number
    reason?: string
}

/**
 * Verify that the claimed price matches the current offer price
 */
export function verifyPrice(
    claimedPrice: number,
    currentOfferPrice: number
): PriceVerificationResult {
    // Check bounds
    if (claimedPrice < CONFIG.MIN_PURCHASE_AMOUNT) {
        return {
            valid: false,
            freshPrice: currentOfferPrice,
            priceDiff: currentOfferPrice - claimedPrice,
            reason: 'Price below minimum'
        }
    }

    if (claimedPrice > CONFIG.MAX_PURCHASE_AMOUNT) {
        return {
            valid: false,
            freshPrice: currentOfferPrice,
            priceDiff: currentOfferPrice - claimedPrice,
            reason: 'Price exceeds maximum single purchase'
        }
    }

    // Check tolerance
    const tolerance = currentOfferPrice * CONFIG.PRICE_TOLERANCE_PERCENT
    const diff = Math.abs(currentOfferPrice - claimedPrice)

    if (diff > tolerance) {
        return {
            valid: false,
            freshPrice: currentOfferPrice,
            priceDiff: diff,
            reason: 'Price mismatch - offer may have changed'
        }
    }

    return {
        valid: true,
        freshPrice: currentOfferPrice,
        priceDiff: diff
    }
}

// ============================================
// ATOMIC PURCHASE LOCK
// ============================================

export interface LockResult {
    acquired: boolean
    token: string
    reason?: string
}

/**
 * Acquire atomic purchase lock using Lua script
 */
export async function acquireAtomicPurchaseLock(
    userId: string,
    idempotencyKey?: string
): Promise<LockResult> {
    const lockKey = `${CONFIG.REDIS_PREFIX.purchaseLock}${userId}`
    const token = crypto.randomUUID()

    // Simple implementation (upgrade to Lua if needed)
    const existing = await redis.get(lockKey)
    if (existing) {
        return { acquired: false, token: '', reason: 'Another purchase in progress' }
    }

    const result = await redis.set(lockKey, token, 'EX', 60, 'NX')
    if (result !== 'OK') {
        return { acquired: false, token: '', reason: 'Failed to acquire lock' }
    }

    return { acquired: true, token }
}

/**
 * Release atomic purchase lock
 */
export async function releaseAtomicPurchaseLock(
    userId: string,
    token: string
): Promise<boolean> {
    const lockKey = `${CONFIG.REDIS_PREFIX.purchaseLock}${userId}`

    // Only release if we own the lock
    const currentToken = await redis.get(lockKey)
    if (currentToken === token) {
        await redis.del(lockKey)
        return true
    }
    return false
}

// ============================================
// PURCHASE AUDIT
// ============================================

export type PurchaseAuditEventType =
    | 'PURCHASE_STARTED'
    | 'VALIDATION_FAILED'
    | 'ELIGIBILITY_FAILED'
    | 'PRICE_MISMATCH'
    | 'LOCK_ACQUIRED'
    | 'LOCK_FAILED'
    | 'FUNDS_RESERVED'
    | 'PROVIDER_CALLED'
    | 'PROVIDER_SUCCESS'
    | 'PROVIDER_FAILED'
    | 'FUNDS_COMMITTED'
    | 'FUNDS_ROLLEDBACK'
    | 'PURCHASE_COMPLETED'
    | 'PURCHASE_FAILED'
    | 'ORPHAN_DETECTED'
    | 'ORPHAN_CANCELLED'
    | 'ORPHAN_CLAIMED'
    | 'ORPHAN_MANUAL_REVIEW'

export interface PurchaseAuditEvent {
    eventType: PurchaseAuditEventType
    userId: string
    correlationId: string
    activationId?: string
    purchaseOrderId?: string
    providerId?: string
    amount?: number
    errorMessage?: string
    metadata?: Record<string, any>
}

/**
 * Log purchase audit event
 */
export async function logPurchaseAudit(event: PurchaseAuditEvent): Promise<void> {
    try {
        await prisma.auditLog.create({
            data: {
                userId: event.userId,
                action: `PURCHASE_${event.eventType}`,
                resourceType: 'purchase',
                resourceId: event.activationId || event.purchaseOrderId,
                metadata: {
                    correlationId: event.correlationId,
                    eventType: event.eventType,
                    providerId: event.providerId,
                    amount: event.amount,
                    errorMessage: event.errorMessage,
                    ...event.metadata
                }
            }
        })
    } catch (e: any) {
        logger.error('[PurchaseAudit] Failed to log event', {
            eventType: event.eventType,
            error: e.message
        })
    }
}

/**
 * Generate correlation ID for purchase tracking
 */
export function generatePurchaseCorrelationId(): string {
    return `purchase_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
}

// ============================================
// ORPHAN HANDLER
// ============================================

export type OrphanRecoveryResult = 'cancelled' | 'claimed' | 'manual_review' | 'error'

/**
 * Handle orphaned number (provider success but local transaction failed)
 */
export async function handleOrphanedNumber(
    providerActivationId: string,
    activationId: string,
    userId: string,
    smsProvider: any,
    correlationId: string
): Promise<OrphanRecoveryResult> {
    logger.warn(`[OrphanHandler] Attempting recovery for ${providerActivationId}`, { activationId, correlationId })

    // 1. Try to cancel at provider
    try {
        await smsProvider.cancelNumber(providerActivationId)
        await logPurchaseAudit({
            eventType: 'ORPHAN_CANCELLED',
            userId,
            correlationId,
            activationId,
            metadata: { providerActivationId }
        })
        logger.info(`[OrphanHandler] Successfully cancelled orphan: ${providerActivationId}`)
        return 'cancelled'
    } catch (cancelErr: any) {
        logger.warn(`[OrphanHandler] Cancel failed: ${cancelErr.message}`)
    }

    // 2. Check if number received SMS (user got value)
    try {
        const status = await smsProvider.getStatus(providerActivationId)
        if (status.messages && status.messages.length > 0) {
            // User actually got value - this needs manual handling
            await logPurchaseAudit({
                eventType: 'ORPHAN_CLAIMED',
                userId,
                correlationId,
                activationId,
                metadata: { providerActivationId, messageCount: status.messages.length }
            })
            logger.info(`[OrphanHandler] Orphan has messages, flagging for claim: ${providerActivationId}`)
            return 'claimed'
        }
    } catch (statusErr: any) {
        logger.warn(`[OrphanHandler] Status check failed: ${statusErr.message}`)
    }

    // 3. Flag for manual review
    await logPurchaseAudit({
        eventType: 'ORPHAN_MANUAL_REVIEW',
        userId,
        correlationId,
        activationId,
        metadata: { providerActivationId, reason: 'Cancel failed, no SMS detected' }
    })
    logger.error(`[OrphanHandler] Flagged for manual review: ${providerActivationId}`)
    return 'manual_review'
}

// ============================================
// EXPORTS
// ============================================

export const PurchaseSecurityConfig = CONFIG
