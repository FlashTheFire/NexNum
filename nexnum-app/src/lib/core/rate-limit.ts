import { redis } from '@/lib/core/redis'
import { IndustrialHealthCollector } from '@/lib/telemetry/health'
import { logger } from './logger'

/**
 * Predictive Throttler Engine
 * 
 * Dynamically adjusts system "difficulty" based on real-time health telemetry.
 */
export class PredictiveThrottler {
    /**
     * Calculate a multiplier for rate limit intervals based on system pressure.
     * 1.0 = Normal (No pressure)
     * 2.0+ = Throttling active
     */
    static getPressureFactor(): number {
        const lag = IndustrialHealthCollector.getLag()

        // Elite Pressure Scaling Algorithm:
        // - < 100ms lag: 1.0 (Safe zone)
        // - 100ms - 500ms lag: Linear scaling from 1.0 to 3.0
        // - > 500ms lag: Exponential scaling to protect the process

        if (lag < 0.1) return 1.0

        if (lag >= 0.1 && lag <= 0.5) {
            // Linear scaling (y = mx + c)
            // (0.1, 1.0), (0.5, 3.0) -> m = 5
            return 1.0 + (lag - 0.1) * 5
        }

        // Emergency exponential saturation protection
        const factor = 3.0 + Math.pow((lag - 0.5) * 4, 2)
        return Math.min(factor, 10.0) // Cap at 10x
    }
}

/**
 * Distributed Rate Limiter
 * 
 * Uses Redis to coordinate rate limits across multiple worker instances.
 * Implements a "Next Available Slot" algorithm (Leaky Bucket variant).
 */
export class DistributedRateLimiter {

    /**
     * Reserve a slot for a provider request.
     * Returns the number of milliseconds to wait before proceeding.
     * 
     * @param providerId - Unique identifier for the provider (or rate limit scope)
     * @param intervalMs - Minimum time needed between requests (e.g. 1000ms = 1 req/sec)
     */
    static async reserveSlot(providerId: string, intervalMs: number): Promise<number> {
        const pressureFactor = PredictiveThrottler.getPressureFactor()
        const dynamicInterval = Math.ceil(intervalMs * pressureFactor)

        if (pressureFactor > 1.2) {
            logger.warn(`[PredictiveThrottler] Applying Pressure Factor: ${pressureFactor.toFixed(2)}x to ${providerId}`)
        }

        const key = `ratelimit:provider:${providerId}`
        const now = Date.now()

        // Atomically:
        // 1. Get current "next available time" (or use 'now' if key missing/old)
        // 2. Calculate new "next available time" = max(now, stored_time) + interval
        // 3. Save new time
        // 4. Return new time
        const script = `
            local key = KEYS[1]
            local interval = tonumber(ARGV[1])
            local now = tonumber(ARGV[2])
            
            local last_ts = tonumber(redis.call('get', key) or 0)
            
            -- If last_ts is in the past, reset to now
            if last_ts < now then
                last_ts = now
            end
            
            local next_ts = last_ts + interval
            
            -- Set with TTL (keep key alive for a bit longer than the interval)
            redis.call('set', key, next_ts, 'PX', math.max(next_ts - now + 10000, 60000))
            
            return next_ts
        `

        // Execute Lua script
        const result = await redis.eval(script, 1, key, intervalMs, now)
        const nextTs = Number(result)

        // Calculate wait time
        // nextTs is the time AFTER this request finishes rate limiting logic? 
        // No, the algorithm above reserves the slot ending at nextTs.
        // Wait, standard Leaky Bucket:
        // Arrival: now
        // Next Available: last_ts
        // If now < last_ts, must wait (last_ts - now)
        // New last_ts = max(now, last_ts) + interval

        // Let's refine the script to match "Virtual Schedule":

        const refinedScript = `
            local key = KEYS[1]
            local interval = tonumber(ARGV[1])
            local now = tonumber(ARGV[2])
            
            local scheduled_time = tonumber(redis.call('get', key) or 0)
            
            -- If the schedule is behind 'now', catch up
            if scheduled_time < now then
                scheduled_time = now
            end
            
            -- This request takes the slot starting at scheduled_time
            -- And pushes the schedule forward by interval
            
            local execution_time = scheduled_time
            local new_scheduled_time = scheduled_time + interval
            
            redis.call('set', key, new_scheduled_time, 'PX', 60000)
            
            return execution_time
        `

        const execTimeRaw = await redis.eval(refinedScript, 1, key, dynamicInterval, now)
        const executionTime = Number(execTimeRaw)

        const waitTime = Math.max(0, executionTime - now)

        return waitTime
    }
}

/**
 * Simple rate limit function for API endpoints
 * Used by auth routes for per-IP limiting
 * 
 * @param key - Unique identifier (e.g., "auth:192.168.1.1")
 * @param limit - Max requests allowed
 * @param windowSeconds - Time window in seconds
 */
export async function rateLimit(
    key: string,
    limit: number,
    windowSeconds: number
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
    const redisKey = `ratelimit:${key}`
    const now = Date.now()
    const windowMs = windowSeconds * 1000

    try {
        // Sliding window rate limit using Redis ZSET
        const script = `
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
        `

        const [allowed, remaining] = await redis.eval(
            script,
            1,
            redisKey,
            now.toString(),
            windowMs.toString(),
            limit.toString()
        ) as [number, number]

        return {
            success: allowed === 1,
            limit,
            remaining: Math.max(0, remaining),
            reset: now + windowMs
        }
    } catch (error) {
        console.error('[RateLimit] Redis error, failing open:', error)
        // Fail open - allow request if Redis is down
        return {
            success: true,
            limit,
            remaining: limit,
            reset: 0
        }
    }
}
