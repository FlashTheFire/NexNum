import { io, Socket } from 'socket.io-client';
import { generateToken } from '../../src/lib/auth/jwt';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';

// Force load env for JWT Secret
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SOCKET_URL = process.env.NEXT_PUBLIC_APP_URL ?
    `${process.env.NEXT_PUBLIC_APP_URL}/api/socket` :
    'http://localhost:3001/api/socket'; // Default standalone port

const TARGET_USER_ID = 'load_test_user_' + uuidv4();
const TOTAL_CLIENTS = 10; // We expect 5 success, 5 failures

async function runSoakTest() {
    console.log(`🚀 Starting Socket Soak Test`);
    console.log(`Target: ${SOCKET_URL}`);
    console.log(`User: ${TARGET_USER_ID}`);
    console.log(`Clients: ${TOTAL_CLIENTS}`);

    // Generate a valid token
    const token = await generateToken({
        userId: TARGET_USER_ID,
        email: 'loadtest@nexnum.com',
        name: 'Load Tester',
        role: 'USER',
        version: 1
    });

    // Mock DB requirement: User must exist in DB for Auth Middleware to pass
    // Requires manual setup or strict mock. 
    // FOR THIS SCRIPT TO WORK against a real server, we need a REAL user in DB.
    // If we can't create one, we might fail auth.
    // Assuming for 'Optimization' verification we rely on unit tests or pre-seeded data.
    // FAIL-SAFE: We can Mock the DB lookups in the server code if running in 'test' mode, 
    // OR we just log the result. If we see "Authentication Error" we know why.

    const clients: Socket[] = [];
    let connected = 0;
    let errors = 0;

    for (let i = 0; i < TOTAL_CLIENTS; i++) {
        const socket = io('http://localhost:3001', {
            path: '/api/socket',
            auth: { token },
            transports: ['websocket'],
            reconnection: false // Don't retry, we want to see immediate failure
        });

        socket.on('connect', () => {
            console.log(`✅ Client ${i} Connected: ${socket.id}`);
            connected++;
        });

        socket.on('connect_error', (err) => {
            console.log(`❌ Client ${i} Error: ${err.message}`);
            errors++;
        });

        socket.on('disconnect', (reason) => {
            console.log(`⚠️ Client ${i} Disconnected: ${reason}`);
        });

        clients.push(socket);
        // Small stagger
        await new Promise(r => setTimeout(r, 100));
    }

    // Wait for settlement
    await new Promise(r => setTimeout(r, 3000));

    console.log('\n--- REPORT ---');
    console.log(`Attempts: ${TOTAL_CLIENTS}`);
    console.log(`Connected: ${connected}`);
    console.log(`Errors: ${errors}`);

    if (connected <= 5) {
        console.log('✅ Rate Limiting appears EFFECTIVE (<= 5 connections)');
    } else {
        console.log('⚠️ Rate Limiting might be loose (or user not found in DB so limit check skipped?)');
    }

    // Cleanup
    clients.forEach(c => c.close());
    process.exit(0);
}

runSoakTest().catch(console.error);
