import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'
import { WalletService } from '@/lib/wallet/wallet'
import { LimitsConfig } from '@/config'
import crypto from 'crypto'
import { z } from 'zod'

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    DAILY_SPEND_LIMIT: LimitsConfig.dailySpend,
    MIN_PURCHASE_AMOUNT: LimitsConfig.minPurchase,
    MAX_PURCHASE_AMOUNT: LimitsConfig.maxPurchase,
    PRICE_TOLERANCE_PERCENT: 0.01,
    REDIS_PREFIX: {
        dailySpend: 'spend:daily:',
        purchaseVelocity: 'velocity:purchase:',
        purchaseLock: 'lock:purchase:atomic:',
    }
}

// ============================================
// SCHEMAS & VALIDATION
// ============================================

export const PurchaseInputSchema = z.object({
    countryCode: z.string().min(1).max(50).optional(),
    serviceCode: z.string().min(1).max(50).optional(),
    countryId: z.number().int().optional(),
    serviceId: z.number().int().optional(),
    operatorId: z.string().max(50).optional().nullable(),
    provider: z.string().max(50).optional().nullable(),
    idempotencyKey: z.string().uuid().optional(),
}).refine(data => (data.countryCode || data.countryId !== undefined), {
    message: "Country identifier required",
    path: ["countryCode"]
}).refine(data => (data.serviceCode || data.serviceId !== undefined), {
    message: "Service identifier required",
    path: ["serviceCode"]
})

export type PurchaseInput = z.infer<typeof PurchaseInputSchema>

export interface ValidationResult {
    valid: boolean
    errors: string[]
    sanitized?: PurchaseInput
}

/**
 * Validate and sanitize purchase input using Zod
 */
export function validatePurchaseInput(input: any): ValidationResult {
    const result = PurchaseInputSchema.safeParse(input)

    if (!result.success) {
        return {
            valid: false,
            errors: result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`)
        }
    }

    return {
        valid: true,
        errors: [],
        sanitized: result.data
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
 * Check purchase velocity (Tiered Throttling)
 */
async function checkPurchaseVelocity(
    userId: string
): Promise<{ allowed: boolean; reason?: string }> {
    const minuteKey = `${CONFIG.REDIS_PREFIX.purchaseVelocity}${userId}:minute`
    const hourKey = `${CONFIG.REDIS_PREFIX.purchaseVelocity}${userId}:hour`

    const [minuteCount, hourCount] = await Promise.all([
        redis.incr(minuteKey),
        redis.incr(hourKey)
    ])

    if (minuteCount === 1) await redis.expire(minuteKey, 60)
    if (hourCount === 1) await redis.expire(hourKey, 3600)

    // Tier 1: Per-minute Hard Cap
    const MAX_MIN = 10;
    if (minuteCount > MAX_MIN) {
        return { allowed: false, reason: 'Velocity limit exceeded (Minute). Please wait.' }
    }

    // Tier 2: Per-hour Hard Cap
    const MAX_HOUR = 50;
    if (hourCount > MAX_HOUR) {
        return { allowed: false, reason: 'Velocity limit exceeded (Hour). Please try later.' }
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
 * Acquire atomic purchase lock using Lua (Industrial Grade)
 * Ensures atomicity and definite ownership to prevent micro-race conditions.
 */
export async function acquireAtomicPurchaseLock(
    userId: string,
    ttlSeconds: number = 30
): Promise<LockResult> {
    const lockKey = `${CONFIG.REDIS_PREFIX.purchaseLock}${userId}`
    const token = crypto.randomUUID()

    // LUA: Set NX if not exists, with PX TTL. Returns 1 if set, 0 otherwise.
    const result = await redis.eval(
        `if redis.call("SET", KEYS[1], ARGV[1], "NX", "EX", ARGV[2]) then return 1 else return 0 end`,
        1,
        lockKey,
        token,
        ttlSeconds
    )

    if (result !== 1) {
        return { acquired: false, token: '', reason: 'Lock conflict: Another acquisition in progress' }
    }

    return { acquired: true, token }
}

/**
 * Release atomic purchase lock using Lua (Safety First)
 * Only deletes if the token matches, preventing accidental "lock stealing".
 */
export async function releaseAtomicPurchaseLock(
    userId: string,
    token: string
): Promise<boolean> {
    const lockKey = `${CONFIG.REDIS_PREFIX.purchaseLock}${userId}`

    // LUA: Only delete if value matches the token
    const result = await redis.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`,
        1,
        lockKey,
        token
    )

    return result === 1
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
 * Log purchase audit event with Identity Context
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
                    // Identity context passed from API layer if available
                    ip: event.metadata?.ip,
                    ua: event.metadata?.ua,
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
