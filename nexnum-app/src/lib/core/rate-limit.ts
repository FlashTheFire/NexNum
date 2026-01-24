
import { redis } from '@/lib/core/redis'

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

        const execTimeRaw = await redis.eval(refinedScript, 1, key, intervalMs, now)
        const executionTime = Number(execTimeRaw)

        const waitTime = Math.max(0, executionTime - now)

        return waitTime
    }
}
