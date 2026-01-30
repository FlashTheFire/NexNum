/**
 * Distributed Presence Monitor
 * 
 * Tracks active user sessions across a cluster of socket servers.
 * Uses Redis sets to provide global visibility into "Who is online".
 */

import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'

export class PresenceMonitor {
    private static KEY_PREFIX = 'presence:users'
    private static TTL = 3600 // 1 hour safety expiry

    /**
     * Mark a user as online.
     */
    static async trackOnline(userId: string): Promise<void> {
        try {
            const key = this.KEY_PREFIX
            await redis.sadd(key, userId)
            // Note: We don't expire the whole set, but a cleanup job can verify presence.
            // For NexNum, we'll keep it simple: Add on connect, remove on disconnect.
        } catch (error) {
            logger.error('[Presence] Failed to track online', { userId, error })
        }
    }

    /**
     * Mark a user as offline.
     */
    static async trackOffline(userId: string): Promise<void> {
        try {
            await redis.srem(this.KEY_PREFIX, userId)
        } catch (error) {
            logger.error('[Presence] Failed to track offline', { userId, error })
        }
    }

    /**
     * Get the global count of unique online users.
     */
    static async getGlobalOnlineCount(): Promise<number> {
        try {
            return await redis.scard(this.KEY_PREFIX)
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
            const result = await redis.sismember(this.KEY_PREFIX, userId)
            return result === 1
        } catch (error) {
            logger.error('[Presence] Failed to check user presence', { userId, error })
            return false
        }
    }
}
