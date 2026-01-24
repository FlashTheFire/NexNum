<div align="center">

<!-- � Animated Header -->
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:101012,50:0F2E2E,100:C6FF00&height=200&section=header&text=NexNum&fontSize=80&fontColor=C6FF00&animation=fadeIn&fontAlignY=35&desc=Next-Generation%20Virtual%20Number%20Platform&descAlignY=55&descSize=18&descColor=ffffff" width="100%"/>

<!-- ⭐ Status Badges -->
<p>
<img src="https://img.shields.io/badge/✨_Production_Ready-C6FF00?style=for-the-badge" alt="Production"/>
<img src="https://img.shields.io/badge/🔥_Enterprise_Grade-FF6B6B?style=for-the-badge" alt="Enterprise"/>
<img src="https://img.shields.io/badge/⚡_High_Performance-3178C6?style=for-the-badge" alt="Performance"/>
</p>

<!-- 🔗 Tech Badges -->
<p>
<img src="https://img.shields.io/badge/Next.js_16-black?style=flat-square&logo=next.js&logoColor=white" alt="Next.js"/>
<img src="https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React"/>
<img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript"/>
<img src="https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white" alt="Prisma"/>
<img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
<img src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white" alt="Redis"/>
</p>

<!-- 📊 Repo Stats -->
<p>
<img src="https://img.shields.io/github/license/FlashTheFire/NexNum?style=flat-square&color=C6FF00" alt="License"/>
<img src="https://img.shields.io/github/stars/FlashTheFire/NexNum?style=flat-square&color=C6FF00" alt="Stars"/>
<img src="https://img.shields.io/badge/PRs-Welcome-C6FF00?style=flat-square" alt="PRs"/>
</p>

<!-- 🚀 Quick Actions -->
<p>
<a href="#-quick-start"><img src="https://img.shields.io/badge/🚀_Quick_Start-101012?style=for-the-badge" alt="Quick Start"/></a>
<a href="nexnum-app/docs/api-reference.md"><img src="https://img.shields.io/badge/📖_API_Docs-101012?style=for-the-badge" alt="API"/></a>
<a href="nexnum-app/docs/deployment.md"><img src="https://img.shields.io/badge/☁️_Deploy-101012?style=for-the-badge" alt="Deploy"/></a>
<a href="#-documentation"><img src="https://img.shields.io/badge/📚_Docs-101012?style=for-the-badge" alt="Docs"/></a>
</p>

<br/>

<!-- ✨ Tagline -->
**🔥 Enterprise SMS Verification • ⚡ Multi-Provider Smart Routing • 🛡️ Circuit Breaker Resilience**

</div>

<!-- 🌊 Animated Divider -->
<img src="https://user-images.githubusercontent.com/73097560/115834477-dbab4500-a447-11eb-908a-139a6edaec5c.gif" width="100%">

---

## 📋 Table of Contents

