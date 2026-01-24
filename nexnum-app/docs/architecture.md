# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Web App     │  │  Admin Panel │  │  External API (v1)   │  │
│  │  (Next.js)   │  │  (React)     │  │  (REST)              │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API Layer (Next.js)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Auth Routes  │  │ Number Routes│  │ Admin Routes         │  │
│  │ /api/auth/*  │  │ /api/numbers │  │ /api/admin/*         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Business Logic Layer                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Wallet      │  │ Activation  │  │ SMS Providers           │ │
│  │ Service     │  │ Service     │  │ (5sim, HeroSMS, ...)    │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Data Layer                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ PostgreSQL   │  │ Redis        │  │ MeiliSearch          │  │
│  │ (Prisma)     │  │ (Cache/Queue)│  │ (Search)             │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Configuration (`src/config/`)

Centralized configuration with Zod schema validation:
- `app.config.ts` - Limits, timeouts, workers, features
- `providers.config.ts` - SMS provider settings
- `env.schema.ts` - Strict environment validation
- `env.validation.ts` - Runtime validation

### 2. SMS Providers (`src/lib/sms-providers/`)

Unified interface for multiple SMS providers:
- **Dynamic Provider**: Config-driven provider engine.
- **Smart Routing 2.0**: 
  - Circuit Breaker pattern (Opossum)
  - Automatic Failover (on `NO_NUMBERS`, `NO_BALANCE`, `RATE_LIMITED`)
  - Weighted Selection (Priority + Admin Weight / Cost * Latency)
- **Distributed Caching**: Redis-backed configuration sync (`cache:providers:active:config`).

### 3. Activation Service (`src/lib/activation/`)

Number lifecycle management:
- State machine (RESERVED → ACTIVE → COMPLETED)
- Poll management
- Reservation cleanup
- Outbox pattern for events

### 4. Background Workers (Unified)

Single-process orchestration via `src/worker-entry.ts`.
Scales horizontally on Kubernetes/Docker.

- **Master Worker Loop**: Orchestrates all sub-tasks in priority order.
  1. **Activation Outbox**: Processes new number orders.
  2. **Inbox Polling**: Polls providers for SMS (Adaptive Strategy).
  3. **Push Notifications**: Sends WebHooks/Telegram alerts.
  4. **Cleanup**: Releases expired reservations.
  5. **Reconciliation**: Auto-fixes stuck states.

### 5. Wallet Service (`src/lib/wallet/`)

- **Concurrency Hardening**: Uses `SELECT FOR UPDATE` within explicit Transactions.
- Balance management
- Transaction logging
- Price optimization

## Data Flow

### Purchase Flow

```
1. User selects service/country
2. API reserves funds (atomic DB lock)
3. SmartRouter selects best healthy provider
4. Rate Limiter (Redis) checks global quota
5. Provider API called
6. Number created in DB
7. Background polling starts
```

### SMS Polling Flow

```
1. Unified Worker runs Master Loop
2. Fetches active numbers
3. Polls each provider (batched if supported)
4. Deduplicates messages
5. Stores in DB
6. Enqueues Push Notification
```

## Security

- JWT authentication with refresh tokens
- CSRF protection
- **Admin API Validation**: Strict Zod schemas for configuration updates.
- Rate limiting (per-user, per-route)
- Request signing for sensitive actions
- Encrypted storage for secrets
