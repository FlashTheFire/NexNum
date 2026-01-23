# Load Testing with k6

This directory contains load testing scripts to verify the performance and reliability of the NexNum API.

## Prerequisites

- [Docker](https://www.docker.com/) (Recommended)
- OR [k6](https://k6.io/docs/get-started/installation) installed locally

## Running Tests via Docker (Recommended)

Run the following command from the project root:

```bash
npm run test:load
```

This will:
1.  Run the `public-api.js` scenario.
2.  Target your local server at `http://host.docker.internal:3000` (works for Docker for Desktop).
3.  Inject the `API_KEY` from your local environment (ensure you have one).

## Running Tests Locally (if k6 installed)

```bash
k6 run -e BASE_URL=http://localhost:3000 -e API_KEY=your_api_key scripts/load-testing/scenarios/public-api.js
```

## Scenarios

### `public-api.js`
- **Goal**: Verify 1000 RPS with <100ms p95 latency.
- **Endpoints**:
    - `GET /api/v1/numbers`: Listing available numbers (Cached)
    - `GET /api/v1/balance`: Checking user balance (DB read)
    - `GET /api/v1/sms`: Listing SMS (DB read)
- **Stages**:
    - Ramp up: 0 -> 200 VUs users in 30s.
    - Sustain: 200 VUs for 1m.
    - Ramp down to 0 in 30s.

## Thresholds
The test will fail if:
- 95th percentile request duration > 100ms.
- Error rate > 1%.
