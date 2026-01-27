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
            serviceCode: true,
            serviceName: true,
            serviceIcon: true
        },
        orderBy: { serviceName: 'asc' }
    })

    // Cache result
    try {
        const mapped = services.map(s => ({
            code: s.serviceCode,
            name: s.serviceName,
            iconUrl: s.serviceIcon
        }));
        await redis.set(cacheKey, JSON.stringify(mapped), 'EX', CACHE_TTL.SERVICES)
        logger.debug('[Cache] Services SET', { count: mapped.length })
        return mapped;
    } catch (error) {
        logger.warn('[Cache] Failed to cache services', { error })
        return services.map(s => ({
            code: s.serviceCode,
            name: s.serviceName,
            iconUrl: s.serviceIcon
        }));
    }
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
        where: { serviceCode: code },
        select: {
            serviceCode: true,
            serviceName: true,
            serviceIcon: true
        }
    })

    if (service) {
        const mapped = {
            code: service.serviceCode,
            name: service.serviceName,
            iconUrl: service.serviceIcon
        };
        try {
            await redis.set(cacheKey, JSON.stringify(mapped), 'EX', CACHE_TTL.SERVICES)
        } catch (error) {
            // Non-fatal
        }
        return mapped;
    }

    return null
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
            countryCode: true,
            countryName: true,
            countryIcon: true
        },
        orderBy: { countryName: 'asc' }
    })

    // Cache result
    try {
        const mapped = countries.map(c => ({
            code: c.countryCode,
            name: c.countryName,
            flagUrl: c.countryIcon
        }));
        await redis.set(cacheKey, JSON.stringify(mapped), 'EX', CACHE_TTL.COUNTRIES)
        logger.debug('[Cache] Countries SET', { count: mapped.length })
        return mapped;
    } catch (error) {
        logger.warn('[Cache] Failed to cache countries', { error })
        return countries.map(c => ({
            code: c.countryCode,
            name: c.countryName,
            flagUrl: c.countryIcon
        }));
    }
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
        where: { countryCode: code },
        select: {
            countryCode: true,
            countryName: true,
            countryIcon: true
        }
    })

    if (country) {
        const mapped = {
            code: country.countryCode,
            name: country.countryName,
            flagUrl: country.countryIcon
        };
        try {
            await redis.set(cacheKey, JSON.stringify(mapped), 'EX', CACHE_TTL.COUNTRIES)
        } catch (error) {
            // Non-fatal
        }
        return mapped;
    }

    return null
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
