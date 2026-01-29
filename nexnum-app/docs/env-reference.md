# Environment Variables Reference

Complete reference for all environment variables in NexNum.

## Required (All Environments)

| Variable | Type | Description |
|----------|------|-------------|
| `DATABASE_URL` | string | PostgreSQL connection string with pooling |
| `REDIS_URL` | string | Redis connection URL |
| `JWT_SECRET` | string (min 32 chars) | Secret for JWT signing |

## Required (Production Only)

| Variable | Type | Description |
|----------|------|-------------|
| `MEILISEARCH_API_KEY` | string | MeiliSearch master key |
| `ENCRYPTION_KEY` | string (min 32 chars) | Key for sensitive data encryption |
| `CRON_SECRET` | string | Secret for cron endpoint auth |

## Infrastructure

| Variable | Default | Description |
|----------|---------|-------------|
| `DIRECT_URL` | - | Direct PostgreSQL URL (no pooling) |
| `MEILISEARCH_HOST` | `http://localhost:7700` | MeiliSearch server URL |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Public app URL |

## SMS Providers

### Provider Selection

| Variable | Default | Description |
|----------|---------|-------------|
| `SMS_PROVIDER` | `herosms` | Default SMS provider |



### Provider URLs

| Variable | Default |
|----------|---------|
| `HERO_SMS_API_URL` | `https://herosms.one/stubs/handler_api.php` |
| `GRIZZLYSMS_API_URL` | `https://api.grizzlysms.com/stubs/handler_api.php` |
| `SMSBOWER_API_URL` | `https://smsbower.com/api` |
| `FIVESIM_API_URL` | `https://5sim.net/v1` |
| `ONLINESIM_API_URL` | `https://onlinesim.io/api` |

## Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `DAILY_SPEND_LIMIT` | `100` | Max daily spend per user (USD) |
| `MAX_PURCHASE_AMOUNT` | `50` | Max single purchase (USD) |
| `MIN_PURCHASE_AMOUNT` | `0.01` | Min purchase amount (USD) |
| `MAX_ACTIVE_NUMBERS` | `10` | Max concurrent numbers per user |
| `MAX_SMS_PER_ACTIVATION` | `5` | Max SMS per number |

## Timeouts (milliseconds)

| Variable | Default | Description |
|----------|---------|-------------|
| `RESERVATION_TTL_MS` | `300000` (5 min) | Number reservation timeout |
| `MIN_REFUND_AGE_MS` | `120000` (2 min) | Min age before refund eligible |
| `STUCK_THRESHOLD_MS` | `600000` (10 min) | Threshold for stuck detection |
| `PROVIDER_TIMEOUT_MS` | `15000` (15 sec) | Provider API timeout |
| `NUMBER_LIFETIME_MS` | `1200000` (20 min) | Default number lifetime |
| `GRACE_PERIOD_MS` | `60000` (1 min) | Grace period after expiry |

## Workers

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_BATCH_SIZE` | `50` | Items per worker batch |
| `WORKER_CONCURRENCY` | `10` | Concurrent operations |
| `POLL_INTERVAL_MS` | `30000` (30 sec) | SMS polling interval |
| `RECONCILE_INTERVAL_MS` | `60000` (1 min) | Reconcile worker interval |
| `CLEANUP_INTERVAL_MS` | `120000` (2 min) | Cleanup worker interval |

## Feature Flags

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_MOCK_PROVIDER` | `false` | Enable mock SMS provider |
| `DEBUG` | `false` | Enable debug logging |
| `MAINTENANCE_MODE` | `false` | Enable maintenance mode |
| `ENABLE_SMS_FINGERPRINTING` | `true` | Enable SMS deduplication |
| `ENABLE_HEALTH_MONITORING` | `true` | Enable provider health checks |

## Pricing

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_MARKUP_PERCENT` | `20` | Default price markup |
| `MIN_PRICE_USD` | `0.10` | Minimum price |
| `MAX_PRICE_USD` | `50.00` | Maximum price |
| `PRICE_PRECISION` | `2` | Decimal places |

## Security

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window |
| `RATE_LIMIT_MAX` | `100` | Max requests per window |
| `CSRF_SECRET` | - | CSRF token secret |
| `HCAPTCHA_SECRET` | - | hCaptcha secret key |
| `NEXT_PUBLIC_HCAPTCHA_SITEKEY` | - | hCaptcha site key |

## Monitoring

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | Sentry error reporting DSN |
| `NEXT_PUBLIC_SENTRY_DSN` | Client-side Sentry DSN |
| `SENTRY_ORG` | Sentry organization |
| `SENTRY_PROJECT` | Sentry project |
| `SENTRY_AUTH_TOKEN` | Sentry auth token |

## Email

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP Host (e.g. smtp.gmail.com) |
| `SMTP_PORT` | SMTP Port (587 or 465) |
| `SMTP_USER` | SMTP Username/Email |
| `SMTP_PASS` | SMTP Password (App Password) |
| `FROM_EMAIL` | Default sender address |

## Push Notifications

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key |
| `VAPID_PRIVATE_KEY` | VAPID private key |
| `VAPID_SUBJECT` | VAPID subject (email) |

## OAuth

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

## AI

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEYS` | Comma-separated Gemini API keys |
