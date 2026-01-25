import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventPublisher } from './publisher';
import { redis } from '../core/redis';
import { EventEnvelopeSchema } from './schema';

// Mock Redis
vi.mock('../core/redis', () => ({
    redis: {
        publish: vi.fn(),
        xadd: vi.fn(),
    },
}));

describe('EventPublisher', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should successfully publish a valid sms.received event', async () => {
        const payload = {
            activationId: 'act_123',
            phoneNumber: '+1234567890',
            message: 'Your code is 1234',
            serviceName: 'whatsapp',
            receivedAt: new Date().toISOString()
        };

        await EventPublisher.publish('sms.received', 'user:ABC', payload);

        expect(redis.publish).toHaveBeenCalledTimes(1);
        const [channel, message] = vi.mocked(redis.publish).mock.calls[0];

        expect(channel).toBe('events:global');

        // Verify Stream Persistence (Dual Publish)
        expect(redis.xadd).toHaveBeenCalledTimes(1);
        const [streamKey, maxLenCmd, approx, limit, id, field, val] = vi.mocked(redis.xadd).mock.calls[0];
        expect(streamKey).toBe('events:stream:user:ABC');
        expect(maxLenCmd).toBe('MAXLEN');
        expect(limit).toBe('100');
        expect(field).toBe('envelope');

        // Verify wire format
        const wireData = JSON.parse(message as string);
        const parsed = EventEnvelopeSchema.safeParse(wireData);

        if (!parsed.success) {
            console.error('Schema Parse Error:', parsed.error);
        }
        expect(parsed.success).toBe(true);
    });

    it('should throw error for invalid payload schema', async () => {
        const invalidPayload = {
            activationId: 'act_123',
            // Missing phoneNumber
            message: 'Your code is 1234',
            receivedAt: new Date().toISOString()
        };

        // @ts-expect-error Testing invalid input
        await expect(EventPublisher.publish('sms.received', 'user:ABC', invalidPayload))
            .rejects
            .toThrow(); // Zod error expected

        expect(redis.publish).not.toHaveBeenCalled();
    });

    it('should throw error for unknown event type', async () => {
        // @ts-expect-error Testing unknown type
        await expect(EventPublisher.publish('unknown.event', 'user:ABC', {}))
            .rejects
            .toThrow('Unknown event type');

        expect(redis.publish).not.toHaveBeenCalled();
    });
});
