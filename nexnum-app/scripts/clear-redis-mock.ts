
import * as dotenv from 'dotenv';
dotenv.config();
import { redis } from '../src/lib/core/redis'

async function main() {
    try {
        console.log('Connecting to Redis...');
        // Mock-sms keys
        const keys = await redis.keys('*mock-sms*')
        console.log(`Found ${keys.length} keys for mock-sms`);

        if (keys.length > 0) {
            await redis.del(...keys)
            console.log('Successfully deleted keys');
        }
    } catch (e) {
        console.error('Error clearing cache:', e)
    } finally {
        process.exit(0)
    }
}

main()
