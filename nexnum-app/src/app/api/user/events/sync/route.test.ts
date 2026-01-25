import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';
import { redis } from '@/lib/core/redis';
import { getCurrentUser } from '@/lib/auth/jwt';

// Mocks
vi.mock('@/lib/core/redis', () => ({
    redis: {
        xrange: vi.fn(),
    }
}));

vi.mock('@/lib/auth/jwt', () => ({
    getCurrentUser: vi.fn(),
}));

describe('Sync API', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return events from Redis Stream', async () => {
        // 1. Mock Auth
        vi.mocked(getCurrentUser).mockResolvedValue({ userId: 'user_123' } as any);

        // 2. Mock Redis Stream Data
        // XRANGE returns array of [id, [field, value, ...]]
        // Note: ioredis usually returns [id, [field, value]] or similar depending on version.
        // But our code expects array where fields[0] is key and fields[1] is value.
        const mockEnvelope = JSON.stringify({
            v: 1, eventId: 'evt_1', type: 'test', room: 'user:user_123', payload: {}, ts: 1000
        });

        vi.mocked(redis.xrange).mockResolvedValue([
            ['1000-0', ['envelope', mockEnvelope]]
        ] as any);

        // 3. Call API
        const req = new NextRequest('http://localhost/api/user/events/sync?since=0');
        const res = await GET(req);

        expect(res.status).toBe(200);
        const body = await res.json();

        expect(body.events).toHaveLength(1);
        expect(body.events[0].eventId).toBe('evt_1');

        // check redis call
        expect(redis.xrange).toHaveBeenCalledWith(
            'events:stream:user:user_123',
            '0',
            '+'
        );
    });

    it('should result 401 if not authenticated', async () => {
        vi.mocked(getCurrentUser).mockResolvedValue(null);
        const req = new NextRequest('http://localhost/api/user/events/sync');
        const res = await GET(req);
        expect(res.status).toBe(401);
    });
});
