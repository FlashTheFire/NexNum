/**
 * Active Order Stream Engine (v2 — Adaptive Scheduling)
 * 
 * High-performance, zero-DB in-memory active order set in Redis.
 * Eliminates PostgreSQL read overhead during active status polling cycles.
 * 
 * V2 Additions:
 * - Per-activation `nextPollAt` for adaptive interval scheduling within 3s ticks
 * - `providerId` (UUID) for correct provider adapter resolution
 * - `smsCount` / `lastSmsAt` tracking for post-SMS phase selection
 * - `getDueOrders()` returns only orders whose nextPollAt <= now
 */

import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'

export interface ActiveOrderData {
    numberId: string
    activationId: string
    userId: string
    provider: string       // Provider name (display)
    providerId: string     // Provider UUID for adapter resolution
    phoneNumber: string
    countryCode: string
    serviceCode: string
    createdAt: number      // epoch ms
    nextPollAt?: number    // epoch ms — when this order should next be polled
    smsCount?: number      // Number of SMS messages received so far
    lastSmsAt?: number     // epoch ms — when last SMS was received
    pollCount?: number     // Total poll attempts for adaptive phase selection
}

const REDIS_ACTIVE_ORDERS_SET = 'nexnum:orders:active_set'
const REDIS_ORDER_KEY_PREFIX = 'nexnum:orders:active:'
const ORDER_TTL_SECONDS = 1200 // 20 minutes expiration safety net

export class ActiveOrderStream {
    /**
     * Push a newly purchased number into the zero-DB active Redis stream.
     * Sets initial nextPollAt to NOW (poll immediately on next tick).
     */
    static async addActiveOrder(data: ActiveOrderData): Promise<void> {
        try {
            const key = `${REDIS_ORDER_KEY_PREFIX}${data.activationId}`
            const now = Date.now()
            const pipeline = redis.pipeline()
            pipeline.hset(key, {
                numberId: data.numberId,
                activationId: data.activationId,
                userId: data.userId,
                provider: data.provider,
                providerId: data.providerId || '',
                phoneNumber: data.phoneNumber,
                countryCode: data.countryCode,
                serviceCode: data.serviceCode,
                createdAt: String(data.createdAt || now),
                nextPollAt: String(data.nextPollAt || now), // Poll immediately
                smsCount: '0',
                lastSmsAt: '0',
                pollCount: '0'
            })
            pipeline.expire(key, ORDER_TTL_SECONDS)
            pipeline.sadd(REDIS_ACTIVE_ORDERS_SET, data.activationId)
            await pipeline.exec()

            logger.info(`[ActiveStream] Added activation #${data.activationId} to high-speed stream`, {
                context: 'ACTIVE_STREAM',
                activationId: data.activationId,
                provider: data.provider
            })
        } catch (error: any) {
            logger.error(`[ActiveStream] Failed to add activation #${data.activationId}`, {
                context: 'ACTIVE_STREAM',
                error: error.message
            })
        }
    }

    /**
     * Remove an order from active stream when completed, cancelled or expired
     */
    static async removeActiveOrder(activationId: string): Promise<void> {
        try {
            const key = `${REDIS_ORDER_KEY_PREFIX}${activationId}`
            const pipeline = redis.pipeline()
            pipeline.srem(REDIS_ACTIVE_ORDERS_SET, activationId)
            pipeline.del(key)
            await pipeline.exec()

            logger.debug(`[ActiveStream] Removed activation #${activationId} from stream`, {
                context: 'ACTIVE_STREAM',
                activationId
            })
        } catch (error: any) {
            logger.error(`[ActiveStream] Failed to remove activation #${activationId}`, {
                context: 'ACTIVE_STREAM',
                error: error.message
            })
        }
    }

