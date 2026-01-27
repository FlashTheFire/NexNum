import { z } from 'zod';

/**
 * EVENT REGISTRY
 * Only types defined here are allowed to be published.
 */

// 1. SMS Received Event
export const SmsReceivedPayload = z.object({
    activationId: z.string(),
    phoneNumber: z.string(),
    message: z.string(),
    serviceName: z.string().optional(),
    receivedAt: z.string().datetime(), // ISO string from Date
});

// 2. State Updated Event (Wallet/Numbers/etc)
export const StateUpdatedPayload = z.object({
    stateType: z.enum(['wallet', 'numbers', 'notification', 'all']),
    userId: z.string(),
    reason: z.string().optional(),
});

// The Master Registry Map
export const EVENT_REGISTRY = {
    'sms.received': SmsReceivedPayload,
    'state.updated': StateUpdatedPayload,
} as const;

export type EventType = keyof typeof EVENT_REGISTRY;

// Helper to infer payload type from event name
export type EventPayload<T extends EventType> = z.infer<typeof EVENT_REGISTRY[T]>;
