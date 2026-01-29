# Changelog

All notable changes to NexNum are documented in this file. NexNum adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Infrastructure**: "Smart Startup" AWS Free Tier strategy with `infra/vps` setup scripts.
- **Documentation**: Consolidated 5-pillar technical library in `docs/`.
- **Security**: Fingerprinting and improved `SECURITY.md` guidance.

### Fixed
- **Build**: Fixed Next.js 16 build crashes on Windows by disabling `standalone` output on `win32`.
- **API Client**: Removed server-only `async_hooks` dependency from frontend `api-client.ts`.
- **OpenAPI**: Corrected Zod extension registration to prevent runtime `TypeError`.

---

## [1.0.0] - "Hardened Release" - 2026-01-27

This release transforms NexNum from a functional prototype to a **production-grade enterprise system**.

### 🛡️ Enterprise Security
- **Rate Limiting**: Multi-tier Redis-backed throttling for API, Auth, and Admin routes.
- **Financial Integrity**: 
    - Implemented **Two-Phase Commit** (Reserve -> Commit) purchase pattern.
    - Added `SELECT FOR UPDATE` row locking for wallet balances.
- **Security Headers**: Strict CSP, HSTS, and anti-sniffing via `middleware.ts`.

### 👁️ Advanced Observability
- **Logging**: Switched to **Pino** for structured JSON logging (Datadog/CloudWatch ready).
- **Monitoring**: Exposed Prometheus metrics at `/api/metrics`.
- **Sentry**: Full-stack error tracking for Client, Server, and Edge layers.

### ⚡ UX & Performance
- **Optimistic UI**: Instant "Reserve..." state for purchase cards and real-time wallet balance updates.
- **Resilience**: Integrated **Opossum Circuit Breakers** for all SMS provider integrations.
- **SEO**: Added JSON-LD software snippets and a high-performance dynamic sitemap.

### 🛠️ technical
- **Patterns**: Implementation of the Transactional Outbox pattern for reliable async processing.
- **Build**: Multi-stage Docker optimization for standalone production output.

---

## [0.1.0] - 2026-01-24

### Added
- Initial release of NexNum SMS activation platform.
- Multi-provider integration (Generic REST/Dynamic support).
- Admin dashboard with dynamic provider configuration.
- i18n support for 9 languages.
- MeiliSearch global search integration.
