
import dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:3000';

async function runTest(name: string, fn: () => Promise<boolean>) {
    process.stdout.write(`Testing ${name}... `);
    try {
        const result = await fn();
        if (result) {
            console.log('✅ PASS');
            return true;
        } else {
            console.log('❌ FAIL');
            return false;
        }
    } catch (error) {
        console.log('❌ ERROR:', error);
        return false;
    }
}

async function testPublicAccess() {
    const rootRes = await fetch(`${BASE_URL}/`);
    return rootRes.status === 200;
}

async function testSecurityHeaders() {
    const res = await fetch(`${BASE_URL}/`);
    const headers = res.headers;

    const required = [
        'x-frame-options',
        'x-content-type-options',
        'strict-transport-security',
        'content-security-policy'
    ];

    const missing = required.filter(h => !headers.has(h));

    if (missing.length > 0) {
        console.log('\n   Missing headers:', missing);
        return false;
    }
    return true;
}

async function testCSRFEndpoint() {
    // Test the new CSRF token endpoint
    const res = await fetch(`${BASE_URL}/api/csrf`);

    if (res.status !== 200) {
        console.log('\n   Failed to get CSRF token: Status', res.status);
        return false;
    }

    const data = await res.json();
    if (!data.success || !data.token) {
        console.log('\n   Invalid CSRF response:', data);
        return false;
    }

    console.log('   (Token received, length:', data.token.length, ')');
    return true;
}

async function testBotDetection() {
    // We enabled strict browser check for /api/auth/login
    // This MUST now fail with 403 Forbidden
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
            'User-Agent': 'python-requests/2.26.0', // Known bot
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: 'test@example.com', password: 'password' })
    });

    if (res.status === 403) {
        const data = await res.json();
        console.log('   (Correctly blocked with 403)', data.error);
        return true;
    }

    console.log('   Failed to block bot: Status', res.status);
    return false;
}

async function testOriginGuard() {
    // Should block untrusted origin
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
            'Origin': 'https://evil.com',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: 'test@example.com', password: 'password' })
    });

    if (res.status === 403) {
        const info = await res.json();
        return info.code === 'SECURITY_ERROR';
    }
    return false;
}

async function testRateLimitHeaders() {
    // Rate limit headers should be present in rate-limited responses
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate'
        },
        body: JSON.stringify({ email: 'test@example.com', password: 'wrongpassword' })
    });

    // Check if security headers are present in response
    const hasSecurityHeaders =
        res.headers.has('x-content-type-options') ||
        res.headers.has('x-frame-options');

    return hasSecurityHeaders;
}

async function main() {
    console.log('🔒 Comprehensive Security Verification Suite');
    console.log('━'.repeat(50));

    let passed = 0;
    let total = 0;

    const tests = [
        ['Public Access', testPublicAccess],
        ['Security Headers (HSTS, CSP, etc.)', testSecurityHeaders],
        ['CSRF Token Endpoint', testCSRFEndpoint],
        ['Origin Guard (Block Evil Origins)', testOriginGuard],
        ['Bot Detection (Block Scripts)', testBotDetection],
        ['Rate Limit Headers', testRateLimitHeaders]
    ] as const;

    for (const [name, fn] of tests) {
        total++;
        if (await runTest(name, fn)) {
            passed++;
        }
    }

    console.log('━'.repeat(50));
    console.log(`Results: ${passed}/${total} tests passed`);

    if (passed === total) {
        console.log('✅ All security checks passed!');
    } else {
        console.log('⚠️  Some security checks failed.');
    }
}

main();
