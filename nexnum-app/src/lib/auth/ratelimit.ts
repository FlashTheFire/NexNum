import { redis } from '@/lib/core/redis'
import { ResponseFactory } from '@/lib/api/response-factory'
// Lua script for atomic sliding window rate limiting
const LIMIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local clearBefore = now - window

-- Remove old entries
redis.call('ZREMRANGEBYSCORE', key, 0, clearBefore)

-- Get current count
local currentCount = redis.call('ZCARD', key)

local allowed = 0
if currentCount < limit then
    -- Add current request
    redis.call('ZADD', key, now, now)
    redis.call('EXPIRE', key, math.ceil(window / 1000) + 1)
    allowed = 1
    currentCount = currentCount + 1
end

return {allowed, limit - currentCount}
`;

class SlidingWindowLimiter {
    private prefix: string
    private windowSizeMs: number
    private getLimit: () => Promise<number>
    private failClosed: boolean

    constructor(prefix: string, windowSeconds: number, getLimit: () => Promise<number>, failClosed = false) {
        this.prefix = prefix
        this.windowSizeMs = windowSeconds * 1000
        this.getLimit = getLimit
        this.failClosed = failClosed
    }

    async limit(identifier: string, customLimit?: number) {
        const key = `${this.prefix}:${identifier}`
        const limit = customLimit ?? (await this.getLimit())
        const now = Date.now()

        try {
            // @ts-ignore - ioredis eval returns any
            const [allowed, remaining] = await redis.eval(
                LIMIT_SCRIPT,
                1,
                key,
                now.toString(),
                this.windowSizeMs.toString(),
                limit.toString()
            )

            return {
                success: allowed === 1,
                limit,
                remaining: Math.max(0, remaining),
                reset: now + this.windowSizeMs,
                // Industrial Helper
                toResponse: () => {
                    const res = ResponseFactory.error('Too many requests', 429, 'E_RATE_LIMIT')
                    res.headers.set('X-RateLimit-Limit', limit.toString())
                    res.headers.set('X-RateLimit-Remaining', Math.max(0, remaining).toString())
                    res.headers.set('X-RateLimit-Reset', (now + this.windowSizeMs).toString())
                    res.headers.set('Retry-After', Math.ceil(this.windowSizeMs / 1000).toString())
                    return res
                }
            }
        } catch (error) {
            console.error('[RateLimit] Execution failed:', error)
            // C6: Auth-sensitive limiters fail CLOSED (deny request) to protect endpoints
            if (this.failClosed) {
                return {
                    success: false,
                    limit: 0,
                    remaining: 0,
                    reset: now + this.windowSizeMs,
                    toResponse: () => ResponseFactory.error('Service temporarily unavailable', 503, 'E_RATE_LIMIT_ERROR')
                }
            }
            // Non-auth limiters fail OPEN to preserve availability
            return {
                success: true, limit, remaining: limit, reset: 0,
                toResponse: () => ResponseFactory.success({ ok: true })
            }
        }
    }
}

// Hardcoded defaults (M2: Reduced authLimit from 600 to 20 — auth endpoints need tighter limits)
const getLimitConfig = async () => ({
    apiLimit: 1000,
    authLimit: 20,
    adminLimit: 100,
    windowSize: 60
})

export const rateLimiters = {
    // General API limiter
    api: new SlidingWindowLimiter('@ratelimit:api', 60, async () => {
        const config = await getLimitConfig()
        return config.apiLimit
    }),

    // Auth limiter — C6: fail closed on Redis errors to protect auth endpoints
    auth: new SlidingWindowLimiter('@ratelimit:auth', 60, async () => {
        const config = await getLimitConfig()
        return config.authLimit
    }, true),

    // Transaction limiter (sensitive) — fail closed
    transaction: new SlidingWindowLimiter('@ratelimit:tx', 60, async () => 60, true),

    // Admin API limiter — fail closed
    admin: new SlidingWindowLimiter('@ratelimit:admin', 60, async () => {
        const config = await getLimitConfig()
        return config.adminLimit
    }, true),
}

export type RatelimitType = keyof typeof rateLimiters
