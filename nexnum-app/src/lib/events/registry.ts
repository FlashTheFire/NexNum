import { z } from 'zod';

/**
 * EVENT REGISTRY
 * Only types defined here are allowed to be published.
 */

// 1. SMS Received Event
export const SmsReceivedPayload = z.object({
    activationId: z.string(),
    numberId: z.string(),               // DB number.id — for exact SMS page matching
    phoneNumber: z.string(),
    message: z.string(),
    code: z.string().optional(),        // Extracted OTP — show in toast instantly
    serviceName: z.string().optional(),
    receivedAt: z.string().datetime(),
});

// 2. State Updated Event (Wallet/Numbers/etc)
export const StateUpdatedPayload = z.object({
    stateType: z.enum(['wallet', 'numbers', 'notification', 'all']),
    userId: z.string(),
    reason: z.string().optional(),
});

// 3. User Revoked Event (Security: ban enforcement, session kill-switch)
export const UserRevokedPayload = z.object({
    userId: z.string(),
});

// The Master Registry Map
export const EVENT_REGISTRY = {
    'sms.received': SmsReceivedPayload,
    'state.updated': StateUpdatedPayload,
    'user.revoked': UserRevokedPayload,
} as const;

export type EventType = keyof typeof EVENT_REGISTRY;

// Helper to infer payload type from event name
export type EventPayload<T extends EventType> = z.infer<typeof EVENT_REGISTRY[T]>;
