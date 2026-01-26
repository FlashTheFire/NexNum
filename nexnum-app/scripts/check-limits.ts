
import * as dotenv from 'dotenv';
import path from 'path';

// Load env
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { redis } from '../src/lib/core/redis';

// Hardcoded logical user ID if known, or just check keys
async function run() {
    try {
        console.log('Checking Daily Spend Keys...');
        const keys = await redis.keys('spend:daily:*');
        console.log(`Found ${keys.length} spend keys.`);

        for (const key of keys) {
            const val = await redis.get(key);
            console.log(`${key}: $${val}`);
        }

        console.log('Done.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
