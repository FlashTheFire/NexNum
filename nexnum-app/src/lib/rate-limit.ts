import { redis, REDIS_KEYS, TTL } from './redis'

interface RateLimitResult {
    success: boolean
    remaining: number
    reset: number
}

interface RateLimitConfig {
    maxRequests: number
    windowSec: number
}

// Default rate limit configs
export const RATE_LIMITS = {
    // General API calls
    api: { maxRequests: 60, windowSec: 60 },     // 60 req/min

    // Auth endpoints (stricter)
    auth: { maxRequests: 5, windowSec: 60 },      // 5 req/min

    // Wallet operations (very strict)
    wallet: { maxRequests: 10, windowSec: 60 },   // 10 req/min

    // Number purchase (strictest)
    purchase: { maxRequests: 3, windowSec: 60 },  // 3 req/min

    // SMS polling (generous)
    sms: { maxRequests: 30, windowSec: 60 },      // 30 req/min
}

/**
 * Rate limiting using Redis sliding window
 */
export async function rateLimit(
    identifier: string,
    type: keyof typeof RATE_LIMITS = 'api'
): Promise<RateLimitResult> {
    const config = RATE_LIMITS[type]
    const key = REDIS_KEYS.rateLimit(type, identifier)
    const now = Date.now()
    const windowStart = now - (config.windowSec * 1000)

    // Use Redis pipeline for atomic operations
    const pipeline = redis.pipeline()

    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, 0, windowStart)

    // Add current request
    pipeline.zadd(key, { score: now, member: `${now}` })

    // Count requests in window
    pipeline.zcard(key)

    // Set expiry
    pipeline.expire(key, config.windowSec)

    const results = await pipeline.exec()
    const requestCount = results[2] as number

    const success = requestCount <= config.maxRequests
    const remaining = Math.max(0, config.maxRequests - requestCount)
    const reset = Math.ceil((windowStart + (config.windowSec * 1000)) / 1000)

    return { success, remaining, reset }
}

/**
 * Simple rate limit check (no increment)
 */
export async function checkRateLimit(
    identifier: string,
    type: keyof typeof RATE_LIMITS = 'api'
): Promise<boolean> {
    const config = RATE_LIMITS[type]
    const key = REDIS_KEYS.rateLimit(type, identifier)
    const now = Date.now()
    const windowStart = now - (config.windowSec * 1000)

    // Clean old entries and count
    await redis.zremrangebyscore(key, 0, windowStart)
    const count = await redis.zcard(key)

    return count < config.maxRequests
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
    return {
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.reset.toString(),
    }
}
