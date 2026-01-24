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
- Dynamic provider configuration
- Health monitoring
- Smart routing
- Provider sync

### 3. Activation Service (`src/lib/activation/`)

Number lifecycle management:
- State machine (RESERVED → ACTIVE → COMPLETED)
- Poll management
- Reservation cleanup
- Outbox pattern for events

### 4. Background Workers (`src/workers/`)

- `inbox-worker.ts` - SMS polling
- `reconcile-worker.ts` - Refunds and cleanup
- `push-worker.ts` - Notifications

### 5. Wallet Service (`src/lib/wallet/`)

- Balance management
- Transaction logging
- Price optimization

## Data Flow

### Purchase Flow

```
1. User selects service/country
2. API reserves funds (atomic)
3. Provider API called
4. Number created in DB
5. Background polling starts
6. SMS received → User notified
7. Number expires → Reconcile
```

### SMS Polling Flow

```
1. Inbox worker runs every 30s
2. Fetches active numbers
3. Polls each provider
4. Deduplicates messages
5. Stores in DB
6. Sends push notification
```

## Security

- JWT authentication with refresh tokens
- CSRF protection
- Rate limiting (per-user, per-route)
- Request signing for sensitive actions
- Encrypted storage for secrets
