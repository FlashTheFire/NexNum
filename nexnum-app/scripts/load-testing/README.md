# Load Testing

This directory contains k6 load testing scripts to verify system performance and stability.

## Prerequisites

- [Docker](https://www.docker.com/) (Recommended)
- OR [k6](https://k6.io/docs/get-started/installation/) installed locally.

## Running Tests

### Using Docker (Recommended)

Run the following command from the project root:

```bash
npm run test:load
```

This will:
1.  Verify `API_KEY` is set in your `.env`.
2.  Run the `public-api.js` scenario using the `grafana/k6` docker image.
3.  Target `http://host.docker.internal:3000` (your local running Next.js server).

### Running Manually (Local k6)

```bash
k6 run -e API_KEY=your_key_here scripts/load-testing/scenarios/public-api.js
```

## Scenarios

### `public-api.js`
- **Target**: `/api/v1/numbers`, `/api/v1/balance`, `/api/v1/sms`
- **Load**: 200 Virtual Users (VUs)
- **Duration**: ~2 minutes
- **Thresholds**: 95th percentile latency < 100ms.

## Troubleshooting

- **Connection Refused**: Ensure your Next.js app is running on port 3000.
- **401 Unauthorized**: Ensure `API_KEY` in `.env` is valid and belongs to an active user.
