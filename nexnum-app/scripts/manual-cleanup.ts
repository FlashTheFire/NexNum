
import * as dotenv from 'dotenv';
import path from 'path';

// 1. Load env vars immediately
dotenv.config({ path: path.join(process.cwd(), '.env') });
console.log('Environment loaded.');

// 2. Import module dynamically AFTER env is set
async function run() {
    console.log('Starting manual icon cleanup...');
    try {
        // Dynamic import to avoid hoisting issues
        const { verifyAssetIntegrity } = await import('../src/lib/providers/provider-sync');

        const result = await verifyAssetIntegrity();
        console.log('Cleanup complete:', result);
    } catch (e) {
        console.error('Cleanup failed:', e);
    }
}

run();
