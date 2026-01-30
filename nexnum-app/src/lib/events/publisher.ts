import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../core/logger';
import { redis } from '../core/redis'; // Shared Redis instance
import { EVENT_REGISTRY, EventType, EventPayload } from './registry';
import { EventEnvelopeSchema } from './schema';

/**
 * EventPublisher responsible for strictly validating and publishing events.
 */
export class EventPublisher {
    private static CHANNEL = 'events:global'; // Single channel for now, can shard later

    /**
     * Validates payload against Registry and publishes to Redis.
     * @throws Error if validation fails (Protecting the Schema)
     */
    static async publish<T extends EventType>(
        type: T,
        room: string,
        payload: EventPayload<T>,
        meta?: { correlationId?: string; source?: string }
    ): Promise<void> {
        try {
            // 1. Registry Lookup & Payload Validation
            const payloadSchema = EVENT_REGISTRY[type];

            if (!payloadSchema) {
                throw new Error(`Unknown event type: ${type}`);
            }

            // Strict validation of the business data
            const validatedPayload = payloadSchema.parse(payload);

            // 2. Envelope Construction
            const eventId = uuidv4();
            const ts = Date.now();

            const envelope = {
                v: 1 as const,
                eventId,
                ts,
                type,
                room,
                payload: validatedPayload,
                meta
            };

            // 3. Envelope Validation (Double check structure)
            // This ensures we never drift from the specific wire format
            const finalWireData = EventEnvelopeSchema.parse(envelope);

            // 4. Trace Log
            logger.info(`[Event] Publishing ${type}`, {
                eventId,
                room,
                payloadSize: JSON.stringify(validatedPayload).length
            });

            // 5. Fire and Forget to Redis

            // A. Pub/Sub (Real-time)
            const wireDataStr = JSON.stringify(finalWireData);
            const pubPromise = redis.publish(this.CHANNEL, wireDataStr);

            // B. Redis Stream (Persistence for Reconnects)
            let streamPromise = Promise.resolve<any>(null);

            // Only persist events for User rooms (e.g., "user:123")
            if (room.startsWith('user:')) {
                const userId = room.split(':')[1];
                const streamKey = `events:stream:user:${userId}`;

                // XADD key MAXLEN ~ 100 * envelope (as JSON)
                streamPromise = redis.xadd(
                    streamKey,
                    'MAXLEN', '~', '100',
                    '*',
                    'envelope', wireDataStr
                );
            }

            await Promise.all([pubPromise, streamPromise]);

        } catch (error) {
            logger.error(`[Event] Failed to publish ${type}`, { error });
            throw error; // Propagate error to worker so it knows publishing failed
        }
    }
}
