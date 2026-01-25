import { Redis } from 'ioredis';
import { redis } from '@/lib/core/redis';
import { logger } from '@/lib/core/logger';

export class SocketRateLimiter {
    private static MAX_CONNECTIONS_PER_USER = 5;
    private static KEY_PREFIX = 'socket:connections';

    /**
     * Attempts to register a new connection for a user.
     * Returns true if allowed, false if limit exceeded.
     */
    static async tryAcquire(userId: string, socketId: string): Promise<boolean> {
        const key = `${this.KEY_PREFIX}:${userId}`;

        try {
            // Transaction: Add socket, get count, set expiry (cleanup safe)
            const pipeline = redis.multi();
            pipeline.sadd(key, socketId);
            pipeline.scard(key);
            pipeline.expire(key, 86400); // 24h cleanup safety

            const results = await pipeline.exec();
            if (!results) return false;

            // results[1] is result of scard (current count)
            // format: [error, result]
            const countError = results[1][0];
            const count = results[1][1] as number;

            if (countError) throw countError;

            if (count > this.MAX_CONNECTIONS_PER_USER) {
                // Rollback: Remove the socket we just added
                await redis.srem(key, socketId);
                logger.warn(`[SocketLimiter] User ${userId} exceeded limit (${count}/${this.MAX_CONNECTIONS_PER_USER})`);
                return false;
            }

            return true;

        } catch (error) {
            logger.error('[SocketLimiter] Error acquiring lock', error);
            // Fail open or closed? 
            // Fail open (allow connection) avoids outage during Redis blip
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
