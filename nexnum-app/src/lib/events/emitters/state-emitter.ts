/**
 * State Event Emitter
 * 
 * Emits real-time state updates via Redis pub/sub for WebSocket delivery.
 * Used after mutations to notify clients of state changes.
 */
import { redis, cacheInvalidate, CACHE_KEYS } from '@/lib/core/redis'
import { randomUUID } from 'crypto'

type StateUpdateType = 'wallet' | 'numbers' | 'notification' | 'all'

interface StateUpdateEvent {
    type: StateUpdateType
    userId: string
    timestamp: number
    reason?: string
}

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

        // 2. Emit WebSocket event via Redis pub/sub
        // Must match EventEnvelopeSchema format for socket server validation
        const message = JSON.stringify({
            v: 1, // Schema version (required)
            eventId: randomUUID(),
            ts: Date.now(), // Timestamp (required)
            type: 'state.updated', // Event type (was incorrectly named 'eventType')
            room: `user:${userId}`,
            payload: {
                stateType: type,
                userId,
                reason
            }
        })

        await redis.publish('events:global', message)
    } catch (error) {
        // Non-blocking - log and continue
        console.error('[StateEmitter] Failed to emit state update:', error)
    }
}

/**
 * Helper: Invalidate dashboard cache without emitting WebSocket event
 * Use when WebSocket is not needed (e.g., background jobs)
 */
export async function invalidateDashboardCache(userId: string): Promise<void> {
    await cacheInvalidate(CACHE_KEYS.dashboardState(userId))
    await cacheInvalidate(CACHE_KEYS.userBalance(userId))
}
