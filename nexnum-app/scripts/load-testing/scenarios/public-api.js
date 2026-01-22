import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    stages: [
        { duration: '30s', target: 200 }, // Ramp up to 200 users
        { duration: '1m', target: 200 },  // Stay at 200 for 1 minute
        { duration: '30s', target: 0 },   // Ramp down to 0
    ],
    thresholds: {
        http_req_duration: ['p(95)<100'], // 95% of requests should be below 100ms
        http_req_failed: ['rate<0.01'],   // Less than 1% errors
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY; // Must be provided via -e API_KEY=...

export default function () {
    const params = {
        headers: {
            'x-api-key': API_KEY,
            'Content-Type': 'application/json',
        },
    };

    const responses = http.batch([
        ['GET', `${BASE_URL}/api/v1/numbers`, null, params],
        ['GET', `${BASE_URL}/api/v1/balance`, null, params],
        ['GET', `${BASE_URL}/api/v1/sms`, null, params],
    ]);

    check(responses[0], {
        'numbers status is 200': (r) => r.status === 200,
    });

    check(responses[1], {
        'balance status is 200': (r) => r.status === 200,
    });

    check(responses[2], {
        'sms status is 200': (r) => r.status === 200,
    });

    sleep(1);
}
