import { randomBytes, createHash, createHmac } from 'crypto'
import { timingSafeEqual } from '@/lib/core/isomorphic-crypto'
import { prisma } from '@/lib/core/db'
import { auditLogger } from '@/lib/core/audit'
import { ApiKey, ApiTier } from '@prisma/client'
import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'

// Key format: nxn_live_xxxx or nxn_test_xxxx (32 random chars)
const KEY_PREFIX_LIVE = 'nxn_live_'
const KEY_PREFIX_TEST = 'nxn_test_'
const KEY_RANDOM_LENGTH = 32

export interface ApiKeyWithRawKey extends ApiKey {
    rawKey?: string // Only returned when key is created
}

export interface CreateApiKeyInput {
    userId: string
    name: string
    permissions?: string[]
    tier?: ApiTier
    rateLimit?: number
    expiresAt?: Date | null
    ipWhitelist?: string[]
    isTest?: boolean
}

export interface ValidateApiKeyResult {
    valid: boolean
    key?: ApiKey
    error?: string
}

/**
 * Generate a cryptographically secure random key
 */
function generateRandomKey(isTest: boolean = false): string {
    const prefix = isTest ? KEY_PREFIX_TEST : KEY_PREFIX_LIVE
    const randomPart = randomBytes(KEY_RANDOM_LENGTH).toString('base64url').slice(0, KEY_RANDOM_LENGTH)
    return `${prefix}${randomPart}`
}

/**
 * Hash a key using SHA-256
 */
function hashKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex')
}

/**
 * Extract prefix from key (for identification)
 */
function extractPrefix(rawKey: string): string {
    // Return first 13 chars (e.g., "nxn_live_xxxx")
    return rawKey.slice(0, 13)
}

/**
 * Create a new API key for a user
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<ApiKeyWithRawKey> {
    const {
        userId,
        name,
        permissions = ['read', 'numbers', 'sms'],
        tier = 'FREE',
        rateLimit,
        expiresAt = null,
        ipWhitelist = [],
        isTest = false
    } = input

    // Get default rate limit based on tier
    const defaultRateLimits: Record<ApiTier, number> = {
        FREE: 60,
        PRO: 300,
        ENTERPRISE: 1000
    }

    const finalRateLimit = rateLimit ?? defaultRateLimits[tier]

    // Generate the key
    const rawKey = generateRandomKey(isTest)
    const keyHash = hashKey(rawKey)
    const prefix = extractPrefix(rawKey)

    // Check if user already has max keys (limit: 5 for free, 20 for pro, unlimited for enterprise)
    const existingKeysCount = await prisma.apiKey.count({
        where: { userId, isActive: true }
    })

    const maxKeys: Record<ApiTier, number> = {
        FREE: 5,
        PRO: 20,
        ENTERPRISE: 1000
    }

    if (existingKeysCount >= maxKeys[tier]) {
        throw new Error(`Maximum number of API keys reached for ${tier} tier (${maxKeys[tier]})`)
    }

    // Create the key in database
    const apiKey = await prisma.apiKey.create({
        data: {
            userId,
            name,
            keyHash,
            prefix,
            permissions,
            tier,
            rateLimit: finalRateLimit,
            expiresAt,
            ipWhitelist,
            isActive: true
        }
    })

    // Log security event
    await auditLogger.log(userId, 'API_KEY_CREATE', {
        keyId: apiKey.id,
        name: apiKey.name,
        permissions: apiKey.permissions,
        tier: apiKey.tier,
        resourceType: 'api_key',
        resourceId: apiKey.id
    })

    // Return with raw key (only time it's visible)
    return {
        ...apiKey,
        rawKey
    }
}

/**
 * Validate an API key and return the key record
 * Now with Redis-backed caching for ultra-low latency.
 */
