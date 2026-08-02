/**
 * Distributed Presence Monitor
 * 
 * Tracks active user sessions across a cluster of socket servers.
 * Uses Redis sorted sets (score = expiry ms) to provide global visibility
 * into "Who is online" — crash-safe via TTL-based expiry.
 */

import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'

export class PresenceMonitor {
    private static KEY = 'presence:users:zset'
    private static TTL_MS = 3_600_000 // 1 hour safety expiry

    /**
     * Mark a user as online.
     * Score = absolute expiry timestamp (ms). Auto-expires if disconnect never fires.
     */
    static async trackOnline(userId: string): Promise<void> {
        try {
            const expireAt = Date.now() + this.TTL_MS
            await redis.zadd(this.KEY, expireAt, userId)
        } catch (error) {
            logger.error('[Presence] Failed to track online', { userId, error })
        }
    }

    /**
     * Mark a user as offline.
     */
    static async trackOffline(userId: string): Promise<void> {
        try {
            await redis.zrem(this.KEY, userId)
        } catch (error) {
            logger.error('[Presence] Failed to track offline', { userId, error })
        }
    }

    /**
     * Get the global count of unique online users (excluding stale/crashed entries).
     */
    static async getGlobalOnlineCount(): Promise<number> {
        try {
            // Only count members whose expiry score is in the future
            return await redis.zcount(this.KEY, Date.now(), '+inf')
        } catch (error) {
            logger.error('[Presence] Failed to get online count', { error })
            return 0
        }
    }

    /**
     * Check if a specific user is currently online globally.
     */
    static async isUserOnline(userId: string): Promise<boolean> {
        try {
            const score = await redis.zscore(this.KEY, userId)
            if (!score) return false
            return parseFloat(score) > Date.now() // expired = offline
        } catch (error) {
            logger.error('[Presence] Failed to check user presence', { userId, error })
            return false
        }
    }

    /**
     * Prune stale entries (optional maintenance — called by a cron or on startup).
     */
    static async pruneStale(): Promise<void> {
        try {
            await redis.zremrangebyscore(this.KEY, '-inf', Date.now() - 1)
        } catch (error) {
            logger.error('[Presence] Failed to prune stale entries', { error })
        }
    }
}