- [✨ Features](#-features)
- [🏗️ Architecture](#️-architecture)
- [🛠️ Tech Stack](#️-tech-stack)
- [📁 Project Structure](#-project-structure)
- [🚀 Quick Start](#-quick-start)
- [📊 System Overview](#-system-overview)
- [🔌 Provider Integration](#-provider-integration)
- [💳 Wallet System](#-wallet-system)
- [🎨 Design System](#-design-system)
- [📈 Monitoring](#-monitoring)
- [☁️ Production Deployment](#️-production-deployment-aws-amplify)
- [🔒 Security](#-security)
- [📚 Documentation](#-documentation)
- [📄 License](#-license)

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🎯 Core Capabilities

| Feature | Description |
|---------|-------------|
| 🔢 **Virtual Numbers** | Rent temporary phone numbers for SMS verification |
| 🌍 **Global Coverage** | 100+ countries with dynamic provider switching |
| ⚡ **Smart Routing** | Automatic failover across multiple providers |
| 🔄 **Real-time Updates** | Webhook-based instant SMS delivery |
| 💰 **Wallet System** | Secure balance management with reservations |

</td>
<td width="50%">

### 🛡️ Enterprise Features

| Feature | Description |
|---------|-------------|
| 🔐 **JWT Auth** | Secure authentication with refresh tokens |
| ⚙️ **Rate Limiting** | Redis-backed request throttling |
| 📊 **Prometheus Metrics** | Full observability stack |
| 🔌 **Dynamic Providers** | Add providers via JSON config, no code |
| 🤖 **AI Config Assistant** | Gemini-powered provider setup |

</td>
</tr>
</table>

---

## 🏗️ Architecture

```mermaid
flowchart TB
    subgraph Client["🖥️ Client Layer"]
        WEB["Next.js App Router"]
        MOBILE["Mobile-Responsive UI"]
    end
    
    subgraph API["⚡ API Layer"]
        ROUTES["API Routes"]
        MW["Middleware<br/>Auth • Rate Limit • CORS"]
        ROUTER["Smart SMS Router"]
    end
    
    subgraph Providers["🔌 Provider Layer"]
        DP["DynamicProvider Engine"]
        P1["5sim"]
        P2["GrizzlySMS"]
        P3["SMS-Activate"]
        MORE["+ More..."]
    end
    
    subgraph Data["💾 Data Layer"]
        DB[(PostgreSQL<br/>via Supabase)]
        REDIS[(Redis<br/>Rate Limits)]
        MEILISEARCH[(MeiliSearch<br/>Search Index)]
    end
    
    subgraph Jobs["⚙️ Background Jobs"]
        BOSS["pg-boss"]
        LIFECYCLE["Number Lifecycle Manager"]
    end
    
    WEB --> ROUTES
    MOBILE --> ROUTES
    ROUTES --> MW --> ROUTER
    ROUTER --> DP
    DP --> P1 & P2 & P3 & MORE
    ROUTES --> DB
    MW --> REDIS
    ROUTES --> MEILISEARCH
    LIFECYCLE --> DB
    BOSS --> LIFECYCLE
```

---

## 🛠️ Tech Stack

<div align="center">

<!-- 🎨 Visual Icons Grid -->
<table>
<tr>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=nextjs" width="48" height="48" alt="Next.js" />
<br><sub><b>Next.js 16</b></sub>
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=react" width="48" height="48" alt="React" />
<br><sub><b>React 19</b></sub>
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=ts" width="48" height="48" alt="TypeScript" />
<br><sub><b>TypeScript</b></sub>
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=tailwind" width="48" height="48" alt="Tailwind" />
<br><sub><b>Tailwind 4</b></sub>
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=prisma" width="48" height="48" alt="Prisma" />
<br><sub><b>Prisma 6</b></sub>
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=postgres" width="48" height="48" alt="PostgreSQL" />
<br><sub><b>PostgreSQL</b></sub>
</td>
</tr>
<tr>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=redis" width="48" height="48" alt="Redis" />
<br><sub><b>Redis</b></sub>
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=docker" width="48" height="48" alt="Docker" />
<br><sub><b>Docker</b></sub>
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=aws" width="48" height="48" alt="AWS" />
<br><sub><b>AWS ECS</b></sub>
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=prometheus" width="48" height="48" alt="Prometheus" />
<br><sub><b>Prometheus</b></sub>
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=sentry" width="48" height="48" alt="Sentry" />
<br><sub><b>Sentry</b></sub>
</td>
<td align="center" width="96">
<img src="https://skillicons.dev/icons?i=github" width="48" height="48" alt="GitHub" />
<br><sub><b>GitHub CI</b></sub>
</td>
</tr>
</table>

</div>

---

## 📁 Project Structure

<details open>
<summary><b>🗂️ Complete Directory Tree</b></summary>

```
nexnum-app/
├── 📂 prisma/
│   └── schema.prisma              # 🗃️ Database schema (PostgreSQL)
│
├── 📂 public/                     # 🖼️ Static assets
│
├── 📂 src/
│   ├── 📂 app/                    # ⚡ Next.js App Router
│   │   ├── 📂 admin/              # 🛡️ Admin dashboard pages
│   │   │   ├── inventory/         #    └─ Inventory management
│   │   │   ├── providers/         #    └─ Provider configuration
│   │   │   ├── settings/          #    └─ System settings
│   │   │   └── users/             #    └─ User management
│   │   │
│   │   ├── 📂 api/                # 🔌 API Routes
│   │   │   ├── admin/             #    └─ Admin endpoints
│   │   │   │   ├── ai-generate/   #        └─ AI config generator
│   │   │   │   ├── analytics/     #        └─ Dashboard analytics
│   │   │   │   ├── providers/     #        └─ Provider CRUD & sync
│   │   │   │   ├── settings/      #        └─ System configuration
│   │   │   │   └── users/         #        └─ User management
│   │   │   ├── auth/              #    └─ Authentication (login/register/refresh)
│   │   │   ├── cron/              #    └─ Scheduled job triggers
│   │   │   ├── health/            #    └─ Health check endpoints
│   │   │   ├── metrics/           #    └─ Prometheus metrics
│   │   │   ├── numbers/           #    └─ Number operations
│   │   │   │   ├── purchase/      #        └─ Buy virtual number
│   │   │   │   ├── cancel/        #        └─ Cancel activation
│   │   │   │   └── status/        #        └─ Check SMS status
│   │   │   ├── search/            #    └─ MeiliSearch integration
│   │   │   ├── wallet/            #    └─ Wallet operations
│   │   │   └── webhooks/          #    └─ Incoming SMS webhooks
│   │   │
│   │   ├── 📂 dashboard/          # 👤 User dashboard pages
│   │   │   ├── buy/               #    └─ Purchase flow
│   │   │   ├── history/           #    └─ Transaction history
│   │   │   ├── vault/             #    └─ Active numbers
│   │   │   └── wallet/            #    └─ Balance & deposits
│   │   │
│   │   ├── 📂 login/              # 🔐 Auth pages
│   │   ├── 📂 register/
│   │   ├── globals.css            # 🎨 Global styles & CSS vars
│   │   ├── layout.tsx             # 📄 Root layout
│   │   └── page.tsx               # 🏠 Landing page
│   │
│   ├── 📂 components/             # 🧩 React Components
│   │   ├── 📂 admin/              # 🛡️ Admin UI components
│   │   │   ├── AdminBackground    #    └─ Dashboard background
│   │   │   ├── AIConfigAssistant  #    └─ AI provider setup wizard
│   │   │   └── ProviderAIHub      #    └─ AI optimization panel
│   │   ├── 📂 auth/               # 🔐 Auth forms
│   │   ├── 📂 common/             # 🔧 Shared components
│   │   ├── 📂 home/               # 🏠 Landing page sections
│   │   │   ├── Hero               #    └─ Hero section
│   │   │   ├── Features           #    └─ Feature cards
│   │   │   ├── Pricing            #    └─ Pricing tiers
│   │   │   └── FAQ                #    └─ FAQ accordion
│   │   ├── 📂 layout/             # 📐 Layout components
│   │   │   ├── Navbar             #    └─ Navigation bar
│   │   │   └── Footer             #    └─ Site footer
│   │   └── 📂 ui/                 # 🎨 UI primitives (Button, Input, etc.)
│   │
│   ├── 📂 lib/                    # 📚 Core Business Logic
│   │   ├── 🔧 Core Services
│   │   │   ├── db.ts              #    └─ Prisma client
│   │   │   ├── redis.ts           #    └─ Redis connection
│   │   │   ├── logger.ts          #    └─ Structured logging
│   │   │   └── cache.ts           #    └─ SWR caching layer
│   │   │
│   │   ├── 🔐 Auth & Security
│   │   │   ├── auth.ts            #    └─ Session management
│   │   │   ├── jwt.ts             #    └─ Token generation
│   │   │   ├── ratelimit.ts       #    └─ Request throttling
│   │   │   └── validation.ts      #    └─ Input validation (Zod)
│   │   │
│   │   ├── 📱 SMS Provider Engine
│   │   │   ├── dynamic-provider.ts    #    └─ Universal provider adapter
│   │   │   ├── smart-router.ts        #    └─ Multi-provider routing
│   │   │   ├── provider-factory.ts    #    └─ Provider instantiation
│   │   │   └── provider-sync.ts       #    └─ Country/service sync
│   │   │
│   │   ├── 📂 sms-providers/      # 🔌 Provider implementations
│   │   │   ├── types.ts           #    └─ SmsProvider interface
│   │   │   └── fivesim.ts         #    └─ 5sim reference implementation
│   │   │
│   │   ├── 💰 Wallet & Transactions
│   │   │   ├── wallet.ts          #    └─ Balance operations
│   │   │   └── reservation-cleanup.ts └─ Expired reservation cleanup
│   │   │
│   │   ├── ⚙️ Background Jobs
│   │   │   ├── number-lifecycle-manager.ts  # └─ pg-boss job processor
│   │   │   └── activation-service.ts        # └─ Activation state machine
│   │   │
│   │   ├── 🔍 Search & Discovery
│   │   │   ├── search.ts          #    └─ MeiliSearch client
│   │   │   ├── country-normalizer.ts  #    └─ Country name mapping
│   │   │   └── service-normalizer.ts  #    └─ Service code mapping
│   │   │
│   │   ├── 🤖 AI Integration
│   │   │   └── gemini-pool.ts     #    └─ Gemini API key rotation
│   │   │
│   │   └── 📊 Observability
│   │       └── metrics.ts         #    └─ Prometheus counters/gauges
│   │
│   ├── 📂 hooks/                  # 🪝 React Hooks
│   ├── 📂 stores/                 # 🗄️ Zustand state stores
│   ├── 📂 types/                  # 📝 TypeScript types
│   ├── middleware.ts              # 🛡️ Edge middleware (auth, rate limit)
│   └── instrumentation.ts         # 📡 Sentry & pg-boss init
│
├── 📄 .env                        # 🔒 Environment variables
├── 📄 Dockerfile                  # 🐳 Container build (optional)
├── 📄 docker-compose.yml          # 🐳 Local development stack
├── 📄 package.json                # 📦 Dependencies
└── 📄 tsconfig.json               # ⚙️ TypeScript config
```

</details>

---

## 🚀 Quick Start

```bash
# 1️⃣ Clone the repository
git clone https://github.com/FlashTheFire/NexNum.git
cd NexNum/nexnum-app

# 2️⃣ Install dependencies
npm install

# 3️⃣ Setup environment variables
cp .env.example .env
# Edit .env with your database URL, API keys, etc.

# 4️⃣ Generate Prisma client & push schema
npx prisma generate
npx prisma db push

# 5️⃣ Start development server (Turbopack)
npm run dev
```

<details>
<summary>📦 <b>Production Build</b></summary>

```bash
# Build optimized production bundle
npm run build

# Start production server
npm start
```

</details>

<details>
<summary>🐳 <b>Docker Deployment</b></summary>

```bash
# Build Docker image
docker build -t nexnum-app .

# Run container
docker run -p 3000:3000 --env-file .env nexnum-app
```

</details>

---

## 📊 System Overview

```mermaid
sequenceDiagram
    participant U as 👤 User
    participant API as ⚡ NexNum API
    participant W as 💰 Wallet
    participant R as 🔀 Smart Router
    participant P as 🔌 Provider

    U->>API: POST /api/numbers/purchase
    API->>W: Reserve Balance
    W-->>API: ✅ Reserved
    API->>R: getNumber(country, service)
    
    loop Try Providers
        R->>P: Request Number
        alt Success
            P-->>R: ✅ Number + Activation ID
            R-->>API: Return Result
        else No Numbers
            R->>R: Try Next Provider
        end
    end
    
    API->>W: Commit Transaction
    API-->>U: 📱 Number Details
```

---

## 🔌 Provider Integration

### Dynamic Provider Engine

NexNum uses a **code-free provider integration** system. Add any SMS provider with just JSON configuration:

```json
{
  "name": "my-provider",
  "apiBaseUrl": "https://api.provider.com/v1",
  "authType": "query_param",
  "authQueryParam": "api_key",
  
  "endpoints": {
    "getNumber": {
      "method": "GET",
      "path": "/buy",
      "queryParams": {
        "country": "$country",
        "service": "$service"
      }
    }
  },
  
  "mappings": {
    "getNumber": {
      "type": "text_regex",
      "regex": "ACCESS_NUMBER:(?<id>\\d+):(?<phone>\\d+)",
      "fields": {
        "activationId": "id",
        "phoneNumber": "phone"
      },
      "errors": {
        "patterns": {
          "NO_NUMBERS": "NO_NUMBERS",
          "NO_BALANCE": "not enough balance"
        }
      }
    }
  }
}
```

### 🤖 AI-Powered Configuration

Use the **Gemini AI Assistant** to auto-generate provider configs from API documentation:

| Mode | Description |
|------|-------------|
| 🧠 **Optimization** | Analyze full docs, fill missing endpoints |
| ⚡ **Endpoint** | Generate single endpoint config |
| 🐛 **Debugger** | Fix broken mappings from error traces |

---

## 💳 Wallet System

```mermaid
stateDiagram-v2
    [*] --> Available: User Deposit
    Available --> Reserved: Purchase Request
    Reserved --> Committed: Number Acquired
    Reserved --> Available: Purchase Failed (Rollback)
    Committed --> [*]: Transaction Complete
```

| Transaction Type | Description |
|-----------------|-------------|
| `DEPOSIT` | Add funds via payment gateway |
| `PURCHASE` | Deduct for number rental |
| `REFUND` | Return unused reservation |
| `PENALTY` | Anti-fraud deduction |

---

## 🎨 Design System

<table>
<tr>
<td>

### 🎨 Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| ⚫ **Charcoal** | `#101012` | Background |
| 🟢 **Neon Lime** | `#C6FF00` | Primary accent |
| 🔵 **Deep Teal** | `#0F2E2E` | Gradients |
| ⚪ **Frost** | `#FFFFFF10` | Glass effects |

</td>
<td>

### ✨ Visual Effects

- 🌫️ **Glassmorphism** - Frosted glass cards
- 🌀 **Radial Gradients** - Atmospheric depth
- 📽️ **Cinematic Vignette** - Focus attention
- 🔮 **Micro-animations** - Premium feel

</td>
</tr>
</table>

---

## 📈 Monitoring & Admin Dashboards

<div align="center">

### 🖥️ Admin Dashboard Features

</div>

<table>
<tr>
<td width="50%" valign="top">

#### 📊 Real-Time Analytics
- 📈 **Live Charts** — SMS usage, revenue trends
- 🌍 **Global Map** — Provider coverage visualization
- ⚡ **Active Numbers** — Real-time rental tracking
- 💰 **Revenue Metrics** — Daily/weekly/monthly stats

</td>
<td width="50%" valign="top">

#### 🛠️ Management Tools
- 👥 **User Management** — Ban, verify, adjust balance
- 🔌 **Provider Control** — Enable/disable, sync data
- ⚙️ **System Settings** — Margins, limits, features
- 🔍 **Inventory Search** — MeiliSearch-powered

</td>
</tr>
</table>

---

### 📡 Prometheus Metrics

<div align="center">

| Metric | Type | Description |
|:-------|:----:|:------------|
| `nexnum_http_requests_total` | 📊 Counter | Total HTTP requests by endpoint |
| `nexnum_provider_requests_total` | 📊 Counter | Provider API calls by provider |
| `nexnum_wallet_transactions_total` | 📊 Counter | Wallet operations by type |
| `nexnum_active_numbers` | 📈 Gauge | Currently active rentals |
| `nexnum_provider_latency` | 📉 Histogram | Provider response times (P50/P95/P99) |

</div>

---

### 🏥 Health Endpoints

```bash
GET /api/health          # ✅ Basic health check (for load balancers)
GET /api/health/ready    # ✅ Readiness probe (DB + Redis connected)
GET /api/health/detailed # 📊 Full system status (admin only)
GET /api/metrics         # 📈 Prometheus metrics endpoint
```

---

### 🔔 Alerting (CloudWatch)

| Alert | Trigger | Action |
|:------|:--------|:-------|
| 🔴 **High Error Rate** | >1% errors in 5min | SNS notification |
| 🟠 **High Latency** | P99 >5s for 3 periods | Scale up / investigate |
| 🟡 **Low Balance** | Provider balance <$10 | Email admin |

---

## ☁️ Production Deployment (AWS Amplify)

NexNum is optimized for **AWS Amplify** - the recommended deployment platform for Next.js applications.

### Why AWS Amplify?

| Feature | Benefit |
|---------|---------|
| ✅ **Native Next.js 16 Support** | SSR, API routes, Image optimization |
| ✅ **Free Tier (12 months)** | $100 credits + always-free Lambda |
| ✅ **Commercial Use Allowed** | Unlike Vercel Hobby plan |
| ✅ **Auto CI/CD** | Deploy on every GitHub push |
| ✅ **Global CDN** | CloudFront included |

### Production Stack (FREE Tier)

```
┌─────────────────────────────────────────────────────────┐
│                   NexNum Production                     │
├─────────────────────────────────────────────────────────┤
│  ☁️  AWS Amplify    → Next.js hosting           (FREE) │
│  🗃️  Supabase       → PostgreSQL database       (FREE) │
│  ⚡  Redis          → Cache (Docker)            (FREE) │
│  📧  Resend         → Transactional emails      (FREE) │
│  🔍  MeiliSearch    → Search (Docker)           (FREE) │
├─────────────────────────────────────────────────────────┤
│  💰 TOTAL: $0/month                                     │
└─────────────────────────────────────────────────────────┘
```

### Quick Deploy to AWS

```bash
# 1️⃣ Install Amplify CLI
npm install -g @aws-amplify/cli

# 2️⃣ Configure AWS credentials
amplify configure

# 3️⃣ Initialize Amplify in your project
amplify init

# 4️⃣ Add hosting
amplify add hosting
# Select: Hosting with Amplify Console
# Select: Continuous deployment

# 5️⃣ Deploy
amplify publish
```

### Environment Variables (AWS Console)

Set these in **Amplify Console → App Settings → Environment Variables**:

```env
DATABASE_URL=postgresql://user:pass@host:5432/db
DIRECT_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://default:xxx@xxx.upstash.io:6379
JWT_SECRET=your-secret-key
NEXT_PUBLIC_API_URL=https://your-app.amplifyapp.com
```

### Alternative: Docker Deployment

For VPS or self-hosted environments:

```bash
# Build image
docker build -t nexnum-app .

# Run with env file
docker run -p 3000:3000 --env-file .env nexnum-app
```

---

## 🔒 Security

- ✅ **JWT Authentication** with HTTP-only refresh tokens
- ✅ **Rate Limiting** - Redis-backed request throttling
- ✅ **CORS Protection** - Configurable origins
- ✅ **CSP Headers** - Content Security Policy
- ✅ **Input Validation** - Zod schema validation
- ✅ **SQL Injection Protection** - Prisma ORM

---

## 📚 Documentation

<div align="center">

### 📖 Knowledge Base

*Everything you need to build, deploy, and scale NexNum*

</div>

<table>
<tr>
<td width="50%">

#### 🏗️ Architecture & Design
| Doc | Description |
|-----|-------------|
| [� Architecture](nexnum-app/docs/architecture.md) | System design & data flow |
| [🔌 API Reference](nexnum-app/docs/api-reference.md) | All endpoints & examples |
| [⚙️ Env Variables](nexnum-app/docs/env-reference.md) | 47+ config options |

</td>
<td width="50%">

#### 🚀 Operations & Deployment
| Doc | Description |
|-----|-------------|
| [☁️ Deployment](nexnum-app/docs/deployment.md) | AWS/Docker deploy guide |
| [🔑 Secrets](nexnum-app/docs/secret-manager-migration.md) | Secret manager setup |
| [✅ Release](nexnum-app/docs/release-checklist.md) | Pre-release checklist |

</td>
</tr>
<tr>
<td width="50%">

#### 🔒 Security & Performance
| Doc | Description |
|-----|-------------|
| [🛡️ Security Audit](nexnum-app/docs/security-audit.md) | Auth, rate limits, audit |
| [⚡ Performance](nexnum-app/docs/performance-guide.md) | Caching & optimization |

</td>
<td width="50%">

#### 👥 Contributing
| Doc | Description |
|-----|-------------|
| [🤝 Contributing](nexnum-app/CONTRIBUTING.md) | Setup & PR process |
| [📝 Changelog](nexnum-app/CHANGELOG.md) | Version history |
| [👮 Code Owners](nexnum-app/CODEOWNERS) | Team ownership |

</td>
</tr>
</table>

<details>
<summary><b>📁 Configuration Files</b></summary>

Central configuration lives in `nexnum-app/src/config/`:

| File | Purpose |
|------|---------|
| `app.config.ts` | Limits, timeouts, workers, features |
| `providers.config.ts` | SMS provider settings |
| `env.schema.ts` | Zod validation for all env vars |

</details>

---

## 📄 License

<div align="center">

<!-- 🌊 Footer Wave -->
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:101012,50:0F2E2E,100:C6FF00&height=120&section=footer" width="100%"/>

<br/>

**MIT License** © 2024-2026 NexNum

<br/>

Built with 💚 by [**FlashTheFire**](https://github.com/FlashTheFire)

<br/>

<!-- 🔗 Social Links -->
<a href="https://github.com/FlashTheFire/NexNum">
<img src="https://img.shields.io/badge/⭐_Star_This_Repo-C6FF00?style=for-the-badge&logo=github&logoColor=black" alt="Star"/>
</a>
<a href="https://github.com/FlashTheFire/NexNum/fork">
<img src="https://img.shields.io/badge/🍴_Fork-101012?style=for-the-badge&logo=github&logoColor=white" alt="Fork"/>
</a>
<a href="https://github.com/FlashTheFire">
<img src="https://img.shields.io/badge/👤_Follow-101012?style=for-the-badge&logo=github&logoColor=white" alt="Follow"/>
</a>

<br/><br/>

<sub>🚀 If NexNum helps you, consider giving it a ⭐ — it means a lot!</sub>

</div>
