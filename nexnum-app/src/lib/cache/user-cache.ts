/**
 * User Cache Layer
 * 
 * High-performance caching for frequently accessed user data.
 * Reduces database load by 90%+ for balance checks.
 */

import { redis, CACHE_KEYS, CACHE_TTL } from '@/lib/core/redis'
import { prisma } from '@/lib/core/db'
import { logger } from '@/lib/core/logger'
import { getCurrencyService, toSupportedCurrency } from '@/lib/payment/currency-service'

// ============================================================================
// User Balance Cache
// ============================================================================

interface CachedBalance {
    balance: string
    displayCurrency: string
    cachedAt: number
}

export interface CachedBalanceResult {
    balance: number
    currency: 'POINTS'
    displayAmount: number
    displayCurrency: string
    fromCache: boolean
}

/**
 * Get user balance with caching (balance in Points; displayAmount in user's preferred currency).
 * Cache-first strategy with 30s TTL. Aligns with wallet/balance and auth/me semantics.
 */
export async function getCachedBalance(userId: string): Promise<CachedBalanceResult> {
    const cacheKey = CACHE_KEYS.userBalance(userId)
    const start = Date.now()
    const currencyService = getCurrencyService()

    const computeDisplay = async (balancePoints: number, preferredCurrency: string) => {
        const displayCurrency = toSupportedCurrency(preferredCurrency)
        const displayAmount = await currencyService.pointsToFiat(balancePoints, displayCurrency)
        return { displayAmount: Math.round(displayAmount * 100) / 100, displayCurrency }
    }

    try {
        const cached = await redis.get(cacheKey)
        if (cached) {
            const data: CachedBalance = JSON.parse(cached)
            const balancePoints = parseFloat(data.balance)
            const { displayAmount, displayCurrency } = await computeDisplay(balancePoints, data.displayCurrency)
            logger.debug(`[Cache] Balance HIT for ${userId.slice(0, 8)}`, { durationMs: Date.now() - start })
            return {
                balance: balancePoints,
                currency: 'POINTS',
                displayAmount,
                displayCurrency,
                fromCache: true
            }
        }
    } catch (error) {
        logger.warn('[Cache] Redis error, falling back to DB', { error })
    }

    const wallet = await prisma.wallet.findUnique({
        where: { userId },
        select: { balance: true }
    })

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { preferredCurrency: true }
    })

    const balancePoints = Number(wallet?.balance ?? 0)
    const preferredCurrency = user?.preferredCurrency || 'USD'
    const { displayAmount, displayCurrency } = await computeDisplay(balancePoints, preferredCurrency)

    try {
        const cacheData: CachedBalance = {
            balance: String(balancePoints),
            displayCurrency: preferredCurrency,
            cachedAt: Date.now()
        }
        await redis.set(cacheKey, JSON.stringify(cacheData), 'EX', CACHE_TTL.USER_BALANCE)
        logger.debug(`[Cache] Balance SET for ${userId.slice(0, 8)}`, { durationMs: Date.now() - start })
    } catch (error) {
        logger.warn('[Cache] Failed to cache balance', { error })
    }

    return {
        balance: balancePoints,
        currency: 'POINTS',
        displayAmount,
        displayCurrency,
        fromCache: false
    }
}

/**
 * Invalidate user balance cache
 * Call this after any balance-changing operation
 */
export async function invalidateBalanceCache(userId: string): Promise<void> {
    const cacheKey = CACHE_KEYS.userBalance(userId)
    try {
        await redis.del(cacheKey)
        logger.debug(`[Cache] Balance INVALIDATED for ${userId.slice(0, 8)}`)
    } catch (error) {
        logger.warn('[Cache] Failed to invalidate balance cache', { error })
    }
}

// ============================================================================
// User Session Cache
// ============================================================================

interface CachedUser {
    id: string
    email: string
    name: string
    role: string
    tokenVersion: number
    cachedAt: number
}

const USER_CACHE_TTL = 300 // 5 minutes

/**
 * Get user by ID with caching
 */
export async function getCachedUser(userId: string): Promise<CachedUser | null> {
    const cacheKey = `cache:user:${userId}`

    try {
        const cached = await redis.get(cacheKey)
        if (cached) {
            return JSON.parse(cached)
        }
    } catch (error) {
        // Fallback to DB on cache error
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            tokenVersion: true
        }
    })

    if (!user) return null

    const cachedUser: CachedUser = {
        ...user,
        cachedAt: Date.now()
    }

    try {
        await redis.set(cacheKey, JSON.stringify(cachedUser), 'EX', USER_CACHE_TTL)
    } catch (error) {
        // Cache write failures are non-fatal
    }

    return cachedUser
}

/**
 * Invalidate user cache
 */
export async function invalidateUserCache(userId: string): Promise<void> {
    try {
        await redis.del(`cache:user:${userId}`)
    } catch (error) {
        // Non-fatal
    }
}
