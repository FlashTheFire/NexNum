
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '30s', target: 200 }, // Ramp to 200 users
        { duration: '1m', target: 200 },  // Stay at 200 (approx 1000 RPS if each does 5 req/s)
        { duration: '30s', target: 0 },   // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<100'], // 95% of requests must complete below 100ms
        http_req_failed: ['rate<0.01'],   // http errors should be less than 1%
    },
};

export default function () {
    const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
    const API_KEY = __ENV.API_KEY || 'test_api_key';

    const params = {
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
        },
    };

    // 1. Get Numbers (High traffic, Cached)
    const resNumbers = http.get(`${BASE_URL}/api/v1/numbers?country=us&service=wa`, params);
    check(resNumbers, { 'status is 200': (r) => r.status === 200 });

    // 2. Get Balance (DB Read)
    const resBalance = http.get(`${BASE_URL}/api/v1/balance`, params);
    check(resBalance, { 'status is 200': (r) => r.status === 200 });

    // 3. Get SMS (DB Read)
    const resSms = http.get(`${BASE_URL}/api/v1/sms`, params);
    check(resSms, { 'status is 200': (r) => r.status === 200 });

    sleep(1);
}