    /**
     * Update the next poll time for an activation (called after each poll).
     * Also increments pollCount and optionally updates SMS metadata.
     */
    static async updatePollSchedule(
        activationId: string,
        nextPollAtMs: number,
        opts?: { smsCount?: number; lastSmsAt?: number }
    ): Promise<void> {
        try {
            const key = `${REDIS_ORDER_KEY_PREFIX}${activationId}`
            const fields: Record<string, string> = {
                nextPollAt: String(nextPollAtMs)
            }
            if (opts?.smsCount !== undefined) {
                fields.smsCount = String(opts.smsCount)
            }
            if (opts?.lastSmsAt !== undefined) {
                fields.lastSmsAt = String(opts.lastSmsAt)
            }

            const pipeline = redis.pipeline()
            pipeline.hset(key, fields)
            pipeline.hincrby(key, 'pollCount', 1)
            await pipeline.exec()
        } catch (error: any) {
            logger.error(`[ActiveStream] Failed to update poll schedule for #${activationId}`, {
                context: 'ACTIVE_STREAM',
                error: error.message
            })
        }
    }

    /**
     * Retrieve all active orders directly from Redis in-memory (<1ms)
     */
    static async getActiveOrders(): Promise<ActiveOrderData[]> {
        try {
            const activationIds = await redis.smembers(REDIS_ACTIVE_ORDERS_SET)
            if (!activationIds || activationIds.length === 0) return []

            const pipeline = redis.pipeline()
            for (const id of activationIds) {
                pipeline.hgetall(`${REDIS_ORDER_KEY_PREFIX}${id}`)
            }

            const results = await pipeline.exec()
            if (!results) return []

            const activeOrders: ActiveOrderData[] = []
            const staleIds: string[] = []

            results.forEach(([err, data], idx) => {
                const activationId = activationIds[idx]
                if (err || !data || !(data as any).activationId) {
                    staleIds.push(activationId)
                    return
                }
                activeOrders.push({
                    numberId: (data as any).numberId,
                    activationId: (data as any).activationId,
                    userId: (data as any).userId,
                    provider: (data as any).provider,
                    providerId: (data as any).providerId || '',
                    phoneNumber: (data as any).phoneNumber,
                    countryCode: (data as any).countryCode,
                    serviceCode: (data as any).serviceCode,
                    createdAt: Number((data as any).createdAt || Date.now()),
                    nextPollAt: Number((data as any).nextPollAt || 0),
                    smsCount: Number((data as any).smsCount || 0),
                    lastSmsAt: Number((data as any).lastSmsAt || 0),
                    pollCount: Number((data as any).pollCount || 0)
                })
            })

            // Clean up stale IDs if key expired
            if (staleIds.length > 0) {
                await redis.srem(REDIS_ACTIVE_ORDERS_SET, ...staleIds)
            }

            return activeOrders
        } catch (error: any) {
            logger.error('[ActiveStream] Failed to fetch active orders from Redis', {
                context: 'ACTIVE_STREAM',
                error: error.message
            })
            return []
        }
    }

    /**
     * Get only orders that are DUE for polling (nextPollAt <= now).
     * Filters within the 20-minute lifetime window.
     * This is the primary method used by the 3-second active poller tick.
     */
    static async getDueOrders(): Promise<ActiveOrderData[]> {
        const allOrders = await this.getActiveOrders()
        const now = Date.now()

        return allOrders.filter(order => {
            // Must be within lifetime (20 min)
            const ageSeconds = (now - (order.createdAt || now)) / 1000
            if (ageSeconds > 1200) return false

            // Must be due for polling
            const nextPollAt = order.nextPollAt || 0
            return nextPollAt <= now
        })
    }

    /**
     * Check if an activation exists in the active stream.
     * Used by inbox-worker to skip orders already covered by Tier-1.
     */
    static async isActive(activationId: string): Promise<boolean> {
        try {
            return await redis.sismember(REDIS_ACTIVE_ORDERS_SET, activationId) === 1
        } catch {
            return false
        }
    }
}
