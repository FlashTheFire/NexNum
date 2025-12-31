import { Redis } from '@upstash/redis'

// Upstash Redis client (serverless)
export const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

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
    const exists = await redis.get(redisKey)

    if (exists) return false // Key already used

    // Set key with TTL
    await redis.setex(redisKey, TTL.IDEMPOTENCY, '1')
    return true // Key is new, proceed
}

// Helper: Acquire lock for number reservation
export async function acquireNumberLock(numberId: string): Promise<boolean> {
    const key = REDIS_KEYS.numberLock(numberId)
    const result = await redis.setnx(key, Date.now().toString())

    if (result === 1) {
        await redis.expire(key, TTL.NUMBER_LOCK)
        return true
    }

    return false
}

// Helper: Release lock
export async function releaseNumberLock(numberId: string): Promise<void> {
    await redis.del(REDIS_KEYS.numberLock(numberId))
}
