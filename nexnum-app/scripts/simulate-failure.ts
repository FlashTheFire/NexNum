
import { spawn, ChildProcess } from 'child_process';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const API_KEY = process.env.API_KEY || 'nxn_test_aJoYDH2Kp3-6GD1hECPLBew2pifl0ymt';

async function startServer(port: number, envOverrides: Record<string, string>): Promise<ChildProcess> {
    console.log(`   Starting server on port ${port} with overrides:`, JSON.stringify(envOverrides));

    // Use 'npm run dev' but we need to pass the PORT. Next.js usually takes PORT env var.
    // On Windows, checking if we need shell: true.
    const cp = spawn('npm', ['run', 'dev', '--', '-p', port.toString()], {
        shell: true,
        env: {
            ...process.env,
            ...envOverrides,
            PORT: port.toString(),
            // Ensure we don't pick up local .env defaults if we want to override them, 
            // but dotenv usually loads .env. We rely on env vars taking precedence over .env file 
            // (depending on how the app loads dotenv, but process.env usually wins).
        },
        cwd: process.cwd(),
        stdio: 'pipe' // Capture output to detect readiness
    });

    return new Promise((resolve, reject) => {
        let started = false;

        const onData = (data: Buffer) => {
            const line = data.toString();
            console.log(`[${port}]`, line); // LOGGING ENABLED
            if (line.includes('Ready in') || line.includes('started server on') || line.includes('http://localhost:' + port)) {
                if (!started) {
                    started = true;
                    // Give it a little sec to be truly ready
                    setTimeout(() => resolve(cp), 2000);
                }
            }
        };

        cp.stdout?.on('data', onData);
        cp.stderr?.on('data', onData);

        cp.on('error', (err) => reject(err));

        // Timeout
        setTimeout(() => {
            if (!started) {
                // Determine if it crashed
                if (cp.exitCode !== null) {
                    reject(new Error(`Server exited with code ${cp.exitCode}`));
                } else {
                    // Force resolve anyway to try requesting (or reject)
                    // reject(new Error('Timeout waiting for server to start'));
                    // Is it possible output is buffered? Let's just resolve and try fetch.
                    console.log('   (Timeout waiting for log pattern, trying to proceed...)');
                    resolve(cp);
                }
            }
        }, 30000); // 30s timeout
    });
}

function stopServer(cp: ChildProcess) {
    // Windows might need tree kill, but let's try standard kill
    cp.kill();
    // On Windows, spawning a shell means we might only kill the shell.
    // Ideally we use 'tree-kill' package, but we might not have it.
    // We'll trust the OS cleanup or standard kill for now.
}

async function runTest(name: string, port: number, env: Record<string, string>, checkFn: (baseUrl: string) => Promise<boolean>) {
    console.log(`\n🧪 Testing: ${name}`);
    let server: ChildProcess | null = null;
    try {
        server = await startServer(port, env);
        const baseUrl = `http://localhost:${port}`;
        const passed = await checkFn(baseUrl);
        if (passed) {
            console.log(`✅ PASS: ${name}`);
        } else {
            console.log(`❌ FAIL: ${name}`);
        }
    } catch (e) {
        console.error(`❌ ERROR: ${name}`, e);
    } finally {
        if (server) {
            console.log(`   Stopping server on ${port}...`);
            stopServer(server);
        }
    }
}

async function main() {
    console.log('💥 System Failure Simulation Suite');
    console.log('━'.repeat(50));

    // 1. Redis Failure
    await runTest('Redis Outage Resilience', 3002, {
        REDIS_URL: 'redis://nonexistent:6379',
        // We need DB to be valid to test "Fall back to DB"
    }, async (baseUrl) => {
        // Try to fetch a protected resource
        // If Redis is down, rate limiting might fail-open or logic might skip cache and hit DB.
        // We expect success (200) not failure, because system should be resilient.
        try {
            const res = await fetch(`${baseUrl}/api/v1/numbers`, {
                headers: { 'x-api-key': API_KEY }
            });
            console.log(`   Status: ${res.status}`);
            return res.status === 200;
        } catch (e) {
            console.log('   Fetch error:', e);
            return false;
        }
    });

    // 2. Database Failure
    await runTest('Database Outage Handling', 3003, {
        DATABASE_URL: 'postgresql://bad:pass@localhost:5432/bad_db'
    }, async (baseUrl) => {
        // Try to fetch balance (needs DB)
        // Expect 503 or 500 (but definitely not connection refused)
        try {
            const res = await fetch(`${baseUrl}/api/v1/balance`, {
                headers: { 'x-api-key': API_KEY }
            });
            console.log(`   Status: ${res.status}`);
            // We accept 503 (Service Unavailable) or 500 (Internal Server Error) 
            // as long as it handles it without crashing the process hard (fetch error)
            return res.status === 503 || res.status === 500;
        } catch (e) {
            console.log('   Fetch error:', e);
            return false;
        }
    });

    // Explicitly exit because child processes might leave handles open
    process.exit(0);
}

main();
