/**
 * Active Order Stream Engine
 * 
 * High-performance, zero-DB in-memory active order set in Redis.
 * Eliminates PostgreSQL read overhead during active status polling cycles.
 */

import { redis } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'

export interface ActiveOrderData {
    numberId: string
    activationId: string
    userId: string
    provider: string
    phoneNumber: string
    countryCode: string
    serviceCode: string
    createdAt: number // epoch ms
}

const REDIS_ACTIVE_ORDERS_SET = 'nexnum:orders:active_set'
const REDIS_ORDER_KEY_PREFIX = 'nexnum:orders:active:'
const ORDER_TTL_SECONDS = 1200 // 20 minutes expiration safety net

export class ActiveOrderStream {
    /**
     * Push a newly purchased number into the zero-DB active Redis stream
     */
    static async addActiveOrder(data: ActiveOrderData): Promise<void> {
        try {
            const key = `${REDIS_ORDER_KEY_PREFIX}${data.activationId}`
            const pipeline = redis.pipeline()
            pipeline.hset(key, {
                numberId: data.numberId,
                activationId: data.activationId,
                userId: data.userId,
                provider: data.provider,
                phoneNumber: data.phoneNumber,
                countryCode: data.countryCode,
                serviceCode: data.serviceCode,
                createdAt: String(data.createdAt || Date.now())
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
                    phoneNumber: (data as any).phoneNumber,
                    countryCode: (data as any).countryCode,
                    serviceCode: (data as any).serviceCode,
                    createdAt: Number((data as any).createdAt || Date.now())
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
}
