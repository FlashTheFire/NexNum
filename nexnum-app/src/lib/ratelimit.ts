import { Ratelimit } from '@upstash/ratelimit'
import { redis } from '@/lib/redis'

// Create a new ratelimiter, that allows 10 requests per 10 seconds
// You can create multiple limiters for different purposes
export const rateLimiters = {
    // General API limiter (moderate traffic)
    api: new Ratelimit({
        redis: redis,
        limiter: Ratelimit.slidingWindow(20, '10 s'),
        analytics: true,
        prefix: '@upstash/ratelimit',
    }),

    // Auth limiter (stricter - prevents brute force)
    auth: new Ratelimit({
        redis: redis,
        limiter: Ratelimit.slidingWindow(5, '60 s'), // 5 attempts per minute
        analytics: true,
        prefix: '@upstash/ratelimit-auth',
    }),

    // SMS Purchase/Action limiter (prevent balance draining automation)
    transaction: new Ratelimit({
        redis: redis,
        limiter: Ratelimit.slidingWindow(10, '60 s'),
        analytics: true,
        prefix: '@upstash/ratelimit-tx',
    }),
}

export type RatelimitType = keyof typeof rateLimiters
