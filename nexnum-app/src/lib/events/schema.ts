import { z } from 'zod';

/**
 * The standard Event Envelope for all system messages.
 * Version 1.0
 */
export const EventEnvelopeSchema = z.object({
    /** Schema Version (Always 1 for now) */
    v: z.literal(1),

    /** Globally unique ID for deduplication (UUID v4) */
    eventId: z.string().uuid(),

    /** Timestamp of event creation (Epoch ms) */
    ts: z.number().int().positive(),

    /** Namespaced event type (e.g. 'sms.received') */
    type: z.string(),

    /** 
     * Destination Room (e.g. 'user:123', 'order:abc') 
     * MUST be authorized server-side.
     */
    room: z.string(),

    /** 
     * Event-specific payload. 
     * Validation of this object happens via the Registry.
     */
    payload: z.record(z.string(), z.unknown()), // Generic wrapper, specific validation happens later

    /** Optional monotonic sequence for ordering */
    seq: z.number().int().optional(),

    /** Metadata for tracing/correlation */
    meta: z.object({
        correlationId: z.string().optional(),
        source: z.string().optional(),
    }).optional(),
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
