import { cacheInvalidate, CACHE_KEYS } from '@/lib/core/redis'

/**
 * Helper to invalidate dashboard cache (call from mutation endpoints)
 */
export async function invalidateDashboardCache(userId: string): Promise<void> {
    await cacheInvalidate(CACHE_KEYS.dashboardState(userId))
    await cacheInvalidate(CACHE_KEYS.userBalance(userId))
}
