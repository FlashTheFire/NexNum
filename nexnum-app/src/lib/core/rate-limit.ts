import { redis, TTL } from '@/lib/core/redis'

export interface RateLimitResult {
    success: boolean
    limit: number
    remaining: number
    reset: number
}

/**
 * Node.js Runtime Rate Limiter (Fixed Window Counter)
 * Uses atomic INCR + EXPIRE
 */
export async function rateLimit(
    identifier: string,
    limit: number = 10,
    windowSeconds: number = 10
): Promise<RateLimitResult> {
    try {
        const key = `ratelimit:${identifier}`
        const now = Date.now()

        // Pipelined for atomic performance
        // 1. INCR key
        // 2. TTL key (to check if we need to set expiry)
        const [currentCount, ttl] = await redis.multi()
            .incr(key)
            .ttl(key)
            .exec() as [any, any]

        // If key is new (ttl = -1) or has no expiry, set it
        // We use the result of INCR (index 0, value 1) which is [error, result]
        const count = currentCount[1] as number

        if (count === 1) {
            await redis.expire(key, windowSeconds)
        }

        const remaining = Math.max(0, limit - count)
        const reset = now + (windowSeconds * 1000)

        return {
            success: count <= limit,
            limit,
            remaining,
            reset
        }
    } catch (error) {
        console.error('[RateLimit] Error:', error)
        // Fail open to avoid blocking legit traffic on Redis error
        return { success: true, limit, remaining: 1, reset: Date.now() }
    }
}
