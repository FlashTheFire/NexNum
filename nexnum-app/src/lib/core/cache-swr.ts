/**
 * Advanced Caching Layer
 * 
 * Stale-While-Revalidate (SWR) pattern for optimal performance
 * - Returns cached data immediately
 * - Revalidates in background when stale
 * - Graceful degradation on cache failures
 */

import { redis } from './redis'
import { logger } from './logger'

interface CacheOptions {
    /** Time-to-live in seconds for fresh data */
    ttl: number
    /** Stale window in seconds (serves stale, triggers background refresh) */
    staleWindow?: number
    /** Cache key prefix for namespacing */
    prefix?: string
}

interface CachedData<T> {
    data: T
    timestamp: number
    ttl: number
}

/**
 * Get data from cache with SWR pattern
 * 
 * @param key Cache key
 * @param fetcher Function to fetch fresh data
 * @param options Cache options
 * @returns Cached or fresh data
 */
export async function getWithSWR<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions
): Promise<T> {
    const { ttl, staleWindow = 60, prefix = 'cache' } = options
    const cacheKey = `${prefix}:${key}`

    try {
        // Try to get from cache
        const cached = await redis.get(cacheKey) as string | null

        if (cached) {
            const { data, timestamp, ttl: cachedTtl } = JSON.parse(cached) as CachedData<T>
            const age = (Date.now() - timestamp) / 1000
            const isStale = age > cachedTtl
            const isTooOld = age > cachedTtl + staleWindow

            if (!isStale) {
                // Fresh data, return immediately
                return data
            }

            if (!isTooOld) {
                // Stale but within window, return stale and refresh in background
                logger.debug(`SWR: Serving stale ${cacheKey}, refreshing in background`, { age })

                // Fire and forget background refresh
                revalidateCache(cacheKey, fetcher, ttl).catch(err => {
                    logger.error('SWR background refresh failed', { key: cacheKey, error: err.message })
                })

                return data
            }

            // Too old, must wait for fresh data
            logger.debug(`SWR: Cache too old for ${cacheKey}, fetching fresh`, { age })
        }

        // No cache or too old, fetch fresh
        return await revalidateCache(cacheKey, fetcher, ttl)

    } catch (error) {
        // Cache read failed, fetch fresh
        logger.warn('Cache read failed, fetching fresh', { key: cacheKey })
        return fetcher()
    }
}

/**
 * Revalidate cache with fresh data
 */
async function revalidateCache<T>(
    cacheKey: string,
    fetcher: () => Promise<T>,
    ttl: number
): Promise<T> {
    const data = await fetcher()

    const cacheData: CachedData<T> = {
        data,
        timestamp: Date.now(),
        ttl,
    }

    await redis.set(cacheKey, JSON.stringify(cacheData), { ex: ttl * 2 })

    return data
}

/**
 * Invalidate cache key(s)
 */
export async function invalidateCache(pattern: string): Promise<void> {
    try {
        // For simple key deletion
        if (!pattern.includes('*')) {
            await redis.del(pattern)
            return
        }

        // For pattern-based deletion (use scan)
        logger.info('Cache pattern invalidation', { pattern })
        // Note: Upstash doesn't support SCAN, so we'd need to track keys separately
        // For now, just log and rely on TTL expiration
    } catch (error) {
        logger.error('Cache invalidation failed', { pattern })
    }
}

/**
 * Pre-built cache configs for common use cases
 */
export const CacheConfigs = {
    /** Service aggregates - 5min fresh, 1min stale window */
    SERVICES: { ttl: 300, staleWindow: 60, prefix: 'svc' },

    /** Country data - 10min fresh, 2min stale window */
    COUNTRIES: { ttl: 600, staleWindow: 120, prefix: 'cty' },

    /** Search results - 1min fresh, 30s stale window */
    SEARCH: { ttl: 60, staleWindow: 30, prefix: 'search' },

    /** Provider prices - 2min fresh, 30s stale window */
    PRICES: { ttl: 120, staleWindow: 30, prefix: 'price' },

    /** User sessions - 1 hour */
    SESSION: { ttl: 3600, staleWindow: 300, prefix: 'sess' },
} as const
