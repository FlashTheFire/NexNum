import { prisma } from '@/lib/core/db'
import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'
import { verifyCaptcha as verifyHCaptcha } from './captcha'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

// Actions that require extra verification
export const SENSITIVE_ACTIONS = [
    'password.change',
    'email.change',
    'api_key.create',
    'api_key.delete',
    'withdrawal.request',
    'account.delete',
    'mfa.disable'
] as const

export type SensitiveAction = typeof SENSITIVE_ACTIONS[number]

export interface ElevatedSession {
    userId: string
    elevatedAt: number
    expiresAt: number
    action: SensitiveAction
}

// Elevated session duration (5 minutes)
const ELEVATION_DURATION_MS = 5 * 60 * 1000
const REDIS_ELEVATION_PREFIX = 'security:elevation:'

/**
 * Require re-authentication for sensitive action
 */
export async function requireReauth(
    userId: string,
    password: string,
    action: SensitiveAction
): Promise<{ success: boolean; token?: string; error?: string }> {
    // Get user
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true }
    })

    if (!user) {
        return { success: false, error: 'User not found' }
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
        return { success: false, error: 'Invalid password' }
    }

    // Create elevated session
    const now = Date.now()
    const token = await generateElevationToken(userId, action)
    const session: ElevatedSession = {
        userId,
        elevatedAt: now,
        expiresAt: now + ELEVATION_DURATION_MS,
        action
    }

    // Persist to Redis with TTL
    const key = `${REDIS_ELEVATION_PREFIX}${token}`
    await redis.set(key, JSON.stringify(session), 'PX', ELEVATION_DURATION_MS)

    logger.info(`[Security] Elevation granted for user ${userId}`, { action })

    return { success: true, token }
}

async function generateElevationToken(userId: string, action: string): Promise<string> {
    const random = crypto.randomUUID?.() || Math.random().toString(36).substring(2)
    const raw = `${userId}:${action}:${random}:${Date.now()}`
    return crypto.createHash('sha256').update(raw).digest('hex')
}

/**
 * Verify elevated session for an action
 */
export async function verifyElevation(
    token: string,
    userId: string,
    action: SensitiveAction
): Promise<{ valid: boolean; error?: string }> {
    const key = `${REDIS_ELEVATION_PREFIX}${token}`
    const data = await redis.get(key)

    if (!data) {
        return { valid: false, error: 'Re-authentication required (Session expired or invalid)' }
    }

    try {
        const session = JSON.parse(data as string) as ElevatedSession

        if (session.userId !== userId) {
            return { valid: false, error: 'Session mismatch' }
        }

        if (session.action !== action) {
            return { valid: false, error: 'Action mismatch' }
        }

        return { valid: true }
    } catch (e) {
        return { valid: false, error: 'Malformed elevation data' }
    }
}

/**
 * Consume elevated session (one-time use)
 */
export async function consumeElevation(token: string): Promise<void> {
    const key = `${REDIS_ELEVATION_PREFIX}${token}`
    await redis.del(key)
}

/**
 * Check if action requires elevation
 */
export function requiresElevation(action: string): boolean {
    return SENSITIVE_ACTIONS.includes(action as SensitiveAction)
}

/**
 * CAPTCHA verification (Production Hardened)
 */
export async function checkActionCaptcha(token: string, remoteIp?: string): Promise<boolean> {
    const result = await verifyHCaptcha(token, remoteIp)

    if (!result.success && process.env.NODE_ENV === 'production') {
        logger.warn('[Security] CAPTCHA verification failed', { error: result.error, ip: remoteIp })
    }

    return result.success
}
/**
 * Rate limit check for suspicious activity
 */
export function checkSuspiciousActivity(userId: string, action: string): {
    suspicious: boolean
    reason?: string
} {
    // TODO: Implement actual anomaly detection
    // - Check action frequency
    // - Check geographic changes
    // - Check device changes

    return { suspicious: false }
}
