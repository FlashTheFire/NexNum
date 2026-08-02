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


// NOTE: If you need to emit internal control events (e.g., user.revoked, ban enforcement),
// use EventPublisher.publish() directly with a defined schema entry in EVENT_REGISTRY.
// Do not add another ad-hoc emitControlEvent wrapper without a schema.
