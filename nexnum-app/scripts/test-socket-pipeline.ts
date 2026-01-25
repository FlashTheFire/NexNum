import { redis } from '../src/lib/core/redis';

async function testPipeline() {
    console.log('Testing Redis Pub/Sub Pipeline...');

    // 1. Check Subscriber Count
    const channel = 'events:global';
    const subscribers = await redis.pubsub('NUMSUB', channel);
    // Response format: ['channelName', count, 'channelName2', count2]
    const count = subscribers[1];

    console.log(`Subscribers to '${channel}': ${count}`);

    if (count === 0) {
        console.warn('⚠️ No active subscribers found! Is the socket server running? (npm run socket)');
    } else {
        console.log('✅ Socket Server appears to be listening.');
    }

    // 2. Publish Test Message
    const message = JSON.stringify({
        v: 1,
        eventId: 'test-id-' + Date.now(),
        ts: Date.now(),
        type: 'state.updated',
        room: 'user:test-user',
        payload: {
            stateType: 'all',
            userId: 'test-user',
            reason: 'manual-test'
        }
    });

    await redis.publish(channel, message);
    console.log('Sent test message to channel.');

    process.exit(0);
}

testPipeline().catch(console.error);
