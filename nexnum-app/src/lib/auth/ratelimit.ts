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

    constructor(prefix: string, windowSeconds: number, getLimit: () => Promise<number>) {
        this.prefix = prefix
        this.windowSizeMs = windowSeconds * 1000
        this.getLimit = getLimit
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
            console.error('[RateLimit] Execution failed, failing open:', error)
            return {
                success: true, limit, remaining: limit, reset: 0,
                toResponse: () => ResponseFactory.success({ ok: true }) // Should not be called if success is true
            }
        }
    }
}

// Hardcoded defaults (matching previous logic)
const getLimitConfig = async () => ({
    apiLimit: 1000,
    authLimit: 600,
    adminLimit: 100,
    windowSize: 60
})

export const rateLimiters = {
    // General API limiter
    api: new SlidingWindowLimiter('@ratelimit:api', 60, async () => {
        const config = await getLimitConfig()
        return config.apiLimit
    }),

    // Auth limiter
    auth: new SlidingWindowLimiter('@ratelimit:auth', 60, async () => {
        const config = await getLimitConfig()
        return config.authLimit
    }),

    // Transaction limiter (sensitive)
    transaction: new SlidingWindowLimiter('@ratelimit:tx', 60, async () => 60),

    // Admin API limiter
    admin: new SlidingWindowLimiter('@ratelimit:admin', 60, async () => {
        const config = await getLimitConfig()
        return config.adminLimit
    }),
}

export type RatelimitType = keyof typeof rateLimiters
