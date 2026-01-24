/**
 * Cache Statistics & Monitoring
 * 
 * Tracks cache hit/miss rates and provides insights for optimization.
 */

import { redis } from './redis'

// ============================================
// CACHE STATISTICS
// ============================================

interface CacheStats {
    hits: number
    misses: number
    errors: number
    avgLatencyMs: number
    lastReset: Date
}

// In-memory stats (reset on restart)
const stats: CacheStats = {
    hits: 0,
    misses: 0,
    errors: 0,
    avgLatencyMs: 0,
    lastReset: new Date(),
}

let latencySum = 0
let latencyCount = 0

/**
 * Record a cache hit
 */
export function recordHit(latencyMs: number) {
    stats.hits++
    latencySum += latencyMs
    latencyCount++
    stats.avgLatencyMs = latencySum / latencyCount
}

/**
 * Record a cache miss
 */
export function recordMiss(latencyMs: number) {
    stats.misses++
    latencySum += latencyMs
    latencyCount++
    stats.avgLatencyMs = latencySum / latencyCount
}

/**
 * Record a cache error
 */
export function recordError() {
    stats.errors++
}

/**
 * Get current cache statistics
 */
export function getCacheStats(): CacheStats & { hitRate: number } {
    const total = stats.hits + stats.misses
    const hitRate = total > 0 ? (stats.hits / total) * 100 : 0

    return {
        ...stats,
        hitRate: Math.round(hitRate * 100) / 100, // 2 decimal places
    }
}

/**
 * Reset statistics
 */
export function resetStats() {
    stats.hits = 0
    stats.misses = 0
    stats.errors = 0
    stats.avgLatencyMs = 0
    stats.lastReset = new Date()
    latencySum = 0
    latencyCount = 0
}

// ============================================
// ENHANCED CACHE OPERATIONS
// ============================================

/**
 * Cache get with statistics tracking
 */
export async function cacheGetWithStats<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = 300
): Promise<T> {
    const start = Date.now()

    try {
        const cached = await redis.get(key)
        const latency = Date.now() - start

        if (cached !== null) {
            recordHit(latency)
            try {
                return JSON.parse(cached) as T
            } catch {
                return cached as unknown as T
            }
        }

        recordMiss(latency)

        // Fetch from source
        const value = await fetchFn()

        // Cache the result
        const stringified = typeof value === 'string' ? value : JSON.stringify(value)
        await redis.set(key, stringified, 'EX', ttlSeconds)

        return value
    } catch (error) {
        recordError()
        console.warn('[Cache] Error, fetching directly:', error)
        return fetchFn()
    }
}

// ============================================
// BULK CACHE OPERATIONS
// ============================================

/**
 * Get multiple keys at once (MGET)
 */
export async function cacheGetMultiple<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return []

    try {
        const start = Date.now()
        const values = await redis.mget(...keys)
        const latency = Date.now() - start

        return values.map((v, i) => {
            if (v === null) {
                recordMiss(latency / keys.length)
                return null
            }
            recordHit(latency / keys.length)
            try {
                return JSON.parse(v) as T
            } catch {
                return v as unknown as T
            }
        })
    } catch (error) {
        recordError()
        console.warn('[Cache] Bulk get error:', error)
        return keys.map(() => null)
    }
}

/**
 * Set multiple keys at once (pipeline)
 */
export async function cacheSetMultiple<T>(
    entries: { key: string; value: T; ttl?: number }[]
): Promise<void> {
    if (entries.length === 0) return

    try {
        const pipeline = redis.pipeline()

        for (const { key, value, ttl = 300 } of entries) {
            const stringified = typeof value === 'string' ? value : JSON.stringify(value)
            pipeline.set(key, stringified, 'EX', ttl)
        }

        await pipeline.exec()
    } catch (error) {
        recordError()
        console.warn('[Cache] Bulk set error:', error)
    }
}

/**
 * Delete multiple keys at once
 */
export async function cacheDeleteMultiple(keys: string[]): Promise<number> {
    if (keys.length === 0) return 0

    try {
        return await redis.del(...keys)
    } catch (error) {
        recordError()
        console.warn('[Cache] Bulk delete error:', error)
        return 0
    }
}

// ============================================
// CACHE KEY PATTERNS
// ============================================

/**
 * Find keys matching a pattern (use sparingly)
 */
export async function findKeys(pattern: string, limit: number = 100): Promise<string[]> {
    try {
        const keys: string[] = []
        let cursor = '0'

        do {
            const [newCursor, foundKeys] = await redis.scan(
                cursor,
                'MATCH', pattern,
                'COUNT', Math.min(limit, 100)
            )
            cursor = newCursor
            keys.push(...foundKeys)

            if (keys.length >= limit) break
        } while (cursor !== '0')

        return keys.slice(0, limit)
    } catch (error) {
        console.warn('[Cache] Key scan error:', error)
        return []
    }
}

/**
 * Get cache memory info
 */
export async function getCacheInfo(): Promise<{
    usedMemory: string
    connectedClients: number
    keys: number
}> {
    try {
        const info = await redis.info('memory')
        const clients = await redis.info('clients')
        const dbsize = await redis.dbsize()

        const memMatch = info.match(/used_memory_human:(\S+)/)
        const clientMatch = clients.match(/connected_clients:(\d+)/)

        return {
            usedMemory: memMatch?.[1] || 'unknown',
            connectedClients: parseInt(clientMatch?.[1] || '0'),
            keys: dbsize,
        }
    } catch (error) {
        console.warn('[Cache] Info error:', error)
        return { usedMemory: 'unknown', connectedClients: 0, keys: 0 }
    }
}
