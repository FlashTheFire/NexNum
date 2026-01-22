/**
 * Lookup Cache Layer
 * 
 * Caches static/semi-static data like services and countries.
 * Long TTL (1 hour) since this data rarely changes.
 */

import { redis, CACHE_KEYS, CACHE_TTL } from '@/lib/core/redis'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'

// ============================================================================
// Types
// ============================================================================

export interface ServiceInfo {
    code: string
    name: string
    iconUrl?: string | null
}

export interface CountryInfo {
    code: string
    name: string
    flagUrl?: string | null
}

// ============================================================================
// Service Lookup Cache
// ============================================================================

/**
 * Get all services with caching
 */
export async function getCachedServices(): Promise<ServiceInfo[]> {
    const cacheKey = 'cache:services:all'

    try {
        const cached = await redis.get(cacheKey)
        if (cached) {
            logger.debug('[Cache] Services HIT')
            return JSON.parse(cached)
        }
    } catch (error) {
        logger.warn('[Cache] Redis error for services', { error })
    }

    // Fetch from DB
    const services = await prisma.serviceLookup.findMany({
        select: {
            code: true,
            name: true,
            iconUrl: true
        },
        orderBy: { name: 'asc' }
    })

    // Cache result
    try {
        await redis.set(cacheKey, JSON.stringify(services), 'EX', CACHE_TTL.SERVICES)
        logger.debug('[Cache] Services SET', { count: services.length })
    } catch (error) {
        logger.warn('[Cache] Failed to cache services', { error })
    }

    return services
}

/**
 * Get service by code with caching
 */
export async function getCachedService(code: string): Promise<ServiceInfo | null> {
    const cacheKey = `cache:service:${code}`

    try {
        const cached = await redis.get(cacheKey)
        if (cached) {
            return JSON.parse(cached)
        }
    } catch (error) {
        // Fallback to DB
    }

    const service = await prisma.serviceLookup.findUnique({
        where: { code },
        select: {
            code: true,
            name: true,
            iconUrl: true
        }
    })

    if (service) {
        try {
            await redis.set(cacheKey, JSON.stringify(service), 'EX', CACHE_TTL.SERVICES)
        } catch (error) {
            // Non-fatal
        }
    }

    return service
}

// ============================================================================
// Country Lookup Cache
// ============================================================================

/**
 * Get all countries with caching
 */
export async function getCachedCountries(): Promise<CountryInfo[]> {
    const cacheKey = 'cache:countries:all'

    try {
        const cached = await redis.get(cacheKey)
        if (cached) {
            logger.debug('[Cache] Countries HIT')
            return JSON.parse(cached)
        }
    } catch (error) {
        logger.warn('[Cache] Redis error for countries', { error })
    }

    // Fetch from DB
    const countries = await prisma.countryLookup.findMany({
        select: {
            code: true,
            name: true,
            flagUrl: true
        },
        orderBy: { name: 'asc' }
    })

    // Cache result
    try {
        await redis.set(cacheKey, JSON.stringify(countries), 'EX', CACHE_TTL.COUNTRIES)
        logger.debug('[Cache] Countries SET', { count: countries.length })
    } catch (error) {
        logger.warn('[Cache] Failed to cache countries', { error })
    }

    return countries
}

/**
 * Get country by code with caching
 */
export async function getCachedCountry(code: string): Promise<CountryInfo | null> {
    const cacheKey = `cache:country:${code}`

    try {
        const cached = await redis.get(cacheKey)
        if (cached) {
            return JSON.parse(cached)
        }
    } catch (error) {
        // Fallback to DB
    }

    const country = await prisma.countryLookup.findUnique({
        where: { code },
        select: {
            code: true,
            name: true,
            flagUrl: true
        }
    })

    if (country) {
        try {
            await redis.set(cacheKey, JSON.stringify(country), 'EX', CACHE_TTL.COUNTRIES)
        } catch (error) {
            // Non-fatal
        }
    }

    return country
}

// ============================================================================
// Cache Invalidation
// ============================================================================

/**
 * Invalidate all lookup caches
 * Call after admin updates to services/countries
 */
export async function invalidateLookupCaches(): Promise<void> {
    try {
        const keys = await redis.keys('cache:service*')
        const countryKeys = await redis.keys('cache:country*')
        const allKeys = [...keys, ...countryKeys, 'cache:services:all', 'cache:countries:all']

        if (allKeys.length > 0) {
            await redis.del(...allKeys)
            logger.info('[Cache] Lookup caches INVALIDATED', { count: allKeys.length })
        }
    } catch (error) {
        logger.warn('[Cache] Failed to invalidate lookup caches', { error })
    }
}
