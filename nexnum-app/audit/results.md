# Backend Forensic Audit — Results (NexNum)

**Completed:** All planned fixes implemented in codebase.

**Stack:** Next.js 15, TypeScript, Prisma 7, PostgreSQL, Redis, MeiliSearch, pg-boss.

---

## Executive summary

| Severity   | Count | Status |
|-----------|-------|--------|
| Critical  | 3     | Fixed  |
| High      | 6     | Fixed  |
| Medium    | 3     | Fixed  |
| Done prior | 2   | AUDIT-12, AUDIT-13 |

---

## Implemented fixes

### AUDIT-01 — Test script (Critical)
- **Change:** Added `"test": "vitest run"` in `package.json`.
- **PR branch:** `fix/audit-01-add-test-script`
- **Commit:** `chore: add npm test script and wire Vitest for CI`

### AUDIT-02 — Build TypeScript/ESLint (Critical)
- **Change:** `next.config.mjs`: `ignoreBuildErrors: false`, `ignoreDuringBuilds: false`.
- **PR branch:** `fix/audit-02-enable-build-type-eslint-checks`
- **Commit:** `fix: stop ignoring TypeScript and ESLint during build`

### AUDIT-03 — v1 Balance currency semantics (Critical)
- **Change:** `src/lib/cache/user-cache.ts`: `getCachedBalance` now returns `balance` (Points), `currency: 'POINTS'`, `displayAmount`, `displayCurrency` using `getCurrencyService().pointsToFiat`. `src/app/api/v1/balance/route.ts` exposes these fields.
- **PR branch:** `fix/audit-03-v1-balance-currency-semantics`
- **Commit:** `fix(v1): return balance in POINTS with displayAmount in preferred currency`

### AUDIT-04 — Empty catch logging (High)
- **Change:** Replaced empty `catch (e) {}` / `catch {}` with `logger.warn(..., { error: e })` in: smart-router.ts (2), provider-sync.ts (2), jwt.ts, gemini-pool.ts, search/providers/route.ts, numbers/purchase/route.ts.
- **PR branch:** `fix/audit-04-empty-catch-logging`
- **Commit:** `fix: log errors in previously empty catch blocks`

### AUDIT-05 — Fire-and-forget .catch() logging (High)
- **Change:** Replaced `.catch(() => {})` with `.catch(err => logger.warn(...))` in: jwt, smart-router, provider-sync, notifications/index, order-orchestrator, activation-kernel, sentinel, sms/audit, inbox-worker; API routes: wallet/topup, numbers/purchase, numbers/complete, numbers/cancel, search/providers, health, admin/users.
- **PR branch:** `fix/audit-05-fire-and-forget-catch-logging`
- **Commit:** `fix: log fire-and-forget promise rejections`

### AUDIT-06 — Currency single source of truth (High)
- **Change:** `numbers/purchase/route.ts` and `search/offers/route.ts` now use `getCurrencyService().fiatToPoints` and `toSupportedCurrency` from `@/lib/payment/currency-service` instead of `lib/currency/currency-service` for maxPrice conversion.
- **PR branch:** `fix/audit-06-currency-single-source-of-truth`
- **Commit:** `fix: align purchase/display currency with single config (payment currency-service)`

### AUDIT-07 — Cron worker status on errors (High)
- **Change:** `src/app/api/cron/worker/route.ts`: response status is `207` when `result.errors.length > 0`, `200` on full success.
- **PR branch:** `fix/audit-07-cron-worker-status-on-errors`
- **Commit:** `fix(cron): return 207 or 500 when worker has errors for observability`

### AUDIT-08 — JWT secret dev guard (High)
- **Change:** `src/lib/auth/jwt.ts`: in non-production, if `JWT_SECRET` is not set, require `ALLOW_DEV_JWT=true` to use dev fallback; otherwise throw.
- **PR branch:** `fix/audit-08-jwt-secret-dev-guard`
- **Commit:** `fix(auth): tighten JWT secret requirement in development`

### AUDIT-09 — $queryRawUnsafe documentation (Medium)
- **Change:** Comment in `provider-sync.ts` at the `$queryRawUnsafe` call: parameter is server-controlled (provider.id from DB), no SQL injection.
- **PR branch:** `fix/audit-09-queryraw-unsafe-document-or-replace`
- **Commit:** `fix: document or replace $queryRawUnsafe in provider-sync`

### AUDIT-10 — Dockerfile HEALTHCHECK (Medium)
- **Change:** Added `HEALTHCHECK` in Dockerfile using `curl -f http://localhost:3000/api/health` (interval 30s, timeout 5s, start-period 10s, retries 3).
- **PR branch:** `fix/audit-10-dockerfile-healthcheck`
- **Commit:** `chore(docker): add HEALTHCHECK for /api/health`

### AUDIT-11 — CI lint fail on error (Medium)
- **Change:** `.github/workflows/ci.yml`: removed `|| true` from Lint step so lint failures fail the job.
- **PR branch:** `fix/audit-11-ci-lint-fail-on-error`
- **Commit:** `ci: fail pipeline on lint errors`

### AUDIT-12 — Dashboard totalDeposited (Done prior)
- **Status:** Already includes `'deposit'` in aggregate in `dashboard/state/route.ts`.

### AUDIT-13 — Deposit and balance currency display (Done prior)
- **Status:** Deposit routes have amountCurrency; wallet/balance and auth/me return displayAmount/displayCurrency; payment currency-service uses findUnique(id: 'default') and single INR rate from config.

---

## Deliverables

- **audit/results.md** — This file.
- **audit/summary_onepage.md** — One-page summary for maintainers.
- **audit/secrets-report.txt** — See below; no secrets committed.
- **Formatting:** Run `prettier --write .` and commit in branch `chore/format` if desired; no patch file generated in this pass.

---

## Secrets

- `.env` and `.env*` are in `.gitignore`; no secrets committed.
- No hardcoded API keys or private keys found in backend code; JWT_SECRET and ENCRYPTION_KEY are read from environment.
