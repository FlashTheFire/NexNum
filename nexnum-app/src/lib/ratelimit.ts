import { Ratelimit } from '@upstash/ratelimit'
import { redis } from '@/lib/redis'
import { SettingsService } from '@/lib/settings'

// Cache limits in memory to avoid fetching calls on every request
// Cache validity: 1 minute
let limitConfigCache: {
    config: Awaited<ReturnType<typeof SettingsService.getRateLimits>>,
    timestamp: number
} | null = null

async function getLimitConfig() {
    const now = Date.now()
    if (limitConfigCache && (now - limitConfigCache.timestamp < 60000)) {
        return limitConfigCache.config
    }

    try {
        const config = await SettingsService.getRateLimits()
        limitConfigCache = { config, timestamp: now }
        return config
    } catch (e) {
        // Fallback defaults
        return {
            apiLimit: 100,
            authLimit: 5,
            adminLimit: 30,
            windowSize: 60
        }
    }
}

// Wrapper for dynamic rate limiting
class DynamicLimiter {
    private prefix: string
    private getLimit: () => Promise<number>

    constructor(prefix: string, getLimit: () => Promise<number>) {
        this.prefix = prefix
        this.getLimit = getLimit
    }

    async limit(identifier: string) {
        const maxRequests = await this.getLimit()

        // We create a new limiter instance to ensure it uses the latest limit
        // This is cheap as it's just a class instantiation, not a DB connection
        const limiter = new Ratelimit({
            redis: redis,
            limiter: Ratelimit.slidingWindow(maxRequests, '60 s'),
            analytics: true,
            prefix: this.prefix,
        })

        return limiter.limit(identifier)
    }
}

export const rateLimiters = {
    // General API limiter
    api: new DynamicLimiter('@upstash/ratelimit', async () => {
        const config = await getLimitConfig()
        return config.apiLimit
    }),

    // Auth limiter
    auth: new DynamicLimiter('@upstash/ratelimit-auth', async () => {
        const config = await getLimitConfig()
        return config.authLimit
    }),

    // Transaction limiter (static for now, sensitive)
    transaction: new Ratelimit({
        redis: redis,
        limiter: Ratelimit.slidingWindow(60, '60 s'),
        analytics: true,
        prefix: '@upstash/ratelimit-tx',
    }),

    // Admin API limiter
    admin: new DynamicLimiter('@upstash/ratelimit-admin', async () => {
        const config = await getLimitConfig()
        return config.adminLimit
    }),
}

export type RatelimitType = keyof typeof rateLimiters
