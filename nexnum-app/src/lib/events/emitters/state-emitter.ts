/**
 * State Event Emitter
 * 
 * Emits real-time state updates via Redis pub/sub for WebSocket delivery.
 * Used after mutations to notify clients of state changes.
 */
import { cacheInvalidate, CACHE_KEYS } from '@/lib/core/redis'
import { logger } from '@/lib/core/logger'
import { EventPublisher } from '../publisher'

type StateUpdateType = 'wallet' | 'numbers' | 'notification' | 'all'

/**
 * Emit a state update event to a user's WebSocket connection
 * and invalidate their dashboard cache.
 */
export async function emitStateUpdate(
    userId: string,
    type: StateUpdateType = 'all',
    reason?: string
): Promise<void> {
    try {
        // 1. Invalidate Redis cache first
        await cacheInvalidate(CACHE_KEYS.dashboardState(userId))

        if (type === 'wallet' || type === 'all') {
            await cacheInvalidate(CACHE_KEYS.userBalance(userId))
        }

        // 2. Publish Standardized Event via Publisher
        await EventPublisher.publish('state.updated', `user:${userId}`, {
            stateType: type,
            userId,
            reason
        }, { source: 'state-emitter' })

    } catch (error: any) {
        // Non-blocking - log and continue to minimize impact on transaction flow
        logger.error('[StateEmitter] Failed to emit state update', {
            userId,
            type,
            error: error.message
        })
    }
}

/**
 * Helper: Invalidate dashboard cache without emitting WebSocket event
 * Use when WebSocket is not needed (e.g., background jobs)
 */
export async function invalidateDashboardCache(userId: string): Promise<void> {
    try {
        await cacheInvalidate(CACHE_KEYS.dashboardState(userId))
        await cacheInvalidate(CACHE_KEYS.userBalance(userId))
    } catch (error: any) {
        logger.error('[StateEmitter] Cache invalidation failed', { userId, error: error.message })
    }
}

/**
 * Emit an internal control event for the Socket Server cluster.
 * Used for revocation, kill-switches, and global system notifications.
 */
// TODO: Implement 'control.event' in Registry if strictly needed. 
// For now, this is internal/admin usage so we keep manual pub or define a ControlEvent schema.
export async function emitControlEvent(type: string, payload: any): Promise<void> {
    // Placeholder for strict implementation. 
    // Current manual publishing is risky. Should define Schema later if widely used.
    logger.warn('[StateEmitter] emitControlEvent is deprecated. Define schema before use.', { type })
}