export async function validateApiKey(rawKey: string, requestIp?: string): Promise<ValidateApiKeyResult> {
    if (!rawKey || typeof rawKey !== 'string') {
        return { valid: false, error: 'No API key provided' }
    }

    if (!rawKey.startsWith(KEY_PREFIX_LIVE) && !rawKey.startsWith(KEY_PREFIX_TEST)) {
        return { valid: false, error: 'Invalid API key format' }
    }

    const keyHash = hashKey(rawKey)
    const cacheKey = `auth:apikey:${keyHash}`

    try {
        // 1. Try Cache First
        const cached = await redis.get(cacheKey)
        if (cached) {
            const data = JSON.parse(cached)
            // Re-hydrate Date objects
            if (data.expiresAt) data.expiresAt = new Date(data.expiresAt);
            if (data.lastUsedAt) data.lastUsedAt = new Date(data.lastUsedAt);
            if (data.createdAt) data.createdAt = new Date(data.createdAt);
            if (data.updatedAt) data.updatedAt = new Date(data.updatedAt);

            // Perform checks on cached data
            if (!data.isActive) return { valid: false, error: 'API key is revoked' };
            if (data.expiresAt && data.expiresAt < new Date()) return { valid: false, error: 'API key has expired' };
            if (data.user?.isBanned) return { valid: false, error: 'User account is suspended' }; // Assuming user is included in cached data

            // Still perform IP check if whitelisted
            if (data.ipWhitelist?.length > 0 && requestIp) {
                if (!data.ipWhitelist.includes(requestIp)) {
                    return { valid: false, error: 'IP address not whitelisted' }
                }
            }
            return { valid: true, key: data }
        }
    } catch (err) {
        logger.warn('[Auth:Cache] Redis lookup failed, falling back to DB', err)
    }

    // 2. Database Fallback
    const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash },
        include: { user: { select: { id: true, isBanned: true, email: true } } }
    })

    if (!apiKey) return { valid: false, error: 'Invalid API key' }
    if (!apiKey.isActive) return { valid: false, error: 'API key is revoked' }
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return { valid: false, error: 'API key has expired' }
    if (apiKey.user.isBanned) return { valid: false, error: 'User account is suspended' }

    if (apiKey.ipWhitelist.length > 0 && requestIp) {
        if (!apiKey.ipWhitelist.includes(requestIp)) {
            return { valid: false, error: 'IP address not whitelisted' }
        }
    }

    // 3. Populate Cache (TTL: 5 minutes)
    try {
        await redis.set(cacheKey, JSON.stringify(apiKey), 'EX', 300)
    } catch (err) {
        logger.warn('[Auth:Cache] Failed to populate cache', err)
    }

    // Update usage stats (async)
    prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { usageCount: { increment: 1 }, lastUsedAt: new Date(), lastUsedIp: requestIp || null }
    }).catch(err => console.error('Failed to update API key stats:', err))

    return { valid: true, key: apiKey }
}

/**
 * List API keys for a user (excludes hash for security)
 */
export async function listApiKeys(userId: string): Promise<Omit<ApiKey, 'keyHash'>[]> {
    const keys = await prisma.apiKey.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            userId: true,
            name: true,
            prefix: true,
            permissions: true,
            tier: true,
            rateLimit: true,
            usageCount: true,
            lastUsedAt: true,
            lastUsedIp: true,
            expiresAt: true,
            isActive: true,
            ipWhitelist: true,
            createdAt: true,
            updatedAt: true
        }
    })

    return keys as Omit<ApiKey, 'keyHash'>[]
}

/**
 * Revoke (deactivate) an API key
 */
export async function revokeApiKey(keyId: string, userId: string): Promise<boolean> {
    const result = await prisma.apiKey.updateMany({
        where: { id: keyId, userId },
        data: { isActive: false }
    })

    if (result.count > 0) {
        await auditLogger.log(userId, 'API_KEY_REVOKE', {
            keyId,
            resourceType: 'api_key',
            resourceId: keyId
        })
    }

    return result.count > 0
}

/**
 * Delete an API key permanently
 */
export async function deleteApiKey(keyId: string, userId: string): Promise<boolean> {
    const result = await prisma.apiKey.deleteMany({
        where: { id: keyId, userId }
    })

    if (result.count > 0) {
        await auditLogger.log(userId, 'ADMIN_ACTION', {
            action: 'DELETE_API_KEY',
            keyId,
            resourceType: 'api_key',
            resourceId: keyId
        })
    }

    return result.count > 0
}

/**
 * Regenerate an API key (creates new key, deactivates old one)
 */
export async function regenerateApiKey(keyId: string, userId: string): Promise<ApiKeyWithRawKey | null> {
    // Get the old key
    const oldKey = await prisma.apiKey.findFirst({
        where: { id: keyId, userId, isActive: true }
    })

    if (!oldKey) {
        return null
    }

    // Deactivate old key
    await prisma.apiKey.update({
        where: { id: keyId },
        data: { isActive: false }
    })

    // Create new key with same settings
    return createApiKey({
        userId,
        name: oldKey.name,
        permissions: oldKey.permissions,
        tier: oldKey.tier,
        rateLimit: oldKey.rateLimit,
        expiresAt: oldKey.expiresAt,
        ipWhitelist: oldKey.ipWhitelist,
        isTest: oldKey.prefix.includes('test')
    })
}

/**
 * Check if key has specific permission
 */
export function hasPermission(key: ApiKey, permission: string): boolean {
    // Admin permission grants all
    if (key.permissions.includes('admin')) return true

    // Check specific permission
    return key.permissions.includes(permission)
}

/**
 * Get rate limit for a key
 */
export function getRateLimit(key: ApiKey): number {
    return key.rateLimit
}

/**
 * Generate a webhook signing secret
 */
export function generateWebhookSecret(): string {
    return randomBytes(32).toString('hex')
}

/**
 * Sign a webhook payload
 */
export function signWebhookPayload(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Verify a webhook signature (Timing-Safe)
 */
export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expected = signWebhookPayload(payload, secret)

    try {
        const sigBuf = Buffer.from(signature, 'hex')
        const expectedBuf = Buffer.from(expected, 'hex')

        if (sigBuf.length !== expectedBuf.length) return false
        return timingSafeEqual(sigBuf, expectedBuf)
    } catch {
        return false
    }
}
