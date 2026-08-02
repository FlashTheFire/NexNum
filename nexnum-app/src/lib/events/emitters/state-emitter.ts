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
 * Emit an internal control event to the Socket Server cluster.
 * Currently supports: 'user.revoked' for ban enforcement and session kill-switch.
 * Add new types to EVENT_REGISTRY before using here.
 */
export async function emitControlEvent(type: 'user.revoked', payload: { userId: string }): Promise<void> {
    try {
        await EventPublisher.publish(type, 'system', payload, { source: 'control-emitter' })
    } catch (error: any) {
        logger.error('[ControlEmitter] Failed to emit control event', { type, error: error.message })
    }
}
