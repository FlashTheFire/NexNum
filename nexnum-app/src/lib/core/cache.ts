/**
 * Redis Caching Layer for Inventory Data
 * Provides stale-while-revalidate pattern for countries, services, and pricing
 */
import { redis } from '@/lib/core/redis'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'

// Cache key prefixes
const CACHE_KEYS = {
    COUNTRIES: 'cache:countries',
    SERVICES: 'cache:services',
    PRICING: 'cache:pricing',
    PROVIDERS: 'cache:providers:active',
} as const

// Cache TTL in seconds
const CACHE_TTL = {
    PROVIDERS: 60 * 5,  // 5 minutes
} as const

type CacheResult<T> = {
    data: T
    fromCache: boolean
    stale?: boolean
}

/**
 * Get or set cache with stale-while-revalidate pattern
 */
async function getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number
): Promise<CacheResult<T>> {
    try {
        // Try to get from cache
        const cached = await redis.get(key)

        if (cached) {
            // Check if we should background refresh (at 80% of TTL)
            const ttlRemaining = await redis.ttl(key)
            const stale = ttlRemaining < (ttl * 0.2)

            if (stale) {
                // Background refresh - don't await
                refreshCache(key, fetchFn, ttl).catch(err =>
                    logger.error('Background cache refresh failed', { key, error: err.message })
                )
            }

            return {
                data: JSON.parse(cached as string),
                fromCache: true,
                stale
            }
        }

        // Cache miss - fetch fresh data
        const data = await fetchFn()
        await redis.set(key, JSON.stringify(data), 'EX', ttl)

        return { data, fromCache: false }
    } catch (error) {
        // On cache error, fallback to direct fetch
        logger.warn('Cache error, fetching directly', { key, error })
        const data = await fetchFn()
        return { data, fromCache: false }
    }
}

/**
 * Background cache refresh
 */
async function refreshCache<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number
): Promise<void> {
    const data = await fetchFn()
    await redis.set(key, JSON.stringify(data), 'EX', ttl)
    logger.debug('Cache refreshed', { key })
}

/**
 * Get active providers
 */
export async function getCachedActiveProviders(): Promise<CacheResult<any[]>> {
    return getOrSet(CACHE_KEYS.PROVIDERS, async () => {
        return prisma.provider.findMany({
            where: { isActive: true },
            orderBy: { priority: 'desc' },
            select: {
                id: true,
                name: true,
                displayName: true,
                priority: true,
                priceMultiplier: true,
                fixedMarkup: true,
            }
        })
    }, CACHE_TTL.PROVIDERS)
}

/**
 * Invalidate cache keys (call after sync or update)
 */
export async function invalidateCache(type: 'providers' | 'all') {
    const patterns: string[] = []

    if (type === 'providers' || type === 'all') {
        patterns.push(`${CACHE_KEYS.PROVIDERS}*`)
    }

    for (const pattern of patterns) {
        try {
            // Get matching keys and delete
            const keys = await redis.keys(pattern)
            if (keys.length > 0) {
                await redis.del(...keys)
                logger.info('Cache invalidated', { pattern, count: keys.length })
            }
        } catch (error) {
            logger.error('Cache invalidation failed', { pattern, error })
        }
    }
}

/**
 * Get cache stats for monitoring
 */
export async function getCacheStats() {
    const keys = await redis.keys('cache:*')
    const stats: Record<string, number> = {}

    for (const prefix of Object.values(CACHE_KEYS)) {
        stats[prefix] = keys.filter(k => k.startsWith(prefix)).length
    }

    return {
        totalKeys: keys.length,
        byType: stats,
    }
}
