import { Redis } from 'ioredis';
import { redis } from '@/lib/core/redis';
import { logger } from '@/lib/core/logger';

export class SocketRateLimiter {
    private static MAX_CONNECTIONS_PER_USER = 5;
    private static KEY_PREFIX = 'socket:connections';

    /**
     * Attempts to register a new connection for a user.
     * Returns true if allowed, false if limit exceeded.
     * 
     * Uses an Atomic Lua Script for 100% precision in a distributed environment.
     */
    static async tryAcquire(userId: string, socketId: string): Promise<boolean> {
        const key = `${this.KEY_PREFIX}:${userId}`;

        try {
            // LUA SCRIPT:
            // 1. Check current set size
            // 2. If size < MAX, add the socketId and return 1
            // 3. Otherwise return 0
            const script = `
                local limit = tonumber(ARGV[2])
                local current = redis.call("SCARD", KEYS[1])
                if current < limit then
                    redis.call("SADD", KEYS[1], ARGV[1])
                    redis.call("EXPIRE", KEYS[1], 86400)
                    return 1
                else
                    -- Check if socketId is already in the set (idempotency)
                    if redis.call("SISMEMBER", KEYS[1], ARGV[1]) == 1 then
                        return 1
                    end
                    return 0
                end
            `;

            const result = await redis.eval(script, 1, key, socketId, this.MAX_CONNECTIONS_PER_USER);

            if (result === 0) {
                logger.warn(`[SocketLimiter] User ${userId} connection limit reached`);
                return false;
            }

            return true;
        } catch (error) {
            logger.error('[SocketLimiter] Error acquiring lock', error);
            // Fail open to avoid blocking users during Redis issues
            return true;
        }
    }

    /**
     * Removes a connection from the tracker.
     */
    static async release(userId: string, socketId: string): Promise<void> {
        const key = `${this.KEY_PREFIX}:${userId}`;
        try {
            await redis.srem(key, socketId);
        } catch (error) {
            logger.error('[SocketLimiter] Error releasing lock', error);
        }
    }
}
