import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/jwt';
import { redis } from '@/lib/core/redis';
import { logger } from '@/lib/core/logger';
import { EventEnvelope } from '@/lib/events/schema';

// GET /api/user/events/sync?since=<id_or_ts>
export async function GET(req: NextRequest) {
    try {
        // 1. Auth Check
        const user = await getCurrentUser(req.headers);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const since = searchParams.get('since') || '-'; // '-' means from beginning/available

        // 2. Read from Redis Stream
        const streamKey = `events:stream:user:${user.userId}`;

        // Validate 'since' format. Redis IDs are "timestamp-sequence" (e.g., 1700000000000-0)
        // UUIDs (containing letters) are invalid and will cause "ERR Invalid stream ID"
        const isValidRedisId = /^\d+-\d+$/.test(since) || since === '-' || since === '+';
        const effectiveSince = isValidRedisId ? since : '-';

        // XRANGE key start end (COUNT optional)
        const streamData = await redis.xrange(streamKey, effectiveSince, '+');

        // 3. Transform to Envelopes
        const events: EventEnvelope[] = streamData.map(([id, fields]) => {
            // Fields is array like ['envelope', '{"v":1...}']
            // We need to parse the JSON string in the 'envelope' field
            if (fields[0] === 'envelope') {
                try {
                    return JSON.parse(fields[1]);
                } catch {
                    return null;
                }
            }
            return null;
        }).filter(Boolean); // Remote nulls

        return NextResponse.json({ events });

    } catch (error) {
        logger.error('[SyncAPI] Failed to sync events', { error });
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
