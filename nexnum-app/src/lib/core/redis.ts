import Redis from 'ioredis'

// Redis client initialization (Singleton)
const getRedisUrl = () => {
    if (process.env.REDIS_URL) return process.env.REDIS_URL;
    // Fallback to local Docker Redis with default password
    return 'redis://:dev_redis_pass@localhost:6379';
};

export const redis = new Redis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

redis.on('error', (err) => {
    console.error('[Redis] Connection Error:', err);
});

// Key patterns
export const REDIS_KEYS = {
    // Rate limiting
    rateLimit: (type: string, id: string) => `rate:${type}:${id}`,

    // Idempotency keys (prevent duplicate transactions)
    idempotency: (key: string) => `idem:${key}`,

    // Number reservation locks
    numberLock: (numberId: string) => `lock:number:${numberId}`,

    // Session (if not using JWT-only)
    session: (sessionId: string) => `session:${sessionId}`,

    // SMS polling state
    smsPolling: (numberId: string) => `sms:polling:${numberId}`,
}

// TTL values (in seconds)
export const TTL = {
    RATE_LIMIT: 60,           // 1 minute window
    IDEMPOTENCY: 86400,       // 24 hours
    NUMBER_LOCK: 300,         // 5 minutes reservation
    SESSION: 900,             // 15 minutes
    SMS_POLLING: 60,          // 1 minute between polls
}

// Helper: Check and set idempotency key
export async function checkIdempotency(key: string): Promise<boolean> {
    const redisKey = REDIS_KEYS.idempotency(key)

    // Set NX (Only if doesn't exist) with EX (Expire)
    const result = await redis.set(redisKey, '1', 'EX', TTL.IDEMPOTENCY, 'NX')

    return result === 'OK'
}

// Helper: Acquire lock for number reservation
export async function acquireNumberLock(numberId: string): Promise<boolean> {
    const key = REDIS_KEYS.numberLock(numberId)
    const result = await redis.set(key, Date.now().toString(), 'EX', TTL.NUMBER_LOCK, 'NX')

    return result === 'OK'
}

// Helper: Release lock
export async function releaseNumberLock(numberId: string): Promise<void> {
    await redis.del(REDIS_KEYS.numberLock(numberId))
}

// ============================================================================
// Generic Cache Helpers (to avoid database queries)
// ============================================================================

/**
 * Cache-aside pattern: Get from cache, or fetch and cache
 */
export async function cacheGet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = 300
): Promise<T> {
    try {
        // Try cache first
        const cached = await redis.get(key)
        if (cached !== null) {
            try {
                return JSON.parse(cached) as T
            } catch {
                return cached as unknown as T
            }
        }

        // Fetch from source
        const value = await fetchFn()

        // Cache the result
        const stringified = typeof value === 'string' ? value : JSON.stringify(value)
        await redis.set(key, stringified, 'EX', ttlSeconds)

        return value
    } catch (error) {
        // If Redis fails, just fetch directly
        console.warn('[Redis] Cache error, fetching directly:', error)
        return fetchFn()
    }
}

/**
 * Cache invalidation
 */
export async function cacheInvalidate(pattern: string): Promise<void> {
    try {
        // For single key deletion
        await redis.del(pattern)
    } catch (error) {
        console.warn('[Redis] Cache invalidation error:', error)
    }
}

/**
 * Cache set with TTL
 */
export async function cacheSet<T>(
    key: string,
    value: T,
    ttlSeconds: number = 300
): Promise<void> {
    try {
        const stringified = typeof value === 'string' ? value : JSON.stringify(value)
        await redis.set(key, stringified, 'EX', ttlSeconds)
    } catch (error) {
        console.warn('[Redis] Cache set error:', error)
    }
}

// Cache key patterns for common entities
export const CACHE_KEYS = {
    // Provider prices (frequently accessed)
    providerPrices: (providerId: string, country: string, service: string) =>
        `cache:prices:${providerId}:${country}:${service}`,

    // Country list (stable, long TTL)
    countryList: (providerId: string) => `cache:countries:${providerId}`,

    // Service list (stable, long TTL)
    serviceList: (providerId: string) => `cache:services:${providerId}`,

    // User balance (frequently accessed)
    userBalance: (userId: string) => `cache:balance:${userId}`,

    // Provider balance (for admin dashboard)
    providerBalance: (providerId: string) => `cache:provider:balance:${providerId}`,

    // Dashboard state (batch endpoint cache)
    dashboardState: (userId: string) => `cache:dashboard:${userId}`,
}

// Cache TTLs (in seconds)
export const CACHE_TTL = {
    PRICES: 60,         // 1 minute - prices can change
    COUNTRIES: 3600,    // 1 hour - stable
    SERVICES: 3600,     // 1 hour - stable  
    USER_BALANCE: 30,   // 30 seconds - needs to be fresh
    PROVIDER_BALANCE: 300, // 5 minutes - dashboard use
    DASHBOARD_STATE: 10, // 10 seconds - frequently accessed batch data
}
